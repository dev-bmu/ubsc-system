<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Production\RecoveryEvidenceLedger;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Throwable;

final class RecordPitrObservation extends Command
{
    protected $signature = 'monitoring:pitr-observed
        {--operation-id= : Stable opaque ID; retries with the same observation must reuse it}
        {--provider= : Managed database provider identifier}
        {--dataset-id= : Opaque relational dataset identifier}
        {--region= : Primary provider region identifier}
        {--latest-recovery-point-at= : Latest restorable provider timestamp in RFC3339}
        {--checked-at= : Provider observation timestamp in RFC3339; defaults to now}
        {--continuous : Provider confirms continuous recovery logging}
        {--restorable : Provider confirms the recovery point is restorable}';

    protected $description = 'Append provider latest-restorable-time evidence for PITR monitoring';

    public function handle(RecoveryEvidenceLedger $ledger): int
    {
        if (! (bool) config('disaster_recovery.pitr.observation_enabled', false)) {
            if (! $this->option('quiet')) {
                $this->components->error('PITR provider observation is disabled.');
            }

            return self::INVALID;
        }

        try {
            $checkedAt = trim((string) $this->option('checked-at'));
            if ($checkedAt === '') {
                $checkedAt = CarbonImmutable::now('UTC')
                    ->setMicrosecond(0)
                    ->toIso8601String();
            }
            $operationId = trim((string) $this->option('operation-id'));
            if ($operationId === '') {
                $operationId = 'pitr-'.substr(hash('sha256', implode('|', [
                    (string) $this->option('provider'),
                    (string) $this->option('dataset-id'),
                    (string) $this->option('region'),
                    (string) $this->option('latest-recovery-point-at'),
                    $checkedAt,
                ])), 0, 40);
            }

            $evidence = $ledger->recordPitrObservation([
                'operation_id' => $operationId,
                'provider' => $this->option('provider'),
                'dataset_id' => $this->option('dataset-id'),
                'primary_region' => $this->option('region'),
                'latest_recovery_point_at' => $this->option('latest-recovery-point-at'),
                'checked_at' => $checkedAt,
                'continuous' => (bool) $this->option('continuous'),
                'restorable' => (bool) $this->option('restorable'),
            ]);

            if (! $this->option('quiet')) {
                $this->components->info(sprintf(
                    'PITR evidence #%d recorded with %ds recovery-point lag.',
                    (int) $evidence->sequence,
                    (int) $evidence->observed_rpo_seconds,
                ));
            }

            return $evidence->status === MonitoringStatus::Outage->value
                ? self::FAILURE
                : self::SUCCESS;
        } catch (InvalidArgumentException $exception) {
            if (! $this->option('quiet')) {
                $this->components->error($exception->getMessage());
            }

            return self::INVALID;
        } catch (Throwable $exception) {
            Log::error('monitoring.pitr_observation_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('PITR observation could not be recorded.');
            }

            return self::FAILURE;
        }
    }
}
