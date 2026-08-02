<?php

namespace App\Services;

use App\Models\BookingSchedule;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class BookingCalendarService
{
    public const HORIZON_MONTHS = 7;

    private const REVISION_CACHE_KEY = 'booking-calendar:schedule-revision:v1';

    private const MONTH_NAMES = [
        1 => 'Januari',
        2 => 'Februari',
        3 => 'Maret',
        4 => 'April',
        5 => 'Mei',
        6 => 'Juni',
        7 => 'Juli',
        8 => 'Agustus',
        9 => 'September',
        10 => 'Oktober',
        11 => 'November',
        12 => 'Desember',
    ];

    /**
     * Calendar policy consumed by both the initial Inertia page and the
     * availability endpoint.
     *
     * @return array<string, mixed>
     */
    public function metadata(CarbonInterface|string|null $at = null): array
    {
        $today = $this->date($at);
        $monthDates = collect(range(0, self::HORIZON_MONTHS - 1))
            ->map(fn (int $offset): CarbonImmutable => $today
                ->startOfMonth()
                ->addMonths($offset));
        $schedules = $this->schedulesForDates($monthDates);
        $months = [];
        $openMonths = [];
        $firstBookableDate = null;
        $lastBookableDate = null;

        foreach ($monthDates as $monthDate) {
            $key = $this->monthKey($monthDate);
            $schedule = $schedules->get($key);
            $closedDates = BookingSchedule::cleanClosedDatesForMonth(
                $schedule?->closed_dates,
                $monthDate->month,
                $monthDate->year,
            );
            $isOpen = (bool) ($schedule?->is_open ?? false);

            if ($isOpen) {
                $openMonths[] = $key;
            }

            $months[$key] = [
                'key' => $key,
                'month' => $monthDate->month,
                'year' => $monthDate->year,
                'label' => $this->monthLabel($monthDate->month, $monthDate->year),
                'is_open' => $isOpen,
                'starts_on' => $monthDate->startOfMonth()->toDateString(),
                'ends_on' => $monthDate->endOfMonth()->toDateString(),
                'closed_dates' => $closedDates,
            ];

            if (! $isOpen) {
                continue;
            }

            $cursor = $monthDate->startOfMonth()->max($today);
            $monthEnd = $monthDate->endOfMonth();

            while ($cursor->lessThanOrEqualTo($monthEnd)) {
                $date = $cursor->toDateString();

                if (! in_array($date, $closedDates, true)) {
                    $firstBookableDate ??= $date;
                    $lastBookableDate = $date;
                }

                $cursor = $cursor->addDay();
            }
        }

        $firstOpenMonth = $openMonths[0] ?? null;
        $lastOpenMonth = $openMonths === []
            ? null
            : $openMonths[array_key_last($openMonths)];
        $maxDate = $lastOpenMonth === null
            ? null
            : $months[$lastOpenMonth]['ends_on'];
        [$holidays, $holidaySources, $holidayCoverage] = $this->holidayMetadata(
            $monthDates->first()->startOfMonth(),
            $monthDates->last()->endOfMonth(),
        );

        return [
            'locale' => 'id-ID',
            'timezone' => $this->timezone(),
            'week_starts_on' => 1,
            'weekend_days' => [0],
            'schedule_revision' => $this->revision(),
            'window' => [
                'min_date' => $today->toDateString(),
                'max_date' => $maxDate,
                'default_date' => $firstBookableDate,
                'first_bookable_date' => $firstBookableDate,
                'last_bookable_date' => $lastBookableDate,
                'first_open_month' => $firstOpenMonth,
                'last_open_month' => $lastOpenMonth,
            ],
            'open_months' => $openMonths,
            'months' => $months,
            'holidays' => $holidays,
            'holiday_sources' => $holidaySources,
            'holiday_coverage' => $holidayCoverage,
        ];
    }

    /**
     * Rows used by the schedule-control page. Keeping this projection here
     * prevents the public and admin calendar horizons from drifting apart.
     *
     * @return array<int, array<string, mixed>>
     */
    public function adminScheduleRows(CarbonInterface|string|null $at = null): array
    {
        return array_values($this->metadata($at)['months']);
    }

    /**
     * @param  Collection<int, CarbonInterface>  $dates
     * @return Collection<string, BookingSchedule>
     */
    public function schedulesForDates(Collection $dates): Collection
    {
        $monthPairs = $dates
            ->map(fn (CarbonInterface $date): array => [
                'month' => $date->month,
                'year' => $date->year,
            ])
            ->unique(fn (array $pair): string => $pair['year'].'-'.$pair['month'])
            ->values();

        if ($monthPairs->isEmpty()) {
            return collect();
        }

        return BookingSchedule::query()
            ->where(function (Builder $query) use ($monthPairs): void {
                foreach ($monthPairs as $pair) {
                    $query->orWhere(function (Builder $monthQuery) use ($pair): void {
                        $monthQuery
                            ->where('month', $pair['month'])
                            ->where('year', $pair['year']);
                    });
                }
            })
            ->get()
            ->keyBy(fn (BookingSchedule $schedule): string => sprintf(
                '%04d-%02d',
                $schedule->year,
                $schedule->month,
            ));
    }

    /**
     * @return array{closed: bool, reason: ?string, closed_dates: array<int, string>}
     */
    public function dateState(
        CarbonInterface|string $date,
    ): array {
        $bookingDate = $this->date($date);
        $schedule = BookingSchedule::query()
            ->where('month', $bookingDate->month)
            ->where('year', $bookingDate->year)
            ->first();

        return $this->dateStateFromSchedule($bookingDate, $schedule);
    }

    /**
     * Evaluate a date against an already-loaded schedule. A null schedule is
     * deliberately treated as a closed month without issuing another query.
     *
     * @return array{closed: bool, reason: ?string, closed_dates: array<int, string>}
     */
    public function dateStateFromSchedule(
        CarbonInterface|string $date,
        ?BookingSchedule $schedule,
    ): array {
        $bookingDate = $this->date($date);
        $closedDates = BookingSchedule::cleanClosedDatesForMonth(
            $schedule?->closed_dates,
            $bookingDate->month,
            $bookingDate->year,
        );

        if (! ($schedule?->is_open ?? false)) {
            return [
                'closed' => true,
                'reason' => 'month_closed',
                'closed_dates' => $closedDates,
            ];
        }

        if (in_array($bookingDate->toDateString(), $closedDates, true)) {
            return [
                'closed' => true,
                'reason' => 'date_closed',
                'closed_dates' => $closedDates,
            ];
        }

        return [
            'closed' => false,
            'reason' => null,
            'closed_dates' => $closedDates,
        ];
    }

    public function revision(): string
    {
        try {
            return (string) Cache::rememberForever(
                self::REVISION_CACHE_KEY,
                fn (): string => (string) Str::uuid(),
            );
        } catch (\Throwable) {
            return $this->databaseRevision();
        }
    }

    public function bumpRevision(): string
    {
        $revision = (string) Str::uuid();

        try {
            Cache::forever(self::REVISION_CACHE_KEY, $revision);
        } catch (\Throwable) {
            return $this->databaseRevision();
        }

        return $revision;
    }

    public function monthLabel(int $month, int $year): string
    {
        return (self::MONTH_NAMES[$month] ?? (string) $month).' '.$year;
    }

    /**
     * @return array{
     *     0: array<string, array<string, mixed>>,
     *     1: array<int, array<string, mixed>>,
     *     2: array<int, array<string, mixed>>
     * }
     */
    private function holidayMetadata(
        CarbonImmutable $startsOn,
        CarbonImmutable $endsOn,
    ): array {
        $holidays = [];
        $sources = [];
        $coverage = [];

        foreach (range($startsOn->year, $endsOn->year) as $year) {
            $yearConfig = config("indonesia_holidays.{$year}");
            $source = is_array($yearConfig) && is_array($yearConfig['source'] ?? null)
                ? $yearConfig['source']
                : null;

            $coverage[] = [
                'year' => $year,
                'status' => $source['status'] ?? 'unavailable',
                'source_id' => $source['id'] ?? null,
            ];

            if (! $source) {
                continue;
            }

            $sources[] = ['year' => $year, ...$source];
            $days = is_array($yearConfig['days'] ?? null)
                ? $yearConfig['days']
                : [];

            foreach ($days as $date => $holiday) {
                if (! is_string($date)
                    || ! is_array($holiday)
                    || $date < $startsOn->toDateString()
                    || $date > $endsOn->toDateString()) {
                    continue;
                }

                $type = $holiday['type'] ?? null;
                if (! in_array($type, ['national_holiday', 'collective_leave'], true)
                    || ! is_string($holiday['label'] ?? null)) {
                    continue;
                }

                $holidays[$date] = [
                    'date' => $date,
                    'name' => $holiday['label'],
                    'type' => $type,
                    'is_red_date' => $type === 'national_holiday',
                    'source_id' => $source['id'],
                ];
            }
        }

        ksort($holidays);

        return [$holidays, $sources, $coverage];
    }

    private function monthKey(CarbonInterface $date): string
    {
        return sprintf('%04d-%02d', $date->year, $date->month);
    }

    private function databaseRevision(): string
    {
        $snapshot = BookingSchedule::query()
            ->orderBy('year')
            ->orderBy('month')
            ->get(['year', 'month', 'is_open', 'closed_dates', 'updated_at'])
            ->map(fn (BookingSchedule $schedule): array => [
                'year' => $schedule->year,
                'month' => $schedule->month,
                'is_open' => $schedule->is_open,
                'closed_dates' => BookingSchedule::cleanClosedDatesForMonth(
                    $schedule->closed_dates,
                    $schedule->month,
                    $schedule->year,
                ),
                'updated_at' => $schedule->updated_at?->format('Y-m-d H:i:s.u'),
            ])
            ->all();

        return hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
    }

    private function date(CarbonInterface|string|null $date): CarbonImmutable
    {
        if ($date instanceof CarbonInterface) {
            return CarbonImmutable::instance($date)
                ->setTimezone($this->timezone())
                ->startOfDay();
        }

        if (is_string($date)) {
            return CarbonImmutable::createFromFormat(
                '!Y-m-d',
                $date,
                $this->timezone(),
            );
        }

        return CarbonImmutable::now($this->timezone())->startOfDay();
    }

    private function timezone(): string
    {
        return (string) config('app.timezone', 'Asia/Jakarta');
    }
}
