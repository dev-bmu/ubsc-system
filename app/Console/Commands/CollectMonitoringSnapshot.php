<?php

namespace App\Console\Commands;

use App\Services\Monitoring\MonitoringSnapshotCollector;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class CollectMonitoringSnapshot extends Command
{
    protected $signature = 'monitoring:collect';

    protected $description = 'Collect the bounded internal monitoring read model';

    public function handle(MonitoringSnapshotCollector $collector): int
    {
        if (! (bool) config('monitoring.enabled', true)) {
            return self::SUCCESS;
        }

        try {
            $snapshot = $collector->collect();

            if (! $this->option('quiet')) {
                $this->line(json_encode([
                    'status' => $snapshot['overall']['status'],
                    'generated_at' => $snapshot['generated_at'],
                    'collection_duration_ms' => $snapshot['collection_duration_ms'],
                ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            }

            return self::SUCCESS;
        } catch (Throwable $exception) {
            Log::error('monitoring.snapshot_collection_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Monitoring snapshot collection failed.');
            }

            return self::FAILURE;
        }
    }
}
