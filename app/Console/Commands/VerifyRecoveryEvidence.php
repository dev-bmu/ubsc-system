<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Production\RecoveryEvidenceLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

final class VerifyRecoveryEvidence extends Command
{
    protected $signature = 'recovery:evidence-verify {--record-heartbeat : Persist the bounded verification result}';

    protected $description = 'Verify the complete signed recovery evidence hash chain';

    public function handle(
        RecoveryEvidenceLedger $ledger,
        MonitoringHeartbeatRecorder $heartbeats,
    ): int {
        try {
            $report = (bool) $this->option('record-heartbeat')
                ? $ledger->verifyAndRecordHeartbeat()
                : $ledger->verify();

            if (! $this->option('quiet')) {
                $this->line(json_encode($report, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            }

            return $report['valid'] ? self::SUCCESS : self::FAILURE;
        } catch (Throwable $exception) {
            if ((bool) $this->option('record-heartbeat')) {
                try {
                    $heartbeats->record(
                        key: (string) config(
                            'disaster_recovery.evidence.verification_heartbeat_key',
                            'recovery-evidence-chain',
                        ),
                        category: 'recovery',
                        status: MonitoringStatus::Outage,
                        message: 'Recovery evidence chain verification could not complete.',
                    );
                } catch (Throwable) {
                    // A database outage can prevent both verification and its
                    // heartbeat. The sanitized off-host log remains the final
                    // signal in that failure mode.
                }
            }
            Log::error('recovery.evidence_verification_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Recovery evidence could not be verified.');
            }

            return self::FAILURE;
        }
    }
}
