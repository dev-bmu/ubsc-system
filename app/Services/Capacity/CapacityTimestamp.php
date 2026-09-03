<?php

namespace App\Services\Capacity;

use Carbon\CarbonImmutable;

final class CapacityTimestamp
{
    public static function parse(mixed $value): ?CarbonImmutable
    {
        if (! self::valid($value)) {
            return null;
        }

        try {
            return CarbonImmutable::parse($value)->utc()->setMicrosecond(0);
        } catch (\Throwable) {
            return null;
        }
    }

    public static function valid(mixed $value): bool
    {
        if (! is_string($value)
            || str_ends_with($value, '-00:00')
            || preg_match(
                '/\A(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d{1,6})?(?:Z|[+\-](?<offset_hour>\d{2}):(?<offset_minute>\d{2}))\z/',
                $value,
                $parts,
            ) !== 1) {
            return false;
        }

        $year = (int) $parts['year'];
        $month = (int) $parts['month'];
        $day = (int) $parts['day'];
        $hour = (int) $parts['hour'];
        $minute = (int) $parts['minute'];
        $second = (int) $parts['second'];
        $offsetHour = ($parts['offset_hour'] ?? '') === '' ? 0 : (int) $parts['offset_hour'];
        $offsetMinute = ($parts['offset_minute'] ?? '') === '' ? 0 : (int) $parts['offset_minute'];

        return $year >= 1
            && checkdate($month, $day, $year)
            && $hour <= 23
            && $minute <= 59
            && $second <= 59
            && $offsetHour <= 14
            && $offsetMinute <= 59
            && ($offsetHour < 14 || $offsetMinute === 0);
    }
}
