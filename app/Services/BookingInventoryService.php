<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Services\Payments\PaymentOperationalLogger;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BookingInventoryService
{
    public function __construct(
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    /**
     * MariaDB's default REPEATABLE READ can preserve a snapshot created
     * before a contending writer releases the facility mutex. Reservation
     * writers use READ COMMITTED for the connection so the initial attempt
     * and a Laravel deadlock retry both observe the winning commit.
     */
    public function prepareWriteTransactionIsolation(): void
    {
        $connection = DB::connection();

        if ($connection->getDriverName() === 'mysql'
            && $connection->transactionLevel() === 0) {
            $connection->statement(
                'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
            );

            // A hot arena must never leave every PHP worker waiting on the
            // same row for MySQL's long server default. The database remains
            // the serialization authority, while bounded waits let losing
            // contenders return a safe retry instead of exhausting capacity.
            $lockWaitSeconds = min(15, max(
                2,
                (int) config('resilience.database.lock_wait_timeout_seconds', 5),
            ));
            $connection->statement(
                "SET SESSION innodb_lock_wait_timeout = {$lockWaitSeconds}",
            );
        }
    }

    /**
     * Lock every inventory parent before any child resource. All reservation
     * writers use this ordering so two requests for the same arena serialize
     * on the database row instead of relying on a stale availability read.
     *
     * @param  iterable<int, int|string>  $facilityIds
     * @param  iterable<int, int|string|null>  $unitIds
     * @return array{
     *     facilities: EloquentCollection<int, Facility>,
     *     units: EloquentCollection<int, FacilityUnit>
     * }
     */
    public function lockResources(iterable $facilityIds, iterable $unitIds = []): array
    {
        $normalizedFacilityIds = $this->normalizeIds($facilityIds);
        $normalizedUnitIds = $this->normalizeIds($unitIds);

        /** @var EloquentCollection<int, Facility> $facilities */
        $facilities = Facility::query()
            ->whereIn('id', $normalizedFacilityIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();
        $facilities->load('category');

        /** @var EloquentCollection<int, FacilityUnit> $units */
        $units = FacilityUnit::query()
            ->whereIn('id', $normalizedUnitIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        if ($facilities->count() !== count($normalizedFacilityIds)) {
            $this->operationalLog->record('reservation_conflict', [
                'requested_facilities' => count($normalizedFacilityIds),
                'resolved_facilities' => $facilities->count(),
                'reason_code' => 'facility_missing',
            ]);

            throw ValidationException::withMessages([
                'facility_id' => 'Fasilitas reservasi tidak lagi tersedia.',
            ]);
        }

        if ($units->count() !== count($normalizedUnitIds)) {
            $this->operationalLog->record('reservation_conflict', [
                'requested_units' => count($normalizedUnitIds),
                'resolved_units' => $units->count(),
                'reason_code' => 'unit_missing',
            ]);

            throw ValidationException::withMessages([
                'facility_unit_id' => 'Unit fasilitas tidak lagi tersedia.',
            ]);
        }

        return [
            'facilities' => $facilities->keyBy('id'),
            'units' => $units->keyBy('id'),
        ];
    }

    /**
     * Serialize checkout against an administrator opening, closing, or
     * changing closed dates for the requested months. Resource rows are
     * intentionally locked first everywhere, followed by schedule rows.
     *
     * @param  iterable<int, string>  $dates
     */
    public function lockSchedulePolicies(iterable $dates): void
    {
        $periods = collect($dates)
            ->map(function (string $date): array {
                $parsed = CarbonImmutable::createFromFormat('!Y-m-d', $date);

                return [
                    'year' => $parsed->year,
                    'month' => $parsed->month,
                ];
            })
            ->unique(fn (array $period): string => $period['year'].'-'.$period['month'])
            ->sortBy(fn (array $period): string => sprintf(
                '%04d-%02d',
                $period['year'],
                $period['month'],
            ))
            ->values();

        if ($periods->isEmpty()) {
            return;
        }

        BookingSchedule::query()
            ->where(function (Builder $query) use ($periods): void {
                foreach ($periods as $period) {
                    $query->orWhere(function (Builder $monthQuery) use ($period): void {
                        $monthQuery
                            ->where('year', $period['year'])
                            ->where('month', $period['month']);
                    });
                }
            })
            ->orderBy('year')
            ->orderBy('month')
            ->lockForUpdate()
            ->get(['id', 'year', 'month']);
    }

    /**
     * Assert an interval can still claim inventory. The caller must acquire
     * lockResources() first and keep this check plus its write in one DB
     * transaction.
     *
     * @param  array<int, int|string>  $excludeBookingIds
     */
    public function assertAvailable(
        Facility $facility,
        ?FacilityUnit $unit,
        string $date,
        string $startTime,
        string $endTime,
        int $requestedPax = 1,
        array $excludeBookingIds = [],
        string $errorKey = 'start_time',
        ?CarbonInterface $at = null,
    ): void {
        $startTime = substr($startTime, 0, 5);
        $endTime = substr($endTime, 0, 5);
        $requestedPax = max(1, $requestedPax);

        if ($endTime <= $startTime) {
            $this->logConflict($facility, $unit, 'invalid_interval', $requestedPax);

            throw ValidationException::withMessages([
                $errorKey => 'Rentang waktu reservasi tidak valid.',
            ]);
        }

        if ($unit && (int) $unit->facility_id !== (int) $facility->id) {
            $this->logConflict($facility, $unit, 'unit_facility_mismatch', $requestedPax);

            throw ValidationException::withMessages([
                'facility_unit_id' => 'Unit tidak sesuai dengan fasilitas reservasi.',
            ]);
        }

        $occupiedPax = $this->lockedPeakOccupancy(
            $facility,
            $unit,
            $date,
            $startTime,
            $endTime,
            $excludeBookingIds,
            $at,
        );
        $capacity = $this->capacityFor($facility, $unit);

        if (($occupiedPax + $requestedPax) > $capacity) {
            $this->logConflict(
                $facility,
                $unit,
                'capacity_exceeded',
                $requestedPax,
                $occupiedPax,
                $capacity,
            );

            $remaining = max(0, $capacity - $occupiedPax);
            $message = $capacity > 1
                ? ($remaining > 0
                    ? "Kuota jadwal berubah dan kini tersisa {$remaining} peserta. Kurangi jumlah peserta atau pilih waktu lain."
                    : 'Kuota jadwal ini baru saja penuh. Pilih waktu lain.')
                : 'Jadwal ini baru saja terisi. Pilih waktu lain.';

            throw ValidationException::withMessages([
                $errorKey => $message,
            ]);
        }
    }

    public function capacityFor(Facility $facility, ?FacilityUnit $unit): int
    {
        // A non-null unit capacity is an explicit inventory contract. It must
        // win over category heuristics so two sibling units may safely expose
        // different quotas while retaining independent occupancy counters.
        if ($unit?->capacity !== null) {
            return max(1, (int) $unit->capacity);
        }

        $facility->loadMissing('category');
        $classification = Str::lower(implode(' ', array_filter([
            $facility->category?->slug,
            $facility->category?->name,
            $facility->class_code,
        ])));
        $isClass = Str::contains($classification, ['kelas', 'class']);

        // A unit identifies the physical room/court whose inventory is being
        // claimed; it does not automatically make that inventory exclusive.
        // Sports arenas remain exclusive, while class units share their
        // participant capacity independently from sibling units.
        return $isClass ? max(1, (int) ($facility->capacity ?? 1)) : 1;
    }

    /**
     * Defense-in-depth verification after booking rows have been written but
     * before their outer transaction commits. This catches future writer
     * regressions even when a pre-write availability check was accidentally
     * weakened or omitted.
     *
     * @param  Collection<int, Booking>  $bookings
     * @param  Collection<int, Facility>  $facilities
     * @param  Collection<int, FacilityUnit>  $units
     */
    public function assertPersistedBookingsWithinCapacity(
        Collection $bookings,
        Collection $facilities,
        Collection $units,
        string $errorKey = 'items',
    ): void {
        $verifiedIntervals = [];

        foreach ($bookings as $booking) {
            $date = $booking->booking_date->format('Y-m-d');
            $start = substr((string) $booking->start_time, 0, 5);
            $end = substr((string) $booking->end_time, 0, 5);
            $intervalKey = implode('|', [
                $booking->facility_id,
                $booking->facility_unit_id ?? 'parent',
                $date,
                $start,
                $end,
            ]);

            if (isset($verifiedIntervals[$intervalKey])) {
                continue;
            }
            $verifiedIntervals[$intervalKey] = true;

            $facility = $facilities->get((int) $booking->facility_id);
            $unit = $booking->facility_unit_id
                ? $units->get((int) $booking->facility_unit_id)
                : null;

            if (! $facility || ($booking->facility_unit_id && ! $unit)) {
                throw ValidationException::withMessages([
                    $errorKey => 'Inventori reservasi berubah sebelum penyimpanan selesai.',
                ]);
            }

            $occupiedPax = $this->lockedPeakOccupancy(
                $facility,
                $unit,
                $date,
                $start,
                $end,
            );
            $capacity = $this->capacityFor($facility, $unit);

            if ($occupiedPax <= $capacity) {
                continue;
            }

            $this->logConflict(
                $facility,
                $unit,
                'post_write_capacity_exceeded',
                max(1, (int) $booking->pax),
                $occupiedPax,
                $capacity,
            );

            throw ValidationException::withMessages([
                $errorKey => 'Kuota berubah saat reservasi diproses. Tidak ada jadwal yang disimpan; silakan pilih ulang.',
            ]);
        }
    }

    /**
     * Revalidate a locked order as one aggregate, including capacity consumed
     * by sibling children inside that order.
     *
     * @param  Collection<int, Booking>  $bookings
     * @param  Collection<int, Facility>  $facilities
     * @param  Collection<int, FacilityUnit>  $units
     */
    public function assertBookingAggregateAvailable(
        Collection $bookings,
        Collection $facilities,
        Collection $units,
        string $errorKey = 'payment_method',
    ): void {
        $excludedIds = $bookings->pluck('id')->map(fn ($id): int => (int) $id)->all();

        foreach ($bookings as $booking) {
            $facility = $facilities->get((int) $booking->facility_id);
            $unit = $booking->facility_unit_id
                ? $units->get((int) $booking->facility_unit_id)
                : null;

            if (! $facility || ($booking->facility_unit_id && ! $unit)) {
                $this->operationalLog->record('reservation_conflict', [
                    'facility_id' => $booking->facility_id,
                    'unit_id' => $booking->facility_unit_id,
                    'reason_code' => 'aggregate_inventory_missing',
                ]);

                throw ValidationException::withMessages([
                    $errorKey => 'Inventori reservasi tidak lagi valid. Silakan hubungi pengelola.',
                ]);
            }

            $date = $booking->booking_date->format('Y-m-d');
            $start = substr((string) $booking->start_time, 0, 5);
            $end = substr((string) $booking->end_time, 0, 5);
            $cohortBookings = $bookings
                ->filter(function (Booking $candidate) use ($booking, $unit, $date, $start, $end): bool {
                    if ((int) $candidate->facility_id !== (int) $booking->facility_id
                        || $candidate->booking_date->format('Y-m-d') !== $date) {
                        return false;
                    }

                    if ($unit
                        && $candidate->facility_unit_id !== null
                        && (int) $candidate->facility_unit_id !== (int) $unit->id) {
                        return false;
                    }

                    $candidateStart = substr((string) $candidate->start_time, 0, 5);
                    $candidateEnd = substr((string) $candidate->end_time, 0, 5);

                    return $candidateStart < $end && $candidateEnd > $start;
                });
            $cohortPax = $this->peakOccupancy(
                $cohortBookings,
                $start,
                $end,
            );

            $this->assertAvailable(
                $facility,
                $unit,
                $date,
                $start,
                $end,
                $cohortPax,
                $excludedIds,
                $errorKey,
            );
        }
    }

    /**
     * @param  iterable<int, int|string|null>  $ids
     * @return array<int, int>
     */
    private function normalizeIds(iterable $ids): array
    {
        return collect($ids)
            ->filter(fn ($id): bool => $id !== null && (int) $id > 0)
            ->map(fn ($id): int => (int) $id)
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    /**
     * Lock and calculate the maximum simultaneous occupancy inside one
     * requested interval. Summing every overlapping row is incorrect for
     * back-to-back reservations; a sweep-line calculation remains safe while
     * preserving all legitimately available capacity.
     *
     * @param  array<int, int|string>  $excludeBookingIds
     */
    private function lockedPeakOccupancy(
        Facility $facility,
        ?FacilityUnit $unit,
        string $date,
        string $startTime,
        string $endTime,
        array $excludeBookingIds = [],
        ?CarbonInterface $at = null,
    ): int {
        $query = Booking::query()
            ->where('facility_id', $facility->id)
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime)
            ->occupyingInventory($at);

        // Production stores booking_date as a native DATE, so exact equality
        // keeps the composite index sargable. SQLite's test driver serializes
        // cast dates with a time suffix and therefore needs its date operator.
        if ($query->getConnection()->getDriverName() === 'sqlite') {
            $query->whereDate('booking_date', $date);
        } else {
            $query->where('booking_date', $date);
        }

        $excludedIds = $this->normalizeIds($excludeBookingIds);
        if ($excludedIds !== []) {
            $query->whereNotIn('id', $excludedIds);
        }

        if ($unit) {
            // Legacy parent-level reservations block every child unit.
            $query->where(function ($resourceQuery) use ($unit): void {
                $resourceQuery
                    ->where('facility_unit_id', $unit->id)
                    ->orWhereNull('facility_unit_id');
            });
        }

        // A locking/current read is mandatory. Under MariaDB REPEATABLE READ,
        // a plain aggregate could retain a snapshot from before a competing
        // checkout committed even after the facility mutex was released.
        $bookings = $query
            ->orderBy('id')
            ->lockForUpdate()
            ->get(['id', 'start_time', 'end_time', 'pax']);

        return $this->peakOccupancy($bookings, $startTime, $endTime);
    }

    /**
     * Calculate read-only peak occupancy for availability and operational
     * projections. Every caller uses this same sweep-line implementation so
     * public slots, admin indicators, and transactional enforcement cannot
     * drift into different capacity semantics.
     *
     * @param  Collection<int, Booking>  $bookings
     * @return array{pax: int, bookings: int}
     */
    public function occupancyMetrics(
        Collection $bookings,
        string $startTime,
        string $endTime,
    ): array {
        $events = [];

        foreach ($bookings as $booking) {
            $bookingStart = substr((string) $booking->start_time, 0, 5);
            $bookingEnd = substr((string) $booking->end_time, 0, 5);
            $overlapStart = $bookingStart > $startTime ? $bookingStart : $startTime;
            $overlapEnd = $bookingEnd < $endTime ? $bookingEnd : $endTime;

            if ($overlapStart >= $overlapEnd) {
                continue;
            }

            $pax = max(1, (int) ($booking->pax ?? 1));
            $events[$overlapStart]['pax'] = ($events[$overlapStart]['pax'] ?? 0) + $pax;
            $events[$overlapStart]['bookings'] = ($events[$overlapStart]['bookings'] ?? 0) + 1;
            $events[$overlapEnd]['pax'] = ($events[$overlapEnd]['pax'] ?? 0) - $pax;
            $events[$overlapEnd]['bookings'] = ($events[$overlapEnd]['bookings'] ?? 0) - 1;
        }

        ksort($events, SORT_STRING);
        $currentPax = 0;
        $currentBookings = 0;
        $peakPax = 0;
        $peakBookings = 0;

        foreach ($events as $delta) {
            $currentPax += $delta['pax'];
            $currentBookings += $delta['bookings'];
            $peakPax = max($peakPax, $currentPax);
            $peakBookings = max($peakBookings, $currentBookings);
        }

        return [
            'pax' => $peakPax,
            'bookings' => $peakBookings,
        ];
    }

    /**
     * @param  Collection<int, Booking>  $bookings
     */
    private function peakOccupancy(
        Collection $bookings,
        string $startTime,
        string $endTime,
    ): int {
        return $this->occupancyMetrics($bookings, $startTime, $endTime)['pax'];
    }

    private function logConflict(
        Facility $facility,
        ?FacilityUnit $unit,
        string $reasonCode,
        int $requestedPax,
        ?int $occupiedPax = null,
        ?int $capacity = null,
    ): void {
        $this->operationalLog->record('reservation_conflict', [
            'facility_id' => $facility->id,
            'unit_id' => $unit?->id,
            'requested_pax' => $requestedPax,
            'occupied_pax' => $occupiedPax,
            'capacity' => $capacity,
            'reason_code' => $reasonCode,
        ]);
    }
}
