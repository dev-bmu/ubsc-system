<?php

namespace App\Console\Commands;

use App\Services\Payments\PaymentOperationalLogger;
use App\Services\Payments\PaymentRecoveryService;
use Illuminate\Console\Command;

class RecoverPayments extends Command
{
    protected $signature = 'payments:recover
        {--limit=100 : Database chunk size per recovery category}
        {--stale-seconds= : Override the stale creating threshold for this run}';

    protected $description = 'Recover interrupted payment projections without creating a new charge';

    public function handle(
        PaymentRecoveryService $recovery,
        PaymentOperationalLogger $operationalLog,
    ): int {
        $limit = max(1, min(1000, (int) $this->option('limit')));
        $staleOption = $this->option('stale-seconds');
        $staleSeconds = $staleOption === null || $staleOption === ''
            ? null
            : max(30, min(86400, (int) $staleOption));
        $report = $recovery->recoverAll(
            limit: $limit,
            staleAfterSeconds: $staleSeconds,
        );

        $operationalLog->record('payment_recovery_run_completed', [
            'booking_orders_recovered' => (int) $report['booking_orders_recovered'],
            'direct_bookings_recovered' => (int) $report['direct_bookings_recovered'],
            'memberships_recovered' => (int) $report['memberships_recovered'],
            'stale_attempts_reconciling' => (int) $report['stale_attempts_reconciling'],
            'booking_orders_expired' => (int) $report['booking_orders_expired'],
            'errors' => (int) $report['errors'],
        ]);

        if (! $this->option('quiet')) {
            $this->line(json_encode(
                $report,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
            ));
        }

        return ((int) $report['errors']) === 0
            ? self::SUCCESS
            : self::FAILURE;
    }
}
