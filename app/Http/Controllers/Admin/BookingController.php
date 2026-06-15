<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Models\User;
use App\Support\FacilityPriceResolver;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class BookingController extends Controller
{
    public function __construct(private readonly FacilityPriceResolver $priceResolver)
    {
    }

    public function index(): Response
    {
        $this->authorizeAny(['view-bookings', 'manage-bookings', 'manage-payment-links']);

        $bookings = Booking::with(['user', 'facility', 'facilityUnit', 'transaction'])
            ->orderBy('booking_date', 'desc')
            ->orderBy('start_time', 'asc')
            ->get()
            ->map(fn($b) => $this->transformBooking($b));

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
            'bookings'   => $bookings,
            'facilities' => $facilities,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validate([
            'customer_name' => ['required', 'string', 'max:255'],
            'facility_id'   => ['required', 'exists:facilities,id'],
            'facility_unit_id' => ['nullable', 'exists:facility_units,id'],
            'booking_date'  => ['required', 'date', 'after_or_equal:today'],
            'start_time'    => ['required', 'date_format:H:i'],
            'end_time'      => ['required', 'date_format:H:i'],
            'pax'           => ['nullable', 'integer', 'min:1', 'max:9999'],
            'is_free'       => ['boolean'],
            'notes'         => ['nullable', 'string', 'max:500'],
        ]);

        if ($data['end_time'] <= $data['start_time']) {
            return back()->withErrors(['end_time' => 'Jam selesai harus setelah jam mulai.']);
        }

        $facility = Facility::with(['prices', 'units.prices'])->findOrFail($data['facility_id']);
        $unitId = isset($data['facility_unit_id']) ? (int) $data['facility_unit_id'] : null;

        if ($unitId) {
            $unitBelongsToFacility = FacilityUnit::where('id', $unitId)
                ->where('facility_id', $facility->id)
                ->where('is_active', true)
                ->exists();

            if (! $unitBelongsToFacility) {
                return back()->withErrors([
                    'facility_unit_id' => 'Unit tidak valid untuk fasilitas ini.',
                ]);
            }
        } elseif ($facility->units->where('is_active', true)->isNotEmpty()) {
            return back()->withErrors([
                'facility_unit_id' => 'Pilih unit fasilitas terlebih dahulu.',
            ]);
        }

        $date = Carbon::parse($data['booking_date']);
        if (!BookingSchedule::isOpen($date->month, $date->year)) {
            return back()->withErrors([
                'booking_date' => 'Jadwal untuk bulan ini belum dibuka oleh pengelola.',
            ]);
        }

        $schedule = BookingSchedule::where('month', $date->month)->where('year', $date->year)->first();
        if ($schedule && in_array($date->format('Y-m-d'), $schedule->closed_dates ?? [])) {
            return back()->withErrors([
                'booking_date' => 'Fasilitas tutup pada tanggal ini (Libur/Pemeliharaan).',
            ]);
        }

        if ($this->hasCollision($facility->id, $unitId, $data['booking_date'], $data['start_time'], $data['end_time'], (int) ($data['pax'] ?? 1))) {
            return back()->withErrors([
                'start_time' => 'Jadwal sudah terpesan untuk fasilitas tersebut. Silakan pilih waktu lain.',
            ]);
        }

        $isFree   = (bool) ($data['is_free'] ?? false);
        $subtotal = $isFree ? 0 : $this->calculateSubtotal(
            null,
            (int) $data['facility_id'],
            $unitId,
            $data['booking_date'],
            $data['start_time'],
            $data['end_time'],
        );

        $booking = Booking::create([
            'user_id'        => null,
            'customer_name'  => $data['customer_name'],
            'facility_id'    => $facility->id,
            'facility_unit_id' => $unitId,
            'booking_date'   => $data['booking_date'],
            'start_time'     => $data['start_time'],
            'end_time'       => $data['end_time'],
            'pax'            => $data['pax'] ?? 1,
            'subtotal_price' => $subtotal,
            'status'         => $isFree ? 'confirmed' : 'pending',
            'notes'          => $data['notes'] ?? null,
        ]);

        $booking->transaction()->create([
            'user_id'        => null,
            'amount'         => $subtotal,
            'payment_status' => $isFree ? 'PAID' : 'UNPAID',
            'checkout_url'   => url("/admin/bookings/{$booking->id}"),
        ]);

        return redirect()->route('admin.bookings.index')
            ->with('success', 'Booking berhasil dibuat.');
    }

    public function update(Request $request, Booking $booking): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $data = $request->validate([
            'status' => ['required', 'in:pending,confirmed,cancelled,completed'],
        ]);

        $booking->update(['status' => $data['status']]);

        if (in_array($data['status'], ['cancelled', 'completed'])) {
            if ($booking->transaction?->payment_status === 'UNPAID') {
                $booking->transaction->update(['payment_status' => 'FAILED']);
            }
        }

        return back()->with('success', 'Status booking berhasil diperbarui.');
    }

    public function destroy(Booking $booking): RedirectResponse
    {
        $this->authorize('manage-bookings');

        $booking->update(['status' => 'cancelled']);

        if ($booking->transaction?->payment_status === 'UNPAID') {
            $booking->transaction->update(['payment_status' => 'FAILED']);
        }

        return back()->with('success', 'Booking berhasil dibatalkan.');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function hasCollision(int $facilityId, ?int $facilityUnitId, string $date, string $startTime, string $endTime, int $requestedPax = 1): bool
    {
        $capacity = $facilityUnitId ? 1 : (Facility::find($facilityId)?->capacity ?? 1);

        $bookingQuery = Booking::where('facility_id', $facilityId)
            ->whereDate('booking_date', $date)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where(function ($q) use ($startTime, $endTime) {
                $q->where('start_time', '<', $endTime)
                  ->where('end_time', '>', $startTime);
            });

        if ($facilityUnitId) {
            $bookingQuery->where(function ($query) use ($facilityUnitId) {
                $query->where('facility_unit_id', $facilityUnitId)
                    ->orWhereNull('facility_unit_id');
            });
        }

        $occupiedPax = $bookingQuery->sum('pax');

        return ($occupiedPax + $requestedPax) > $capacity;
    }

    /**
     * @param array<int, string> $permissions
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

    private function calculateSubtotal(?int $userId, int $facilityId, ?int $facilityUnitId, string $bookingDate, string $startTime, string $endTime): int
    {
        // Guest/walk-in bookings without a user account default to 'umum' pricing
        $user          = $userId ? User::find($userId) : null;
        $priceCategory = $user?->identity_category === 'warga_kampus' ? 'warga_ub' : 'umum';

        $facility = Facility::with('prices')->find($facilityId);
        $unit = $facilityUnitId
            ? FacilityUnit::with('prices')->find($facilityUnitId)
            : null;
        $facilityPrice = $facility
            ? $this->priceResolver->resolveForUnit($facility, $unit, $priceCategory, $bookingDate, $startTime, $endTime)
            : null;

        if (! $facilityPrice) {
            return 0;
        }

        [$sh, $sm] = array_map('intval', explode(':', $startTime));
        [$eh, $em] = array_map('intval', explode(':', $endTime));
        $durationMinutes = ($eh * 60 + $em) - ($sh * 60 + $sm);

        if ($facilityPrice->duration_minutes) {
            return (int) round(($durationMinutes / $facilityPrice->duration_minutes) * $facilityPrice->price);
        }

        return (int) $facilityPrice->price;
    }

    private function transformBooking(Booking $booking): array
    {
        $userCategory = $booking->user?->identity_category === 'warga_kampus' ? 'warga_ub' : 'umum';

        // Prefer the stored customer_name; fall back to the linked user's name
        $customerName  = $booking->customer_name ?? $booking->user?->name ?? 'Guest';
        $customerPhone = $booking->user?->phone_number;

        return [
            'id'             => $booking->id,
            'user_id'        => $booking->user_id,
            'facility_id'    => $booking->facility_id,
            'facility_unit_id' => $booking->facility_unit_id,
            'booking_date'   => $booking->booking_date->format('Y-m-d'),
            'start_time'     => substr($booking->start_time, 0, 5),
            'end_time'       => substr($booking->end_time, 0, 5),
            'subtotal_price' => $booking->subtotal_price,
            'status'         => $booking->status,
            'notes'          => $booking->notes,
            'customer_name'  => $customerName,
            'customer_phone' => $customerPhone,
            'is_free'        => $booking->subtotal_price === 0 && $booking->user_id === null,
            'user_category'  => $userCategory,
            'facility_name'  => $booking->facility->name,
            'facility_unit_name' => $booking->facilityUnit?->name,
            'transaction'    => $booking->transaction ? [
                'id'             => $booking->transaction->id,
                'amount'         => $booking->transaction->amount,
                'payment_status' => $booking->transaction->payment_status,
                'checkout_url'   => $booking->transaction->checkout_url,
                'paid_at'        => $booking->transaction->paid_at?->format('Y-m-d H:i'),
            ] : null,
        ];
    }
}
