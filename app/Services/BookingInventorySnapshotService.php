<?php

namespace App\Services;

use App\Models\Booking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

final class BookingInventorySnapshotService
{
    public function __construct(
        private readonly BookingInventoryService $inventoryService,
    ) {}

    /**
     * Build current, read-only inventory snapshots without issuing one query
     * per booking. Shared-capacity rows are resolved from one bounded query
     * across the facilities and dates visible in the current admin result.
     *
     * @param  Collection<int, Booking>  $bookings
     * @return array<int, array<string, bool|int|string|null>>
     */
    public function forBookings(Collection $bookings): array
    {
        if ($bookings->isEmpty()) {
            return [];
        }

        $snapshots = [];
        $sharedBookings = collect();

        foreach ($bookings as $booking) {
            $facility = $booking->facility;
            $unit = $booking->facilityUnit;
            $capacity = $facility
                ? $this->inventoryService->capacityFor($facility, $unit)
                : 1;
            $shared = $capacity > 1;

            $snapshots[(int) $booking->id] = [
                'mode' => $shared ? 'shared' : 'exclusive',
                'capacity' => $capacity,
                'occupied' => null,
                'remaining' => null,
                'utilization_percent' => null,
                'concurrent_bookings' => null,
                'holds_inventory' => false,
                'over_capacity' => false,
                'status' => $shared ? 'released' : 'exclusive',
            ];

            if ($shared && $facility) {
                $sharedBookings->push($booking);
            }
        }

        if ($sharedBookings->isEmpty()) {
            return $snapshots;
        }

        $facilityIds = $sharedBookings
            ->pluck('facility_id')
            ->map(fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
        $dates = $sharedBookings
            ->map(fn (Booking $booking): string => $booking->booking_date->format('Y-m-d'))
            ->unique()
            ->values()
            ->all();

        /** @var Collection<int, Booking> $occupants */
        $occupants = Booking::query()
            ->whereIn('facility_id', $facilityIds)
            ->where(function (Builder $dateQuery) use ($dates): void {
                foreach ($dates as $date) {
                    $start = Carbon::parse($date)->startOfDay();
                    $end = $start->copy()->addDay();

                    $dateQuery->orWhere(function (Builder $dayQuery) use ($start, $end): void {
                        $dayQuery
                            ->where('booking_date', '>=', $start)
                            ->where('booking_date', '<', $end);
                    });
                }
            })
            ->occupyingInventory()
            ->orderBy('id')
            ->get([
                'id',
                'facility_id',
                'facility_unit_id',
                'booking_date',
                'start_time',
                'end_time',
                'pax',
                'status',
            ]);
        $occupantsByDate = $occupants->groupBy(
            fn (Booking $booking): string => $this->resourceDateKey($booking),
        );
        $occupyingIds = $occupants
            ->pluck('id')
            ->mapWithKeys(fn ($id): array => [(int) $id => true]);
        $intervalCache = [];

        foreach ($sharedBookings as $booking) {
            $capacity = (int) $snapshots[(int) $booking->id]['capacity'];
            $unitId = $booking->facility_unit_id !== null
                ? (int) $booking->facility_unit_id
                : null;
            $start = substr((string) $booking->start_time, 0, 5);
            $end = substr((string) $booking->end_time, 0, 5);
            $intervalKey = implode('|', [
                $this->resourceDateKey($booking),
                $unitId ?? 'parent',
                $start,
                $end,
            ]);

            if (! isset($intervalCache[$intervalKey])) {
                /** @var Collection<int, Booking> $dateOccupants */
                $dateOccupants = $occupantsByDate->get(
                    $this->resourceDateKey($booking),
                    collect(),
                );
                $matching = $dateOccupants
                    ->filter(function (Booking $candidate) use ($unitId, $start, $end): bool {
                        if ($unitId !== null
                            && $candidate->facility_unit_id !== null
                            && (int) $candidate->facility_unit_id !== $unitId) {
                            return false;
                        }

                        $candidateStart = substr((string) $candidate->start_time, 0, 5);
                        $candidateEnd = substr((string) $candidate->end_time, 0, 5);

                        return $candidateStart < $end && $candidateEnd > $start;
                    })
                    ->values();

                $metrics = $this->inventoryService->occupancyMetrics(
                    $matching,
                    $start,
                    $end,
                );
                $intervalCache[$intervalKey] = [
                    'occupied' => $metrics['pax'],
                    'concurrent_bookings' => $metrics['bookings'],
                ];
            }

            $occupied = (int) $intervalCache[$intervalKey]['occupied'];
            $remaining = max(0, $capacity - $occupied);
            $holdsInventory = $occupyingIds->has((int) $booking->id);
            $overCapacity = $occupied > $capacity;
            $utilization = $capacity > 0
                ? min(100, (int) round(($occupied / $capacity) * 100))
                : 0;
            $status = match (true) {
                ! $holdsInventory => 'released',
                $overCapacity => 'over_capacity',
                $remaining === 0 => 'full',
                $utilization >= 75 => 'limited',
                default => 'available',
            };

            $snapshots[(int) $booking->id] = [
                'mode' => 'shared',
                'capacity' => $capacity,
                'occupied' => $occupied,
                'remaining' => $remaining,
                'utilization_percent' => $utilization,
                'concurrent_bookings' => (int) $intervalCache[$intervalKey]['concurrent_bookings'],
                'holds_inventory' => $holdsInventory,
                'over_capacity' => $overCapacity,
                'status' => $status,
            ];
        }

        return $snapshots;
    }

    private function resourceDateKey(Booking $booking): string
    {
        return (int) $booking->facility_id.'|'.$booking->booking_date->format('Y-m-d');
    }
}
