<?php

namespace App\Models;

use Illuminate\Support\Carbon;
use Illuminate\Database\Eloquent\Model;

class BookingSchedule extends Model
{
    protected $fillable = ['month', 'year', 'is_open', 'closed_dates'];

    protected function casts(): array
    {
        return [
            'is_open'      => 'boolean',
            'closed_dates' => 'array',
        ];
    }

    public static function isOpen(int $month, int $year): bool
    {
        return static::where('month', $month)
            ->where('year', $year)
            ->where('is_open', true)
            ->exists();
    }

    public static function cleanClosedDatesForMonth(?array $dates, int $month, int $year): array
    {
        return collect($dates ?? [])
            ->filter(function (mixed $date) use ($month, $year): bool {
                if (! is_string($date)) {
                    return false;
                }

                try {
                    $parsed = Carbon::createFromFormat('Y-m-d', $date);
                } catch (\Throwable) {
                    return false;
                }

                return $parsed->format('Y-m-d') === $date
                    && $parsed->month === $month
                    && $parsed->year === $year;
            })
            ->unique()
            ->sort()
            ->values()
            ->all();
    }
}
