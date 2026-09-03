<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePublicBookingCheckoutRequest;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\User;
use App\Services\BookingCartValidator;
use App\Services\BookingCheckoutIntentService;
use App\Services\BookingCheckoutSchema;
use App\Services\BookingInventoryService;
use App\Services\BookingOrderExpiryService;
use App\Services\BookingPriceCalculator;
use App\Services\BookingSlotMerger;
use App\Services\Payments\PaymentChannelRegistry;
use App\Services\Payments\PaymentRecoveryService;
use Illuminate\Contracts\Database\ConcurrencyErrorDetector;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class PublicCheckoutController extends Controller
{
    public function __construct(
        private readonly BookingCartValidator $cartValidator,
        private readonly BookingCheckoutIntentService $checkoutIntentService,
        private readonly BookingInventoryService $inventoryService,
        private readonly BookingSlotMerger $slotMerger,
        private readonly BookingPriceCalculator $priceCalculator,
        private readonly BookingOrderExpiryService $expiryService,
        private readonly PaymentRecoveryService $paymentRecovery,
        private readonly PaymentChannelRegistry $paymentChannels,
    ) {}

    public function store(StorePublicBookingCheckoutRequest $request): RedirectResponse
    {
        $data = $request->validated();

        /** @var User $requestUser */
        $requestUser = $request->user();

        // Do not consume scarce inventory when production has no callable
        // payment channel. This check deliberately happens before recovery,
        // locking, or any write so an unavailable gateway cannot be abused to
        // create unpaid holds that other customers cannot book.
        $this->paymentChannels->assertBookingCheckoutAvailable();

        $this->paymentRecovery->recoverForUser((int) $requestUser->id);
        $fingerprint = $this->checkoutIntentService->fingerprint(
            (int) $requestUser->id,
            $data['items'],
        );
        $this->inventoryService->prepareWriteTransactionIsolation();

        try {
            $result = DB::transaction(function () use (
                $data,
                $requestUser,
                $fingerprint,
            ): array {
                /** @var User $user */
                $user = User::query()
                    ->whereKey($requestUser->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $existing = $this->checkoutIntentService->resolveExisting(
                    (int) $user->id,
                    (string) $data['idempotency_key'],
                    $fingerprint,
                );

                if ($existing) {
                    return ['order' => $existing, 'replayed' => true];
                }

                $this->checkoutIntentService->assertOpenHoldLimit((int) $user->id);

                $hasVerifiedCampusIdentity = $user->identity_category === 'warga_kampus'
                    && $user->identity_status === 'verified'
                    && is_string($user->identity_number)
                    && preg_match('/^[0-9]{6,30}$/', $user->identity_number);
                $identityCategory = $hasVerifiedCampusIdentity ? 'warga_ub' : 'umum';
                $identityNumber = $hasVerifiedCampusIdentity
                    ? $user->identity_number
                    : null;
                $customerName = mb_substr(trim((string) $user->name), 0, 255);
                if (mb_strlen($customerName) < 2) {
                    $customerName = 'Pengguna UBSC';
                }
                $whatsappNumber = $this->normalizedProfilePhone($user->phone_number);

                $facilityIds = collect($data['items'])
                    ->pluck('facility_id')
                    ->map(fn (mixed $facilityId): int => (int) $facilityId)
                    ->unique()
                    ->sort()
                    ->values();
                $unitIds = collect($data['items'])
                    ->pluck('facility_unit_id')
                    ->filter()
                    ->map(fn (mixed $unitId): int => (int) $unitId)
                    ->unique()
                    ->sort()
                    ->values();
                $lockedResources = $this->inventoryService->lockResources($facilityIds, $unitIds);
                $this->inventoryService->lockSchedulePolicies(
                    collect($data['items'])->pluck('booking_date'),
                );

                $validatedSlots = $this->cartValidator->validate($data['items']);
                foreach ($validatedSlots as $index => $slot) {
                    $facility = $lockedResources['facilities']->get((int) $slot['facility_id']);
                    $unit = ! empty($slot['facility_unit_id'])
                        ? $lockedResources['units']->get((int) $slot['facility_unit_id'])
                        : null;

                    if (! $facility) {
                        throw ValidationException::withMessages([
                            "items.{$index}.facility_id" => 'Fasilitas reservasi tidak lagi tersedia.',
                        ]);
                    }

                    $this->inventoryService->assertAvailable(
                        $facility,
                        $unit,
                        (string) $slot['booking_date'],
                        (string) $slot['start_time'],
                        (string) $slot['end_time'],
                        1,
                        [],
                        "items.{$index}.start_time",
                    );
                }

                $mergedSlots = $this->slotMerger->merge($validatedSlots);
                $pricing = $this->priceCalculator->calculate(
                    $mergedSlots,
                    $identityCategory,
                    $identityNumber,
                );
                $earliestStart = collect($pricing['slots'])
                    ->map(fn (array $slot) => Carbon::createFromFormat(
                        'Y-m-d H:i',
                        $slot['booking_date'].' '.$slot['start_time'],
                        config('app.timezone'),
                    ))
                    ->sort()
                    ->first();
                $paymentWindowMinutes = max(
                    5,
                    min(120, (int) config('services.payment.hold_minutes', 15)),
                );
                $paymentDeadline = now()->addMinutes($paymentWindowMinutes);

                if ($earliestStart && $earliestStart->lessThan($paymentDeadline)) {
                    $paymentDeadline = $earliestStart;
                }

                if ($paymentDeadline->lessThanOrEqualTo(now())) {
                    throw ValidationException::withMessages([
                        'items.0.start_time' => 'Jadwal dimulai sebelum pembayaran dapat diselesaikan. Pilih waktu lain.',
                    ]);
                }

                /** @var BookingOrder $order */
                $order = BookingOrder::create([
                    'user_id' => $user->id,
                    'idempotency_key' => $data['idempotency_key'],
                    'request_fingerprint' => $fingerprint,
                    'currency' => strtoupper((string) config('services.payment.currency', 'IDR')),
                    'terms_version' => (string) config('services.payment.terms_version', 'booking-terms-2026-08'),
                    'customer_name' => $customerName,
                    'whatsapp_number' => $whatsappNumber,
                    'identity_category' => $identityCategory,
                    'identity_number' => $identityCategory === 'warga_ub'
                        ? $identityNumber
                        : null,
                    'subtotal_amount' => $pricing['subtotal_amount'],
                    'transaction_fee' => $pricing['transaction_fee'],
                    'discount_amount' => $pricing['discount_amount'],
                    'total_amount' => $pricing['total_amount'],
                    'status' => 'pending_payment',
                    'notes' => null,
                    'expires_at' => $paymentDeadline,
                ]);

                $snapshotItems = [];
                $createdBookings = collect();
                foreach ($pricing['slots'] as $slot) {
                    $booking = $order->bookings()->create([
                        'user_id' => $user->id,
                        'customer_name' => $order->customer_name,
                        'customer_phone' => $order->whatsapp_number,
                        'facility_id' => (int) $slot['facility_id'],
                        'facility_unit_id' => $slot['facility_unit_id'] ?? null,
                        'booking_date' => (string) $slot['booking_date'],
                        'start_time' => (string) $slot['start_time'],
                        'end_time' => (string) $slot['end_time'],
                        'pax' => 1,
                        'subtotal_price' => (int) $slot['subtotal_price'],
                        'status' => 'pending',
                        'notes' => $order->notes,
                    ]);
                    $createdBookings->push($booking);

                    $startsAt = Carbon::createFromFormat(
                        'Y-m-d H:i',
                        $slot['booking_date'].' '.$slot['start_time'],
                        config('app.timezone'),
                    );
                    $endsAt = Carbon::createFromFormat(
                        'Y-m-d H:i',
                        $slot['booking_date'].' '.$slot['end_time'],
                        config('app.timezone'),
                    );

                    $snapshotItems[] = [
                        'booking_id' => $booking->id,
                        'kind' => $slot['kind'] ?? 'facility',
                        'facility_id' => (int) $slot['facility_id'],
                        'facility_name' => $slot['facility_name'] ?? null,
                        'image_url' => $slot['image_url'] ?? null,
                        'facility_unit_id' => $slot['facility_unit_id'] ?? null,
                        'facility_unit_name' => $slot['facility_unit_name'] ?? null,
                        'category_name' => $slot['category_name'] ?? null,
                        'location' => $slot['location'] ?? null,
                        'booking_date' => (string) $slot['booking_date'],
                        'start_time' => (string) $slot['start_time'],
                        'end_time' => (string) $slot['end_time'],
                        'starts_at' => $startsAt->toIso8601String(),
                        'ends_at' => $endsAt->toIso8601String(),
                        'duration_minutes' => $startsAt->diffInMinutes($endsAt),
                        'subtotal' => (int) $slot['subtotal_price'],
                        'source_pricing' => $slot['source_pricing'] ?? [],
                    ];
                }

                $this->inventoryService->assertPersistedBookingsWithinCapacity(
                    $createdBookings,
                    $lockedResources['facilities'],
                    $lockedResources['units'],
                );

                $order->transaction()->create([
                    'user_id' => $user->id,
                    'amount' => $order->total_amount,
                    'payment_status' => 'UNPAID',
                    'checkout_url' => route('checkout.booking.show', $order),
                    'service_snapshot' => [
                        'version' => 1,
                        'kind' => 'booking_order',
                        'currency' => $order->currency,
                        'terms_version' => $order->terms_version,
                        'pricing' => [
                            'subtotal_amount' => (int) $order->subtotal_amount,
                            'discount_amount' => (int) $order->discount_amount,
                            'tax_amount' => 0,
                            'transaction_fee' => (int) $order->transaction_fee,
                            'total_amount' => (int) $order->total_amount,
                        ],
                        'items' => $snapshotItems,
                    ],
                ]);

                return ['order' => $order, 'replayed' => false];
            }, (int) config('resilience.database.transaction_attempts', 3));
        } catch (QueryException $exception) {
            if (BookingCheckoutSchema::causedByQueryException($exception)) {
                // Do not expose SQL, bindings, hosts, or schema identifiers to
                // the browser. The correlation context still lets operations
                // find this critical event without leaking customer data.
                Log::critical('Booking checkout blocked by an incompatible database schema.', [
                    'sql_state' => (string) ($exception->errorInfo[0] ?? $exception->getCode()),
                    'driver_code' => (int) ($exception->errorInfo[1] ?? 0),
                ]);

                throw ValidationException::withMessages([
                    'checkout' => 'Reservasi sedang disinkronkan. Pilihan jadwal Anda tetap tersimpan; silakan coba kembali beberapa saat lagi.',
                ]);
            }

            $order = $this->checkoutIntentService->recoverUniqueKeyWinner(
                (int) $requestUser->id,
                (string) $data['idempotency_key'],
                $fingerprint,
            );

            if (! $order) {
                if (app(ConcurrencyErrorDetector::class)->causedByConcurrencyError($exception)) {
                    throw ValidationException::withMessages([
                        'items' => 'Permintaan lain sedang mengamankan jadwal yang sama. Tidak ada reservasi ganda yang dibuat; silakan coba kembali.',
                    ]);
                }

                throw $exception;
            }

            $result = ['order' => $order, 'replayed' => true];
        }

        $response = redirect()->route('checkout.booking.show', $result['order']);
        $response->headers->set(
            (string) config('resilience.idempotency.replay_header', 'Idempotent-Replay'),
            $result['replayed'] ? 'true' : 'false',
        );

        return $response;
    }

    public function show(Request $request, BookingOrder $bookingOrder): Response
    {
        $this->authorizeOwner($request, $bookingOrder);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);
        $this->expiryService->expireOrderIfDue($bookingOrder->id);
        $bookingOrder->refresh();

        $bookingOrder->load([
            'bookings.facility.media',
            'bookings.facilityUnit.media',
            'transaction',
            'user',
        ]);

        return Inertia::render('Checkout/BookingCheckoutPage', [
            'bookingOrder' => $this->payload($bookingOrder),
            'paymentMethods' => $this->paymentChannels->bookingMethods(),
            'mockPayment' => $this->paymentChannels->mockEnabled(),
            'submissionSafetySeconds' => min(30, max(
                0,
                (int) config('services.payment.submission_safety_seconds', 3),
            )),
            'serverNow' => now()->toIso8601String(),
        ]);
    }

    public function success(
        Request $request,
        BookingOrder $bookingOrder,
    ): Response|RedirectResponse {
        $this->authorizeOwner($request, $bookingOrder);
        $this->paymentRecovery->recoverForUser((int) $request->user()->id);

        $bookingOrder->load([
            'bookings.facility.media',
            'bookings.facilityUnit.media',
            'transaction',
            'user',
        ]);

        if ($bookingOrder->status !== 'paid'
            || $bookingOrder->transaction?->payment_status !== 'PAID') {
            return redirect()
                ->route('checkout.booking.show', $bookingOrder)
                ->with('error', 'Pembayaran belum selesai.');
        }

        return Inertia::render('Checkout/BookingSuccessPage', [
            'bookingOrder' => $this->payload($bookingOrder),
            'invoiceUrl' => route('checkout.booking.invoice', $bookingOrder),
        ]);
    }

    private function authorizeOwner(Request $request, BookingOrder $bookingOrder): void
    {
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            404,
        );
    }

    private function normalizedProfilePhone(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $phone = preg_replace('/[\s().+\-]+/', '', $value) ?? '';

        if (str_starts_with($phone, '0')) {
            $phone = '62'.substr($phone, 1);
        } elseif (str_starts_with($phone, '8')) {
            $phone = '62'.$phone;
        }

        return preg_match('/^628[0-9]{7,13}$/', $phone) === 1
            ? $phone
            : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(BookingOrder $bookingOrder): array
    {
        $bookingOrder->loadMissing([
            'bookings.facility.media',
            'bookings.facilityUnit.media',
            'transaction',
        ]);

        return [
            'id' => $bookingOrder->id,
            'customer_name' => $bookingOrder->customer_name,
            'whatsapp_number' => $bookingOrder->whatsapp_number,
            'identity_category' => $bookingOrder->identity_category,
            'identity_number' => $bookingOrder->identity_number,
            'subtotal_amount' => $bookingOrder->subtotal_amount,
            'transaction_fee' => $bookingOrder->transaction_fee,
            'discount_amount' => $bookingOrder->discount_amount,
            'total_amount' => $bookingOrder->total_amount,
            'status' => $bookingOrder->status,
            'notes' => $bookingOrder->notes,
            'expires_at' => $bookingOrder->expires_at?->toIso8601String(),
            'bookings' => $bookingOrder->bookings->map(fn ($booking) => [
                'id' => $booking->id,
                'facility_name' => $booking->facility?->name,
                'facility_unit_name' => $booking->facilityUnit?->name,
                'image_url' => $this->bookingImageUrl($booking),
                'booking_date' => $booking->booking_date?->format('Y-m-d'),
                'start_time' => substr((string) $booking->start_time, 0, 5),
                'end_time' => substr((string) $booking->end_time, 0, 5),
                'subtotal_price' => $booking->subtotal_price,
                'status' => $booking->status,
            ])->values()->all(),
            'transaction' => $bookingOrder->transaction ? [
                'id' => $bookingOrder->transaction->id,
                'receipt_number' => $bookingOrder->transaction->receipt_number,
                'amount' => $bookingOrder->transaction->amount,
                'payment_status' => $bookingOrder->transaction->payment_status,
                'xendit_invoice_id' => $bookingOrder->transaction->xendit_invoice_id,
                'checkout_url' => $bookingOrder->transaction->checkout_url,
                'paid_at' => $bookingOrder->transaction->paid_at?->format('Y-m-d H:i'),
            ] : null,
        ];
    }

    private function bookingImageUrl(Booking $booking): ?string
    {
        return $booking->facilityUnit?->getFirstMediaUrl('unit_image')
            ?: $booking->facility?->getFirstMediaUrl('hero')
            ?: $booking->facility?->getFirstMediaUrl('gallery')
            ?: null;
    }
}
