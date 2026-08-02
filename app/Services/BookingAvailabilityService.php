<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Support\FacilityPriceResolver;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

class BookingAvailabilityService
{
    private const DEFAULT_OPEN_MINUTES = 6 * 60;

    private const DEFAULT_CLOSE_MINUTES = 22 * 60;

    public function __construct(
        private readonly FacilityPriceResolver $priceResolver,
        private readonly BookingCalendarService $calendarService,
        private readonly BookingInventoryService $inventoryService,
    ) {}

    /**
     * Return compact availability summaries for one to fourteen consecutive dates.
     *
     * @return array<string, mixed>
     */
    public function availability(CarbonInterface|string $from, int $days = 1): array
    {
        $timezone = $this->timezone();
        $startDate = $this->date($from);
        $days = max(1, min(14, $days));
        $dates = collect(range(0, $days - 1))
            ->map(fn (int $offset): CarbonImmutable => $startDate->addDays($offset));
        $endDate = $dates->last();
        $now = CarbonImmutable::now($timezone);
        $schedules = $this->calendarService->schedulesForDates($dates);
        $dateStates = $dates->mapWithKeys(function (CarbonImmutable $date) use ($schedules): array {
            $dateString = $date->toDateString();

            return [
                $dateString => $this->calendarService->dateStateFromSchedule(
                    $date,
                    $schedules->get($this->scheduleKey($date)),
                ),
            ];
        });

        $facilities = Facility::query()
            ->visibleInBookingDirectory()
            ->with([
                'category',
                'prices' => fn ($query) => $query
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'units' => fn ($query) => $query
                    ->where('is_active', true)
                    ->orderBy('id'),
                'units.prices' => fn ($query) => $query
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $bookingsByDate = $dateStates->contains(
            fn (array $state): bool => ! $state['closed'],
        )
            ? Booking::query()
                ->where('booking_date', '>=', $startDate->toDateString())
                ->where('booking_date', '<', $endDate->addDay()->toDateString())
                ->occupyingInventory($now)
                ->get([
                    'id',
                    'facility_id',
                    'facility_unit_id',
                    'booking_date',
                    'start_time',
                    'end_time',
                    'pax',
                    'status',
                ])
                ->groupBy(fn (Booking $booking): string => $booking->booking_date->format('Y-m-d'))
            : collect();

        $datePayloads = [];

        foreach ($dates as $date) {
            $dateString = $date->toDateString();
            $dateState = $dateStates->get($dateString);
            /** @var Collection<int, Booking> $dateBookings */
            $dateBookings = $bookingsByDate->get($dateString, collect());

            $facilityPayloads = $facilities
                ->map(function (Facility $facility) use ($date, $dateBookings, $dateState, $now): array {
                    if ($dateState['closed']) {
                        return $this->closedFacilitySummary($facility, $dateState['reason']);
                    }

                    /** @var Collection<int, Booking> $facilityBookings */
                    $facilityBookings = $dateBookings
                        ->where('facility_id', $facility->id)
                        ->values();

                    return $this->facilitySummary($facility, $date, $facilityBookings, $now);
                })
                ->values();

            $datePayloads[$dateString] = [
                'date' => $dateString,
                'closed' => $dateState['closed'],
                'reason' => $dateState['reason'],
                'summary' => [
                    'total_facility_count' => $facilityPayloads->count(),
                    'available_facility_count' => $facilityPayloads
                        ->whereIn('status', ['available', 'limited'])
                        ->count(),
                    'available_slot_count' => (int) $facilityPayloads->sum('available_slot_count'),
                ],
                'facilities' => $facilityPayloads->all(),
            ];
        }

        return [
            'today' => CarbonImmutable::now($timezone)->toDateString(),
            'timezone' => $timezone,
            'from' => $startDate->toDateString(),
            'days' => $days,
            'dates' => $datePayloads,
            'calendar' => $this->calendarService->metadata($now),
            'generated_at' => CarbonImmutable::now($timezone)->toIso8601String(),
        ];
    }

    /**
     * Preserve the existing public slot response while sharing the same evaluator.
     *
     * @return array{
     *     closed: bool,
     *     reason?: string,
     *     requires_unit?: bool,
     *     slots: array<int, array<string, mixed>>,
     *     closed_dates: array<int, string>
     * }
     */
    public function slots(
        Facility $facility,
        ?FacilityUnit $unit,
        CarbonInterface|string $date,
    ): array {
        $bookingDate = $this->date($date);
        $dateState = $this->calendarService->dateState($bookingDate);

        if ($dateState['closed']) {
            return [
                'closed' => true,
                'reason' => $dateState['reason'],
                'slots' => [],
                'closed_dates' => $dateState['closed_dates'],
            ];
        }

        $now = CarbonImmutable::now($this->timezone());
        /** @var Collection<int, Booking> $bookings */
        $bookings = Booking::query()
            ->where('facility_id', $facility->id)
            ->where(
                'booking_date',
                '>=',
                $bookingDate->toDateString(),
            )
            ->where(
                'booking_date',
                '<',
                $bookingDate->addDay()->toDateString(),
            )
            ->occupyingInventory($now)
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

        $evaluated = $this->evaluateResource(
            $facility,
            $unit,
            $bookingDate,
            $bookings,
            $now,
            true,
        );

        return [
            'closed' => false,
            'requires_unit' => false,
            'slots' => $evaluated['slots'],
            'closed_dates' => $dateState['closed_dates'],
        ];
    }

    /**
     * Inspect one requested interval against the same rules used by public availability.
     *
     * @return array{
     *     bookable: bool,
     *     reason: ?string
     * }
     */
    public function inspectSlot(
        Facility $facility,
        ?FacilityUnit $unit,
        CarbonInterface|string $date,
        string $startTime,
        string $endTime,
    ): array {
        $bookingDate = $this->date($date);
        $dateState = $this->calendarService->dateState($bookingDate);

        if ($dateState['closed']) {
            return [
                'bookable' => false,
                'reason' => $dateState['reason'],
            ];
        }

        $now = CarbonImmutable::now($this->timezone());
        /** @var Collection<int, Booking> $bookings */
        $bookings = Booking::query()
            ->where('facility_id', $facility->id)
            ->where(
                'booking_date',
                '>=',
                $bookingDate->toDateString(),
            )
            ->where(
                'booking_date',
                '<',
                $bookingDate->addDay()->toDateString(),
            )
            ->occupyingInventory($now)
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
        $evaluated = $this->evaluateResource(
            $facility,
            $unit,
            $bookingDate,
            $bookings,
            $now,
            false,
        );
        $slot = collect($evaluated['evaluated_slots'])
            ->first(fn (array $candidate): bool => $candidate['start_time'] === $startTime
                && $candidate['end_time'] === $endTime);

        if (! $slot) {
            return [
                'bookable' => false,
                'reason' => 'not_configured',
            ];
        }

        if ($slot['status'] === 'available') {
            return [
                'bookable' => true,
                'reason' => null,
            ];
        }

        return [
            'bookable' => false,
            'reason' => $slot['_reason'] === 'elapsed' ? 'elapsed' : 'full',
        ];
    }

    /**
     * @param  Collection<int, Booking>  $bookings
     * @return array<string, mixed>
     */
    private function facilitySummary(
        Facility $facility,
        CarbonImmutable $date,
        Collection $bookings,
        CarbonImmutable $now,
    ): array {
        /** @var EloquentCollection<int, FacilityUnit> $units */
        $units = $facility->units;

        if ($units->isEmpty()) {
            $evaluated = $this->evaluateResource($facility, null, $date, $bookings, $now, false);

            return [
                'facility_id' => $facility->id,
                ...$evaluated['summary'],
                'units' => [],
            ];
        }

        $unitPayloads = $units
            ->map(function (FacilityUnit $unit) use ($facility, $date, $bookings, $now): array {
                $evaluated = $this->evaluateResource($facility, $unit, $date, $bookings, $now, false);

                return [
                    'facility_unit_id' => $unit->id,
                    ...$evaluated['summary'],
                ];
            })
            ->values();

        $availableStartTimes = $unitPayloads
            ->pluck('available_start_times')
            ->flatten()
            ->unique()
            ->sort()
            ->values()
            ->all();
        $availableSlotCount = (int) $unitPayloads->sum('available_slot_count');
        $totalSlotCount = (int) $unitPayloads->sum('total_slot_count');
        [$status, $reason] = $this->aggregateStatus(
            $availableSlotCount,
            $totalSlotCount,
            $unitPayloads->where('total_slot_count', '>', 0)->every(
                fn (array $unit): bool => $unit['reason'] === 'elapsed'
            ),
        );

        return [
            'facility_id' => $facility->id,
            'status' => $status,
            'reason' => $reason,
            'available_slot_count' => $availableSlotCount,
            'total_slot_count' => $totalSlotCount,
            'available_start_times' => $availableStartTimes,
            'next_available_at' => $availableStartTimes[0] ?? null,
            'units' => $unitPayloads->all(),
        ];
    }

    /**
     * @param  Collection<int, Booking>  $bookings
     * @return array{
     *     summary: array<string, mixed>,
     *     slots: array<int, array<string, mixed>>,
     *     evaluated_slots: array<int, array<string, mixed>>
     * }
     */
    private function evaluateResource(
        Facility $facility,
        ?FacilityUnit $unit,
        CarbonImmutable $date,
        Collection $bookings,
        CarbonImmutable $now,
        bool $includeSlots,
    ): array {
        $capacity = $this->inventoryService->capacityFor($facility, $unit);
        $durationMinutes = max(
            1,
            $this->priceResolver->durationForCategoryForUnit($facility, $unit, 'umum'),
        );
        $starts = $this->configuredStarts($facility, $unit, $date);
        $evaluatedSlots = [];

        foreach ($starts as $startTime) {
            $startMinutes = $this->minutes($startTime);
            $endMinutes = $startMinutes + $durationMinutes;

            if ($endMinutes > 24 * 60) {
                continue;
            }

            $endTime = $this->formatMinutes($endMinutes);
            $elapsed = $this->isElapsed($date, $startMinutes, $now);
            $occupiedPax = $this->occupiedPax($bookings, $unit, $startTime, $endTime);
            $available = ! $elapsed && $occupiedPax < $capacity;

            $slot = [
                'start_time' => $startTime,
                'end_time' => $endTime,
                'label' => $startTime.' - '.$endTime,
                'status' => $available ? 'available' : 'booked',
                'remaining' => $available ? max(0, $capacity - $occupiedPax) : 0,
                'facility_unit_id' => $unit?->id,
                '_reason' => $available ? null : ($elapsed ? 'elapsed' : 'occupied'),
            ];

            if ($includeSlots) {
                $price = $this->priceResolver->priceForSlotForUnit(
                    $facility,
                    $unit,
                    'umum',
                    $date,
                    $startTime,
                    $endTime,
                );
                $slot['price'] = $price > 0
                    ? 'Rp '.number_format($price, 0, ',', '.')
                    : 'Hubungi Kami';
            }

            $evaluatedSlots[] = $slot;
        }

        $availableStartTimes = collect($evaluatedSlots)
            ->where('status', 'available')
            ->pluck('start_time')
            ->unique()
            ->sort()
            ->values()
            ->all();
        $availableSlotCount = count($availableStartTimes);
        $totalSlotCount = count($evaluatedSlots);
        $allUnavailableSlotsElapsed = $totalSlotCount > 0
            && collect($evaluatedSlots)
                ->where('status', 'booked')
                ->every(fn (array $slot): bool => $slot['_reason'] === 'elapsed');
        [$status, $reason] = $this->aggregateStatus(
            $availableSlotCount,
            $totalSlotCount,
            $allUnavailableSlotsElapsed,
        );

        return [
            'summary' => [
                'status' => $status,
                'reason' => $reason,
                'available_slot_count' => $availableSlotCount,
                'total_slot_count' => $totalSlotCount,
                'available_start_times' => $availableStartTimes,
                'next_available_at' => $availableStartTimes[0] ?? null,
            ],
            'slots' => collect($evaluatedSlots)
                ->map(function (array $slot): array {
                    $slot['reason'] = match ($slot['_reason']) {
                        'elapsed' => 'elapsed',
                        'occupied' => 'fully_booked',
                        default => null,
                    };
                    unset($slot['_reason']);

                    return $slot;
                })
                ->values()
                ->all(),
            'evaluated_slots' => $evaluatedSlots,
        ];
    }

    /**
     * @param  Collection<int, Booking>  $bookings
     */
    private function occupiedPax(
        Collection $bookings,
        ?FacilityUnit $unit,
        string $startTime,
        string $endTime,
    ): int {
        return (int) $bookings
            ->filter(function (Booking $booking) use ($unit, $startTime, $endTime): bool {
                if ($unit
                    && $booking->facility_unit_id !== null
                    && (int) $booking->facility_unit_id !== (int) $unit->id) {
                    return false;
                }

                $bookingStart = substr((string) $booking->start_time, 0, 5);
                $bookingEnd = substr((string) $booking->end_time, 0, 5);

                return $bookingStart < $endTime && $bookingEnd > $startTime;
            })
            ->sum(fn (Booking $booking): int => max(1, (int) ($booking->pax ?? 1)));
    }

    /**
     * @return array<int, string>
     */
    private function configuredStarts(
        Facility $facility,
        ?FacilityUnit $unit,
        CarbonImmutable $date,
    ): array {
        $activeSlots = $unit?->use_custom_schedule
            ? ($unit->active_slots ?? [])
            : $facility->active_slots;

        if ($activeSlots === null) {
            $durationMinutes = max(
                1,
                $this->priceResolver->durationForCategoryForUnit($facility, $unit, 'umum'),
            );
            $starts = [];

            for (
                $minute = self::DEFAULT_OPEN_MINUTES;
                $minute + $durationMinutes <= self::DEFAULT_CLOSE_MINUTES;
                $minute += $durationMinutes
            ) {
                $starts[] = $this->formatMinutes($minute);
            }

            return $starts;
        }

        $daySlots = $activeSlots[$date->format('l')] ?? [];
        if (! is_array($daySlots)) {
            return [];
        }

        return collect($daySlots)
            ->filter(fn (mixed $start): bool => is_string($start)
                && preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $start) === 1)
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function closedFacilitySummary(Facility $facility, string $reason): array
    {
        return [
            'facility_id' => $facility->id,
            'status' => 'closed',
            'reason' => $reason,
            'available_slot_count' => 0,
            'total_slot_count' => 0,
            'available_start_times' => [],
            'next_available_at' => null,
            'units' => $facility->units
                ->map(fn (FacilityUnit $unit): array => [
                    'facility_unit_id' => $unit->id,
                    'status' => 'closed',
                    'reason' => $reason,
                    'available_slot_count' => 0,
                    'total_slot_count' => 0,
                    'available_start_times' => [],
                    'next_available_at' => null,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @return array{0: string, 1: ?string}
     */
    private function aggregateStatus(
        int $availableSlotCount,
        int $totalSlotCount,
        bool $allUnavailableSlotsElapsed,
    ): array {
        if ($totalSlotCount === 0) {
            return ['no_schedule', 'no_schedule'];
        }

        if ($availableSlotCount === 0) {
            return [
                'full',
                $allUnavailableSlotsElapsed ? 'elapsed' : 'fully_booked',
            ];
        }

        if ($availableSlotCount < $totalSlotCount) {
            return ['limited', 'partially_available'];
        }

        return ['available', null];
    }

    private function isElapsed(
        CarbonImmutable $date,
        int $startMinutes,
        CarbonImmutable $now,
    ): bool {
        if (! $date->isSameDay($now)) {
            return false;
        }

        return $date
            ->setTime(intdiv($startMinutes, 60), $startMinutes % 60)
            ->lessThanOrEqualTo($now);
    }

    private function date(CarbonInterface|string $date): CarbonImmutable
    {
        if ($date instanceof CarbonInterface) {
            return CarbonImmutable::instance($date)
                ->setTimezone($this->timezone())
                ->startOfDay();
        }

        return CarbonImmutable::createFromFormat(
            '!Y-m-d',
            $date,
            $this->timezone(),
        );
    }

    private function scheduleKey(CarbonInterface $date): string
    {
        return sprintf('%04d-%02d', $date->year, $date->month);
    }

    private function minutes(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', substr($time, 0, 5)));

        return ($hours * 60) + $minutes;
    }

    private function formatMinutes(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    private function timezone(): string
    {
        return (string) config('app.timezone', 'UTC');
    }
}
