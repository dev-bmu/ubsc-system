<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PaymentAttemptStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreAdminBookingRequest;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Services\AdminBookingReadModel;
use App\Services\BookingInventoryService;
use App\Services\BookingPriceCalculator;
use App\Services\DataGovernance\BookingStatusTransitionPolicy;
use App\Services\Payments\PaymentAttemptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class BookingController extends Controller
{
    public function __construct(
        private readonly BookingPriceCalculator $priceCalculator,
        private readonly BookingInventoryService $inventoryService,
        private readonly PaymentAttemptService $paymentAttempts,
        private readonly BookingStatusTransitionPolicy $statusTransitions,
        private readonly AdminBookingReadModel $readModel,
    ) {}

    public function index(Request $request): Response
    {
        $this->authorizeAny(['view-bookings', 'manage-bookings', 'manage-payment-links']);

        $canManageBookings = $request->user()?->can('manage-bookings') ?? false;
        $canManageBookingPayments = $canManageBookings
            || ($request->user()?->can('manage-payment-links') ?? false);

        $validated = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:pending,confirmed,cancelled,completed'],
            'category' => ['nullable', 'string', 'max:100'],
            'coverage' => ['nullable', 'in:website,all'],
            'per_page' => ['nullable', 'integer', 'in:10,20,50'],
            'cursor' => ['nullable', 'string', 'max:2048'],
        ]);

        if (isset($validated['date_from'], $validated['date_to'])
            && $validated['date_to'] < $validated['date_from']) {
            throw ValidationException::withMessages([
                'date_to' => 'Tanggal akhir riwayat tidak boleh mendahului tanggal awal.',
            ]);
        }

        $categories = $this->readModel->categories();
        $requestedCategory = trim((string) ($validated['category'] ?? ''));
        $defaultCategory = collect($categories)->first(
            fn (array $category): bool => (int) $category['website_facilities'] > 0,
        ) ?? collect($categories)->first();
        $selectedCategory = $requestedCategory !== ''
            ? (collect($categories)->firstWhere('slug', $requestedCategory) ?? $defaultCategory)
            : $defaultCategory;

        $date = $validated['date'] ?? today()->toDateString();
        $coverage = $validated['coverage'] ?? 'website';
        $categoryId = $selectedCategory !== null
            ? (int) $selectedCategory['id']
            : null;
        $filters = [
            'search' => trim((string) ($validated['search'] ?? '')) ?: null,
            'status' => $validated['status'] ?? null,
            'date_from' => $validated['date_from'] ?? null,
            'date_to' => $validated['date_to'] ?? null,
            'category_id' => $categoryId,
            'category' => $selectedCategory['slug'] ?? null,
            'coverage' => $coverage,
            'per_page' => (int) ($validated['per_page'] ?? 20),
            'cursor' => $validated['cursor'] ?? null,
        ];

        $calendarPayload = null;
        $calendar = function () use (&$calendarPayload, $date, $categoryId, $coverage): array {
            return $calendarPayload ??= $this->readModel->calendar(
                $date,
                $categoryId,
                $coverage,
            );
        };

        $listingPayload = null;
        $listing = function () use (&$listingPayload, $filters): array {
            return $listingPayload ??= $this->readModel->listing($filters);
        };

        return Inertia::render('Admin/Bookings/Index', [
            'bookings' => fn (): array => $calendar()['data'],
            'booking_calendar' => fn (): array => $calendar()['meta'],
            'booking_list' => fn (): array => $listing()['data'],
            'booking_pagination' => fn (): array => $listing()['pagination'],
            'booking_filters' => [
                'search' => $filters['search'],
                'status' => $filters['status'],
                'date_from' => $filters['date_from'],
                'date_to' => $filters['date_to'],
                'category' => $filters['category'],
                'coverage' => $filters['coverage'],
                'per_page' => $filters['per_page'],
                'date' => $date,
                'cursor' => null,
            ],
            'booking_stats' => fn (): array => $this->readModel->statistics(
                $date,
                $categoryId,
                $coverage,
            ),
            'booking_categories' => $categories,
            'can_manage_bookings' => $canManageBookings,
            'can_manage_booking_payments' => $canManageBookingPayments,
            'facilities' => fn (): array => $this->readModel->facilities(
                $categoryId,
                $coverage,
                $date,
            ),
            'manual_facilities' => fn (): array => $canManageBookings
                ? $this->readModel->facilities()
                : [],
        ]);
    }

    public function show(Booking $booking): JsonResponse
    {
        $this->authorizeAny(['view-bookings', 'manage-bookings', 'manage-payment-links']);

        return response()->json([
            'data' => $this->readModel->detail($booking),
        ]);
    }

    public function store(StoreAdminBookingRequest $request): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validated();

        if ($data['end_time'] <= $data['start_time']) {
            return back()->withErrors(['end_time' => 'Jam selesai harus setelah jam mulai.']);
        }

        $unitId = isset($data['facility_unit_id']) ? (int) $data['facility_unit_id'] : null;
        $this->inventoryService->prepareWriteTransactionIsolation();
        DB::transaction(function () use ($data, $unitId): void {
            $lockedResources = $this->inventoryService->lockResources(
                [(int) $data['facility_id']],
                [$unitId],
            );
            /** @var Facility $facility */
            $facility = $lockedResources['facilities']->get((int) $data['facility_id']);
            /** @var FacilityUnit|null $unit */
            $unit = $unitId ? $lockedResources['units']->get($unitId) : null;

            $facility->load(['category', 'prices', 'units.prices']);
            $unit?->load('prices');

            if (! $facility->is_active) {
                throw ValidationException::withMessages([
                    'facility_id' => 'Fasilitas tidak aktif dan tidak dapat dipesan.',
                ]);
            }

            if ($unitId && (! $unit
                || (int) $unit->facility_id !== (int) $facility->id
                || ! $unit->is_active)) {
                throw ValidationException::withMessages([
                    'facility_unit_id' => 'Unit tidak valid untuk fasilitas ini.',
                ]);
            }

            if (! $unitId && $facility->units->where('is_active', true)->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'facility_unit_id' => 'Pilih unit fasilitas terlebih dahulu.',
                ]);
            }

            $date = Carbon::parse($data['booking_date']);
            $startsAt = Carbon::createFromFormat(
                'Y-m-d H:i',
                $data['booking_date'].' '.$data['start_time'],
                config('app.timezone'),
            );

            if ($startsAt->lessThanOrEqualTo(now())) {
                throw ValidationException::withMessages([
                    'start_time' => 'Jadwal ini sudah berlalu. Pilih waktu lain.',
                ]);
            }

            $schedule = BookingSchedule::query()
                ->where('month', $date->month)
                ->where('year', $date->year)
                ->lockForUpdate()
                ->first();

            if (! $schedule?->is_open) {
                throw ValidationException::withMessages([
                    'booking_date' => 'Jadwal untuk bulan ini belum dibuka oleh pengelola.',
                ]);
            }

            if (in_array($date->format('Y-m-d'), $schedule->closed_dates ?? [], true)) {
                throw ValidationException::withMessages([
                    'booking_date' => 'Fasilitas tutup pada tanggal ini (Libur/Pemeliharaan).',
                ]);
            }

            $this->inventoryService->assertAvailable(
                $facility,
                $unit,
                $data['booking_date'],
                $data['start_time'],
                $data['end_time'],
                (int) ($data['pax'] ?? 1),
            );

            $isFree = (bool) ($data['is_free'] ?? false);
            $subtotal = $isFree ? 0 : $this->calculateSubtotal(
                $facility,
                $unit,
                $data['booking_date'],
                $data['start_time'],
                $data['end_time'],
            );

            $booking = Booking::create([
                'user_id' => null,
                'customer_name' => $data['customer_name'],
                'customer_phone' => $data['customer_phone'] ?? null,
                'facility_id' => $facility->id,
                'facility_unit_id' => $unitId,
                'booking_date' => $data['booking_date'],
                'start_time' => $data['start_time'],
                'end_time' => $data['end_time'],
                'pax' => $data['pax'] ?? 1,
                'subtotal_price' => $subtotal,
                'status' => $isFree ? 'confirmed' : 'pending',
                'notes' => $data['notes'] ?? null,
            ]);

            $this->inventoryService->assertPersistedBookingsWithinCapacity(
                collect([$booking]),
                $lockedResources['facilities'],
                $lockedResources['units'],
                'start_time',
            );

            $booking->transaction()->create([
                'user_id' => null,
                'amount' => $subtotal,
                'payment_status' => $isFree ? 'PAID' : 'UNPAID',
                'payment_method' => $isFree ? 'complimentary' : null,
                'checkout_url' => null,
                'paid_at' => $isFree ? now() : null,
                'service_snapshot' => [
                    'version' => 1,
                    'kind' => 'booking',
                    'items' => [[
                        'booking_id' => $booking->id,
                        'kind' => Str::contains(
                            Str::lower(implode(' ', array_filter([
                                $facility->category?->slug,
                                $facility->category?->name,
                                $facility->class_code,
                            ]))),
                            ['kelas', 'class'],
                        ) ? 'class' : 'facility',
                        'facility_id' => $facility->id,
                        'facility_name' => $facility->name,
                        'facility_unit_id' => $unitId,
                        'facility_unit_name' => $unit?->name,
                        'category_name' => $facility->category?->name,
                        'location' => $facility->location,
                        'booking_date' => $data['booking_date'],
                        'start_time' => $data['start_time'],
                        'end_time' => $data['end_time'],
                        'subtotal' => $subtotal,
                    ]],
                ],
            ]);
        }, (int) config('resilience.database.transaction_attempts', 3));

        return redirect()->route('admin.bookings.index')
            ->with('success', 'Booking berhasil dibuat.');
    }

    public function update(Request $request, Booking $booking): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validate([
            'status' => ['required', 'in:pending,confirmed,cancelled,completed'],
            'state_version' => ['required', 'string', 'size:64'],
        ]);

        $this->changeStatus($booking, $data['status'], $data['state_version']);

        return back()->with('success', 'Status booking berhasil diperbarui.');
    }

    public function destroy(Request $request, Booking $booking): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validate([
            'state_version' => ['required', 'string', 'size:64'],
        ]);

        $this->changeStatus($booking, 'cancelled', $data['state_version']);

        return back()->with('success', 'Booking berhasil dibatalkan.');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function changeStatus(
        Booking $bookingReference,
        string $targetStatus,
        string $expectedStateVersion,
    ): void {
        $this->inventoryService->prepareWriteTransactionIsolation();
        DB::transaction(function () use (
            $bookingReference,
            $targetStatus,
            $expectedStateVersion,
        ): void {
            $resourceReferences = $bookingReference->booking_order_id
                ? Booking::query()
                    ->where('booking_order_id', $bookingReference->booking_order_id)
                    ->get(['facility_id', 'facility_unit_id'])
                : collect([[
                    'facility_id' => $bookingReference->facility_id,
                    'facility_unit_id' => $bookingReference->facility_unit_id,
                ]]);
            $lockedResources = $this->inventoryService->lockResources(
                $resourceReferences->pluck('facility_id'),
                $resourceReferences->pluck('facility_unit_id'),
            );

            $order = $bookingReference->booking_order_id
                ? BookingOrder::query()
                    ->lockForUpdate()
                    ->findOrFail($bookingReference->booking_order_id)
                : null;
            $siblings = $order
                ? Booking::query()
                    ->where('booking_order_id', $order->id)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                : Booking::query()
                    ->whereKey($bookingReference->id)
                    ->lockForUpdate()
                    ->get();
            /** @var Booking $booking */
            $booking = $siblings->firstWhere('id', $bookingReference->id)
                ?? throw ValidationException::withMessages([
                    'status' => 'Booking tidak lagi tersedia.',
                ]);
            $transaction = ($order ? $order->transaction() : $booking->transaction())
                ->lockForUpdate()
                ->first();

            $currentStateVersion = $this->readModel->stateVersion(
                $booking,
                $order,
                $transaction,
            );

            if (! hash_equals($currentStateVersion, $expectedStateVersion)) {
                throw ValidationException::withMessages([
                    'state_version' => 'Data booking berubah sejak panel dibuka. Muat ulang detail sebelum melanjutkan.',
                ]);
            }

            if ($booking->status === $targetStatus) {
                return;
            }

            $this->statusTransitions->assertAllowed($booking->status, $targetStatus);

            if ($targetStatus === 'cancelled' && $transaction) {
                $this->paymentAttempts->guardAndTerminateOpenAttempts(
                    $transaction,
                    PaymentAttemptStatus::Cancelled,
                    'status',
                );
                $transaction->refresh();
            }

            if (in_array($targetStatus, ['confirmed', 'completed'], true)) {
                $paymentIsSettled = $transaction?->payment_status === 'PAID'
                    && (! $order || $order->status === 'paid');

                if (! $paymentIsSettled) {
                    throw ValidationException::withMessages([
                        'status' => 'Booking hanya dapat dikonfirmasi setelah pembayaran lunas.',
                    ]);
                }
            }

            if ($targetStatus === 'confirmed') {
                /** @var Facility|null $facility */
                $facility = $lockedResources['facilities']->get((int) $booking->facility_id);
                /** @var FacilityUnit|null $unit */
                $unit = $booking->facility_unit_id
                    ? $lockedResources['units']->get((int) $booking->facility_unit_id)
                    : null;

                if (! $facility) {
                    throw ValidationException::withMessages([
                        'status' => 'Inventori booking tidak lagi tersedia.',
                    ]);
                }

                $this->inventoryService->assertAvailable(
                    $facility,
                    $unit,
                    $booking->booking_date->format('Y-m-d'),
                    (string) $booking->start_time,
                    (string) $booking->end_time,
                    max(1, (int) $booking->pax),
                    [$booking->id],
                    'status',
                );
            }

            if ($targetStatus === 'cancelled'
                && $order
                && in_array($order->status, ['draft', 'pending_payment'], true)) {
                if ($transaction?->payment_status === 'PAID') {
                    throw ValidationException::withMessages([
                        'status' => 'Status pembayaran dan order tidak konsisten. Perubahan dihentikan.',
                    ]);
                }

                foreach ($siblings as $sibling) {
                    if (in_array($sibling->status, ['pending', 'confirmed'], true)) {
                        $this->statusTransitions->assertAllowed($sibling->status, 'cancelled');
                        $sibling->update(['status' => 'cancelled']);
                    }
                }
                $order->update(['status' => 'cancelled']);

                if ($transaction && $transaction->payment_status === 'UNPAID') {
                    $transaction->update(['payment_status' => 'FAILED']);
                }

                return;
            }

            $booking->update(['status' => $targetStatus]);

            if ($targetStatus === 'confirmed') {
                $this->inventoryService->assertPersistedBookingsWithinCapacity(
                    collect([$booking]),
                    $lockedResources['facilities'],
                    $lockedResources['units'],
                    'status',
                );
            }

            if ($targetStatus === 'cancelled'
                && ! $order
                && $transaction?->payment_status === 'UNPAID') {
                $transaction->update(['payment_status' => 'FAILED']);
            }
        }, (int) config('resilience.database.transaction_attempts', 3));
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function authorizeAny(array $permissions): void
    {
        foreach ($permissions as $permission) {
            if (auth()->user()?->can($permission)) {
                return;
            }
        }

        abort(403);
    }

    private function calculateSubtotal(
        Facility $facility,
        ?FacilityUnit $unit,
        string $bookingDate,
        string $startTime,
        string $endTime,
    ): int {
        // Walk-in bookings use the public general tariff unless explicitly complimentary.
        return $this->priceCalculator->calculateResourceAmount(
            $facility,
            $unit,
            'umum',
            $bookingDate,
            $startTime,
            $endTime,
        );
    }
}
