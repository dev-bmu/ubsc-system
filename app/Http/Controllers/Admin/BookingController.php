<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PaymentAttemptStatus;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Services\BookingInventoryService;
use App\Services\BookingPriceCalculator;
use App\Services\Payments\PaymentAttemptService;
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
    ) {}

    public function index(): Response
    {
        $this->authorizeAny(['view-bookings', 'manage-bookings', 'manage-payment-links']);

        $bookings = Booking::with(['user', 'facility', 'facilityUnit', 'transaction'])
            ->orderBy('booking_date', 'desc')
            ->orderBy('start_time', 'asc')
            ->get()
            ->map(fn ($b) => $this->transformBooking($b));

        $facilities = Facility::with(['units' => fn ($query) => $query->where('is_active', true)->orderBy('id')])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name'])
            ->map(fn (Facility $facility) => [
                'id' => $facility->id,
                'name' => $facility->name,
                'units' => $facility->units->map(fn (FacilityUnit $unit) => [
                    'id' => $unit->id,
                    'name' => $unit->name,
                ])->values()->all(),
            ]);

        return Inertia::render('Admin/Bookings/Index', [
            'bookings' => $bookings,
            'facilities' => $facilities,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validate([
            'customer_name' => ['required', 'string', 'max:255'],
            'facility_id' => ['required', 'exists:facilities,id'],
            'facility_unit_id' => ['nullable', 'exists:facility_units,id'],
            'booking_date' => ['required', 'date', 'after_or_equal:today'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i'],
            'pax' => ['nullable', 'integer', 'min:1', 'max:9999'],
            'is_free' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

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

            $booking->transaction()->create([
                'user_id' => null,
                'amount' => $subtotal,
                'payment_status' => $isFree ? 'PAID' : 'UNPAID',
                'payment_method' => $isFree ? 'complimentary' : null,
                'checkout_url' => url("/admin/bookings/{$booking->id}"),
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
        }, 3);

        return redirect()->route('admin.bookings.index')
            ->with('success', 'Booking berhasil dibuat.');
    }

    public function update(Request $request, Booking $booking): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validate([
            'status' => ['required', 'in:pending,confirmed,cancelled,completed'],
        ]);

        $this->changeStatus($booking, $data['status']);

        return back()->with('success', 'Status booking berhasil diperbarui.');
    }

    public function destroy(Booking $booking): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $this->changeStatus($booking, 'cancelled');

        return back()->with('success', 'Booking berhasil dibatalkan.');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function changeStatus(Booking $bookingReference, string $targetStatus): void
    {
        $this->inventoryService->prepareWriteTransactionIsolation();
        DB::transaction(function () use ($bookingReference, $targetStatus): void {
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

            if ($booking->status === $targetStatus) {
                return;
            }

            $allowedTransitions = [
                'pending' => ['confirmed', 'cancelled'],
                'confirmed' => ['completed', 'cancelled'],
                'cancelled' => [],
                'completed' => [],
            ];

            if (! in_array($targetStatus, $allowedTransitions[$booking->status] ?? [], true)) {
                throw ValidationException::withMessages([
                    'status' => 'Perubahan status booking tidak valid.',
                ]);
            }

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

                Booking::query()
                    ->whereKey($siblings->modelKeys())
                    ->whereIn('status', ['pending', 'confirmed'])
                    ->update(['status' => 'cancelled']);
                $order->update(['status' => 'cancelled']);

                if ($transaction && $transaction->payment_status === 'UNPAID') {
                    $transaction->update(['payment_status' => 'FAILED']);
                }

                return;
            }

            $booking->update(['status' => $targetStatus]);

            if ($targetStatus === 'cancelled'
                && ! $order
                && $transaction?->payment_status === 'UNPAID') {
                $transaction->update(['payment_status' => 'FAILED']);
            }
        }, 3);
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

    private function transformBooking(Booking $booking): array
    {
        $userCategory = $booking->user?->identity_category === 'warga_kampus' ? 'warga_ub' : 'umum';

        // Prefer the stored customer_name; fall back to the linked user's name
        $customerName = $booking->customer_name ?? $booking->user?->name ?? 'Guest';
        $customerPhone = $booking->user?->phone_number;

        return [
            'id' => $booking->id,
            'user_id' => $booking->user_id,
            'facility_id' => $booking->facility_id,
            'facility_unit_id' => $booking->facility_unit_id,
            'booking_date' => $booking->booking_date->format('Y-m-d'),
            'start_time' => substr($booking->start_time, 0, 5),
            'end_time' => substr($booking->end_time, 0, 5),
            'subtotal_price' => $booking->subtotal_price,
            'status' => $booking->status,
            'notes' => $booking->notes,
            'customer_name' => $customerName,
            'customer_phone' => $customerPhone,
            'is_free' => $booking->subtotal_price === 0 && $booking->user_id === null,
            'user_category' => $userCategory,
            'facility_name' => $booking->facility->name,
            'facility_unit_name' => $booking->facilityUnit?->name,
            'transaction' => $booking->transaction ? [
                'id' => $booking->transaction->id,
                'amount' => $booking->transaction->amount,
                'payment_status' => $booking->transaction->payment_status,
                'checkout_url' => $booking->transaction->checkout_url,
                'paid_at' => $booking->transaction->paid_at?->format('Y-m-d H:i'),
            ] : null,
        ];
    }
}
