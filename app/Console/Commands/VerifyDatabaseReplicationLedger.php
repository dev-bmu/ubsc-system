<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Production\DatabaseReplicationControlPlane;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

final class VerifyDatabaseReplicationLedger extends Command
{
    protected $signature = 'replication:ledger-verify
        {--record-heartbeat : Persist the bounded verification result}';

    protected $description = 'Verify the complete database-replication event hash chain';

    public function handle(
        DatabaseReplicationControlPlane $controlPlane,
        MonitoringHeartbeatRecorder $heartbeats,
    ): int {
        if (! (bool) config('database_replication.enabled', false)
            && ! (bool) config('database_replication.enforce', false)) {
            if (! $this->option('quiet')) {
                $this->components->info(
                    'Database replication is disabled; ledger verification skipped.',
                );
            }

            return self::SUCCESS;
        }

        try {
            $report = (bool) $this->option('record-heartbeat')
                ? $controlPlane->verifyAndRecordHeartbeat()
                : $controlPlane->verifyLedger();
            if (! $this->option('quiet')) {
                $this->line(json_encode(
                    $report,
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
                ));
            }

            return $report['valid'] ? self::SUCCESS : self::FAILURE;
        } catch (Throwable $exception) {
            if ((bool) $this->option('record-heartbeat')) {
                try {
                    $heartbeats->record(
                        key: (string) config(
                            'database_replication.ledger.verification_heartbeat_key',
                            'database-replication-ledger',
                        ),
                        category: 'replication',
                        status: MonitoringStatus::Outage,
                        message: 'Database replication ledger verification could not complete.',
                    );
                } catch (Throwable) {
                    // Off-host structured logging remains the last signal if
                    // the database itself prevents heartbeat persistence.
                }
            }
            Log::error('database_replication.ledger_verification_failed', [
                'failure_class' => $exception::class,
            ]);
            if (! $this->option('quiet')) {
                $this->components->error('Database replication ledger could not be verified.');
            }

            return self::FAILURE;
        }
    }
}
