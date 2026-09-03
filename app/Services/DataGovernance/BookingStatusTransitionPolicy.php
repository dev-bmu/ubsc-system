<?php

namespace App\Services\DataGovernance;

use Illuminate\Validation\ValidationException;

final class BookingStatusTransitionPolicy
{
    /** @var array<string, list<string>> */
    private const TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['completed', 'cancelled'],
        'cancelled' => [],
        'completed' => [],
    ];

    public function assertAllowed(string $from, string $to): void
    {
        if ($from === $to) {
            return;
        }

        if (! array_key_exists($from, self::TRANSITIONS)
            || ! in_array($to, self::TRANSITIONS[$from], true)) {
            throw ValidationException::withMessages([
                'status' => 'Perubahan status booking tidak valid.',
            ]);
        }
    }

    /** @return list<string> */
    public function allowedTargets(string $from): array
    {
        return self::TRANSITIONS[$from] ?? [];
    }
}
