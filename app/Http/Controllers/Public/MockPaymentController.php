<?php

namespace App\Http\Controllers\Public;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Services\BookingInventoryService;
use App\Services\BookingOrderExpiryService;
use App\Services\BookingOrderIntegrityService;
use App\Services\Payments\PaymentAttemptService;
use App\Services\Payments\PaymentOperationalLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MockPaymentController extends Controller
{
    public function __construct(
        private readonly BookingOrderExpiryService $expiryService,
        private readonly BookingInventoryService $inventoryService,
        private readonly BookingOrderIntegrityService $integrityService,
        private readonly PaymentAttemptService $paymentAttempts,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    public function pay(Request $request, BookingOrder $bookingOrder): RedirectResponse
    {
        abort_unless($this->mockPaymentEnabled(), 404);
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            403,
        );

        $data = $request->validate([
            'idempotency_key' => ['required', 'uuid'],
            'payment_method' => ['required', 'in:bca_va,qris,card'],
            'customer_name' => ['required', 'string', 'max:255'],
            'whatsapp_number' => ['required', 'string', 'max:30'],
            'identity_category' => ['required', 'in:warga_ub,umum'],
            'identity_number' => ['nullable', 'required_if:identity_category,warga_ub', 'string', 'regex:/^[0-9]{6,30}$/'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $this->inventoryService->prepareWriteTransactionIsolation();
        $paid = DB::transaction(function () use ($bookingOrder, $data, $request): bool {
            $resourceReferences = Booking::query()
                ->where('booking_order_id', $bookingOrder->id)
                ->get(['facility_id', 'facility_unit_id']);
            $lockedResources = $this->inventoryService->lockResources(
                $resourceReferences->pluck('facility_id'),
                $resourceReferences->pluck('facility_unit_id'),
            );

            $lockedOrder = BookingOrder::query()
                ->lockForUpdate()
                ->findOrFail($bookingOrder->id);

            abort_unless(
                $request->user() && $lockedOrder->user_id === $request->user()->id,
                403,
            );

            $bookings = Booking::query()
                ->where('booking_order_id', $lockedOrder->id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $transaction = $lockedOrder->transaction()
                ->lockForUpdate()
                ->first();

            if (! $transaction) {
                throw ValidationException::withMessages([
                    'payment_method' => 'Transaksi reservasi belum tersedia.',
                ]);
            }

            if ($transaction->payment_status === 'PAID'
                && $lockedOrder->status === 'paid') {
                $this->integrityService->assertAggregateTotals(
                    $lockedOrder,
                    $transaction,
                    $bookings,
                );

                return true;
            }

            if ($this->expiryService->expire($lockedOrder, $transaction)) {
                return false;
            }

            if ($data['identity_category'] !== $lockedOrder->identity_category
                || ($lockedOrder->identity_category === 'warga_ub'
                    && ($data['identity_number'] ?? null) !== $lockedOrder->identity_number)) {
                throw ValidationException::withMessages([
                    'identity_category' => 'Kategori harga tidak dapat diubah setelah jadwal dibuat.',
                ]);
            }

            $this->integrityService->assertPayable(
                $lockedOrder,
                $transaction,
                $bookings,
            );
            $this->inventoryService->assertBookingAggregateAvailable(
                $bookings,
                $lockedResources['facilities'],
                $lockedResources['units'],
            );

            $currency = strtoupper((string) ($lockedOrder->currency ?: 'IDR'));
            $attemptFingerprint = hash('sha256', json_encode([
                'version' => 1,
                'kind' => 'booking_order_payment',
                'order_id' => (int) $lockedOrder->id,
                'transaction_id' => (int) $transaction->id,
                'amount' => (int) $transaction->amount,
                'currency' => $currency,
                'payment_method' => (string) $data['payment_method'],
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            $attempt = $this->paymentAttempts->createOrResume(
                $transaction,
                $request->user(),
                (string) $data['idempotency_key'],
                $attemptFingerprint,
                $currency,
                $lockedOrder->expires_at,
                [
                    'channel' => 'local_mock',
                    'payment_method' => (string) $data['payment_method'],
                    'subject_kind' => 'booking_order',
                ],
            );

            if ($attempt->status === PaymentAttemptStatus::Draft) {
                $attempt = $this->paymentAttempts->transition(
                    $attempt,
                    PaymentAttemptStatus::Creating,
                );
            }

            if (in_array($attempt->status, [
                PaymentAttemptStatus::Creating,
                PaymentAttemptStatus::Pending,
                PaymentAttemptStatus::Reconciling,
            ], true)) {
                $attempt = $this->paymentAttempts->applyGatewayResult(
                    $attempt,
                    new PaymentGatewayResult(
                        provider: 'local_mock',
                        status: PaymentAttemptStatus::Paid,
                        amount: (int) $transaction->amount,
                        currency: $currency,
                        providerReference: 'booking-'.$lockedOrder->id.'-'.$attempt->public_id,
                        providerTransactionId: 'local-'.$attempt->public_id,
                        metadata: ['result' => 'approved'],
                    ),
                );
            }

            if ($attempt->status !== PaymentAttemptStatus::Paid) {
                throw ValidationException::withMessages([
                    'payment_method' => 'Percobaan pembayaran ini sudah berakhir. Pilih metode pembayaran dan coba kembali.',
                ]);
            }

            $lockedOrder->update([
                'customer_name' => $data['customer_name'],
                'whatsapp_number' => $data['whatsapp_number'],
                'notes' => $data['notes'] ?? null,
            ]);

            $transaction->update([
                'payment_status' => 'PAID',
                'payment_method' => $data['payment_method'],
                'paid_at' => now(),
            ]);

            $lockedOrder->update([
                'status' => 'paid',
            ]);

            Booking::query()->whereKey($bookings->modelKeys())->update([
                'customer_name' => $data['customer_name'],
                'notes' => $data['notes'] ?? null,
                'status' => 'confirmed',
            ]);

            $this->operationalLog->recordAfterCommit('reservation_confirmed', [
                'booking_order_id' => $lockedOrder->id,
                'transaction_id' => $transaction->id,
                'booking_count' => $bookings->count(),
                'confirmation_source' => 'mock_gateway',
            ]);

            return true;
        }, 3);

        if (! $paid) {
            return back()->withErrors([
                'payment_method' => 'Waktu pembayaran telah berakhir. Pilih kembali jadwal reservasi.',
            ]);
        }

        return redirect()->route('checkout.booking.success', $bookingOrder);
    }

    private function mockPaymentEnabled(): bool
    {
        return (bool) config('services.payment.mock', false)
            && app()->environment(['local', 'testing']);
    }
}
