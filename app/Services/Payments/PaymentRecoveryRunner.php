<?php

namespace App\Services\Payments;

final class PaymentRecoveryRunner
{
    public function __construct(
        private readonly PaymentRecoveryService $recovery,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function run(int $batchSize = 100, ?int $staleAfterSeconds = null): array
    {
        $report = $this->recovery->recoverAll(
            limit: max(1, min(1_000, $batchSize)),
            staleAfterSeconds: $staleAfterSeconds === null
                ? null
                : max(30, min(86_400, $staleAfterSeconds)),
        );

        $this->operationalLog->record('payment_recovery_run_completed', [
            'booking_orders_recovered' => (int) $report['booking_orders_recovered'],
            'direct_bookings_recovered' => (int) $report['direct_bookings_recovered'],
            'memberships_recovered' => (int) $report['memberships_recovered'],
            'stale_attempts_reconciling' => (int) $report['stale_attempts_reconciling'],
            'booking_orders_expired' => (int) $report['booking_orders_expired'],
            'errors' => (int) $report['errors'],
        ]);

        return $report;
    }
}
