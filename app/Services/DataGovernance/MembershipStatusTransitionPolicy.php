<?php

namespace App\Services\DataGovernance;

use Illuminate\Validation\ValidationException;

final class MembershipStatusTransitionPolicy
{
    /** @var array<string, list<string>> */
    private const TRANSITIONS = [
        'pending_payment' => ['active', 'expired', 'cancelled'],
        'active' => ['expired', 'cancelled'],
        'expired' => [],
        'cancelled' => [],
    ];

    public function assertAllowed(
        string $from,
        string $to,
        bool $allowPaymentActivation = false,
    ): void {
        if ($from === $to) {
            return;
        }

        $allowed = self::TRANSITIONS[$from] ?? [];

        if (! $allowPaymentActivation && $to === 'active') {
            $allowed = array_values(array_diff($allowed, ['active']));
        }

        if (! in_array($to, $allowed, true)) {
            throw ValidationException::withMessages([
                'status' => $to === 'active'
                    ? 'Membership hanya dapat diaktifkan melalui konfirmasi pembayaran terverifikasi.'
                    : 'Perubahan status membership tidak valid.',
            ]);
        }
    }

    /** @return list<string> */
    public function allowedTargets(string $from, bool $allowPaymentActivation = false): array
    {
        $allowed = self::TRANSITIONS[$from] ?? [];

        return $allowPaymentActivation
            ? $allowed
            : array_values(array_diff($allowed, ['active']));
    }
}
