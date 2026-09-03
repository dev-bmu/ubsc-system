<?php

namespace App\Services\DataGovernance;

use Illuminate\Validation\ValidationException;

final class BookingOrderStatusTransitionPolicy
{
    /** @var array<string, list<string>> */
    private const TRANSITIONS = [
        'draft' => ['pending_payment', 'paid', 'cancelled', 'expired'],
        'pending_payment' => ['paid', 'cancelled', 'expired'],
        'paid' => [],
        'cancelled' => [],
        'expired' => [],
    ];

    public function assertAllowed(string $from, string $to): void
    {
        if ($from === $to) {
            return;
        }

        if (! in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => 'Perubahan status order reservasi tidak valid.',
            ]);
        }
    }
}
