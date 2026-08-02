<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Services\Payments\PaymentOperationalLogger;
use Carbon\CarbonInterface;
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

        $query = Booking::query()
            ->where('facility_id', $facility->id)
            ->whereDate('booking_date', $date)
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime)
            ->occupyingInventory($at);

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

        // This must be a locking/current read. Under MariaDB's default
        // REPEATABLE READ, a plain aggregate can keep the transaction's old
        // snapshot even after it waited for the facility mutex. Fetching the
        // occupying rows FOR UPDATE makes the second checkout observe the
        // first committed hold before it can write its own reservation.
        $occupiedPax = (int) $query
            ->orderBy('id')
            ->lockForUpdate()
            ->get(['id', 'pax'])
            ->sum(fn (Booking $booking): int => max(1, (int) $booking->pax));
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

            throw ValidationException::withMessages([
                $errorKey => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);
        }
    }

    public function capacityFor(Facility $facility, ?FacilityUnit $unit): int
    {
        if ($unit) {
            return 1;
        }

        $facility->loadMissing('category');
        $classification = Str::lower(implode(' ', array_filter([
            $facility->category?->slug,
            $facility->category?->name,
            $facility->class_code,
        ])));
        $isClass = Str::contains($classification, ['kelas', 'class']);

        return $isClass ? max(1, (int) ($facility->capacity ?? 1)) : 1;
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
            $cohortPax = (int) $bookings
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
                })
                ->sum(fn (Booking $candidate): int => max(1, (int) ($candidate->pax ?? 1)));

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
