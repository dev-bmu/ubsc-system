<?php

namespace App\Console\Commands;

use App\Services\DataGovernance\ServiceAuditVerifier;
use Illuminate\Console\Command;
use Throwable;

final class VerifyServiceAuditLedger extends Command
{
    protected $signature = 'services:audit-verify {--batch= : Maximum events verified in this rolling pass}';

    protected $description = 'Verify a bounded rolling segment of the append-only service audit ledger';

    public function handle(ServiceAuditVerifier $verifier): int
    {
        try {
            $batch = $this->option('batch');
            $result = $verifier->verify(
                is_numeric($batch) ? (int) $batch : null,
            );
            $context = $result['context'];
            $this->line(sprintf(
                'Service audit: %s (%d checked, %d total, full cycle: %s)',
                strtoupper((string) $result['status']),
                (int) ($context['batch_checked'] ?? 0),
                (int) ($context['total_events'] ?? 0),
                ($context['full_cycle_completed'] ?? false) ? 'yes' : 'no',
            ));

            return $result['status'] === 'outage'
                ? self::FAILURE
                : self::SUCCESS;
        } catch (Throwable $exception) {
            report($exception);
            $this->error('Service audit verification could not complete.');

            return self::FAILURE;
        }
    }
}
