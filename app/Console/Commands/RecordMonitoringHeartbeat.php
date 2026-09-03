<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class RecordMonitoringHeartbeat extends Command
{
    protected $signature = 'monitoring:heartbeat';

    protected $description = 'Record the scheduler dead-man heartbeat';

    public function handle(MonitoringHeartbeatRecorder $heartbeats): int
    {
        if (! (bool) config('monitoring.enabled', true)) {
            return self::SUCCESS;
        }

        $startedAt = hrtime(true);

        try {
            $heartbeats->record(
                key: (string) config('monitoring.scheduler.heartbeat_key', 'scheduler'),
                category: 'scheduler',
                status: MonitoringStatus::Operational,
                latencyMs: max(0, (int) round((hrtime(true) - $startedAt) / 1_000_000)),
            );

            if (! $this->option('quiet')) {
                $this->components->info('Scheduler heartbeat recorded.');
            }

            return self::SUCCESS;
        } catch (Throwable $exception) {
            Log::error('monitoring.scheduler_heartbeat_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Scheduler heartbeat could not be recorded.');
            }

            return self::FAILURE;
        }
    }
}
