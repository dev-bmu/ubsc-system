<?php

namespace App\Console\Commands;

use App\Models\MonitoringAlertDelivery;
use App\Models\MonitoringExternalSliReceipt;
use App\Models\MonitoringRollup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class PruneMonitoringHistory extends Command
{
    protected $signature = 'monitoring:prune';

    protected $description = 'Prune bounded monitoring rollups and terminal alert deliveries';

    public function handle(): int
    {
        try {
            $rollups = MonitoringRollup::query()
                ->where('bucket_started_at', '<', now()->subDays(
                    max(7, (int) config('monitoring.history.retention_days', 90)),
                )->startOfDay())
                ->delete();
            $delivered = MonitoringAlertDelivery::query()
                ->where('status', 'delivered')
                ->where('delivered_at', '<', now()->subDays(
                    max(7, (int) config('monitoring.alerting.delivered_retention_days', 90)),
                ))
                ->delete();
            $dead = MonitoringAlertDelivery::query()
                ->where('status', 'dead')
                ->where('updated_at', '<', now()->subDays(
                    max(30, (int) config('monitoring.alerting.dead_retention_days', 365)),
                ))
                ->delete();
            $externalSliReceipts = MonitoringExternalSliReceipt::query()
                ->where('completed_at', '<', now()->subDays(
                    max(7, (int) config('monitoring.history.retention_days', 90)),
                )->startOfDay())
                ->delete();

            if (! $this->option('quiet')) {
                $this->line(json_encode(compact(
                    'rollups',
                    'delivered',
                    'dead',
                    'externalSliReceipts',
                ), JSON_THROW_ON_ERROR));
            }

            return self::SUCCESS;
        } catch (Throwable $exception) {
            Log::error('monitoring.retention_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Monitoring retention failed without deleting active records.');
            }

            return self::FAILURE;
        }
    }
}
