<?php

namespace App\Console\Commands;

use App\Services\Production\RecoveryEvidenceLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Throwable;

final class RecordBackupFailure extends Command
{
    protected $signature = 'monitoring:backup-failed
        {--operation-id= : Stable opaque identifier for the failed backup run}
        {--provider= : Managed database/backup provider identifier}
        {--failure-code= : Bounded non-sensitive failure classification}
        {--checked-at= : Failure observation in ISO-8601; defaults to now}';

    protected $description = 'Record an immediate outage signal for a failed backup verification run';

    public function handle(RecoveryEvidenceLedger $ledger): int
    {
        if (! (bool) config('monitoring.backup.enabled', false)
            || ! (bool) config('disaster_recovery.backup.enabled', false)) {
            $this->components->error('Verified immutable backup monitoring is disabled.');

            return self::INVALID;
        }

        try {
            $evidence = $ledger->recordBackupFailure([
                'operation_id' => $this->option('operation-id'),
                'provider' => $this->option('provider'),
                'failure_code' => $this->option('failure-code'),
                'checked_at' => trim((string) $this->option('checked-at')) === ''
                    ? now('UTC')->setMicrosecond(0)
                    : $this->option('checked-at'),
            ]);
            Log::warning('monitoring.backup_verification_failed', [
                'operation_id' => (string) $evidence->operation_id,
                'provider' => (string) $evidence->provider,
                'evidence_sequence' => (int) $evidence->sequence,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Backup failure recorded; recovery posture is now Outage.');
            }

            return self::FAILURE;
        } catch (InvalidArgumentException $exception) {
            if (! $this->option('quiet')) {
                $this->components->error($exception->getMessage());
            }

            return self::INVALID;
        } catch (Throwable $exception) {
            Log::error('monitoring.backup_failure_signal_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Backup failure signal could not be recorded.');
            }

            return self::FAILURE;
        }
    }
}
