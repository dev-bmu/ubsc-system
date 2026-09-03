<?php

namespace App\Support;

use Carbon\CarbonImmutable;

final class StrictRfc3339Timestamp
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
            || strlen($value) > 64
            || str_ends_with($value, '-00:00')
            || preg_match(
                '/\A(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d{1,6})?(?:Z|[+\-](?<offset_hour>\d{2}):(?<offset_minute>\d{2}))\z/',
                $value,
                $parts,
            ) !== 1) {
            return false;
        }

        $year = (int) $parts['year'];
        $offsetHour = ($parts['offset_hour'] ?? '') === ''
            ? 0
            : (int) $parts['offset_hour'];
        $offsetMinute = ($parts['offset_minute'] ?? '') === ''
            ? 0
            : (int) $parts['offset_minute'];

        // MariaDB DATETIME and the operational evidence domain do not share
        // PHP's proleptic year range. Refuse pre-Unix-era instants here so
        // every supported database validates the same signed timestamp.
        return $year >= 1970
            && checkdate((int) $parts['month'], (int) $parts['day'], $year)
            && (int) $parts['hour'] <= 23
            && (int) $parts['minute'] <= 59
            && (int) $parts['second'] <= 59
            && $offsetHour <= 14
            && $offsetMinute <= 59
            && ($offsetHour < 14 || $offsetMinute === 0);
    }
}
