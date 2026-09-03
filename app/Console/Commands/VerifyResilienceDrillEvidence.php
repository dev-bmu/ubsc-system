<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Production\ResilienceDrillLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

final class VerifyResilienceDrillEvidence extends Command
{
    protected $signature = 'resilience:evidence:verify
        {--record-heartbeat : Persist the bounded verification result}';

    protected $description = 'Verify the complete signed resilience drill evidence chain';

    public function handle(
        ResilienceDrillLedger $ledger,
        MonitoringHeartbeatRecorder $heartbeats,
    ): int {
        try {
            $report = (bool) $this->option('record-heartbeat')
                ? $ledger->verifyAndRecordHeartbeat()
                : $ledger->verify();

            if (! $this->option('quiet')) {
                $this->line((string) json_encode(
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
                            'resilience_drills.evidence.verification_heartbeat_key',
                            'resilience-drill-ledger',
                        ),
                        category: 'resilience',
                        status: MonitoringStatus::Outage,
                        message: 'Resilience evidence ledger verification could not complete.',
                    );
                } catch (Throwable) {
                    // The sanitized off-host log is the last signal if the
                    // evidence database and heartbeat path fail together.
                }
            }
            Log::error('resilience.evidence_verification_failed', [
                'failure_class' => $exception::class,
            ]);
            if (! $this->option('quiet')) {
                $this->components->error('Resilience evidence could not be verified.');
            }

            return self::FAILURE;
        }
    }
}
