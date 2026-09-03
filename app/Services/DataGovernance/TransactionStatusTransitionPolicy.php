<?php

namespace App\Services\DataGovernance;

use Illuminate\Validation\ValidationException;

final class TransactionStatusTransitionPolicy
{
    /** @var array<string, list<string>> */
    private const TRANSITIONS = [
        'UNPAID' => ['PAID', 'EXPIRED', 'FAILED'],
        // A durable paid provider attempt may arrive after a local timeout or
        // interruption. Recovery is allowed to restore settlement but no
        // terminal state may otherwise be reopened.
        'EXPIRED' => ['PAID'],
        'FAILED' => ['PAID'],
        'PAID' => [],
    ];

    public function assertAllowed(string $from, string $to): void
    {
        if ($from === $to) {
            return;
        }

        if (! in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
            throw ValidationException::withMessages([
                'payment_status' => 'Perubahan status pembayaran tidak valid.',
            ]);
        }
    }
}
