<?php

namespace App\Casts;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use DateTimeInterface;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use UnexpectedValueException;

/** @implements CastsAttributes<CarbonImmutable|null, CarbonInterface|DateTimeInterface|string|null> */
final class UtcImmutableDateTime implements CastsAttributes
{
    public function get(
        Model $model,
        string $key,
        mixed $value,
        array $attributes,
    ): ?CarbonImmutable {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof CarbonInterface || $value instanceof DateTimeInterface) {
            return CarbonImmutable::instance($value)->utc()->setMicrosecond(0);
        }
        if (! is_string($value)) {
            throw new UnexpectedValueException("{$key} is not a UTC database timestamp.");
        }

        $parsed = CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $value, 'UTC');
        if ($parsed === false || $parsed->format('Y-m-d H:i:s') !== $value) {
            throw new UnexpectedValueException("{$key} is not a canonical UTC database timestamp.");
        }

        return $parsed->utc()->setMicrosecond(0);
    }

    public function set(
        Model $model,
        string $key,
        mixed $value,
        array $attributes,
    ): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        if (! $value instanceof CarbonInterface && ! $value instanceof DateTimeInterface) {
            throw new UnexpectedValueException("{$key} must be an explicit date-time object.");
        }

        return CarbonImmutable::instance($value)->utc()->format('Y-m-d H:i:s');
    }
}
