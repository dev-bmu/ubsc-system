<?php

namespace App\Console\Commands;

use App\Models\MonitoringAlertDelivery;
use App\Services\Monitoring\MonitoringAlertChannelRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

final class RetryDeadMonitoringAlerts extends Command
{
    protected $signature = 'monitoring:alerts:retry-dead
        {--delivery-id= : Public UUID of one dead delivery}
        {--all : Requeue a bounded batch of all safely configured channels}
        {--limit=100 : Maximum records when --all is used}';

    protected $description = 'Safely requeue terminal monitoring alerts after their delivery path is repaired';

    public function handle(MonitoringAlertChannelRegistry $channels): int
    {
        $deliveryId = trim((string) $this->option('delivery-id'));
        $all = (bool) $this->option('all');
        if (($deliveryId === '') === ! $all) {
            $this->components->error('Choose exactly one of --delivery-id or --all.');

            return self::INVALID;
        }
        if ($deliveryId !== ''
            && preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $deliveryId) !== 1) {
            $this->components->error('The delivery ID is invalid.');

            return self::INVALID;
        }

        $activeChannels = $channels->activeChannels();
        if ($activeChannels === []) {
            $this->components->error('No safe alert delivery channel is configured.');

            return self::INVALID;
        }

        try {
            $limit = min(500, max(1, (int) $this->option('limit')));
            $requeued = DB::transaction(function () use (
                $deliveryId,
                $activeChannels,
                $limit,
            ): int {
                $query = MonitoringAlertDelivery::query()
                    ->where('status', 'dead')
                    ->whereIn('channel', $activeChannels)
                    ->when(
                        $deliveryId !== '',
                        static fn ($query) => $query->where('public_id', $deliveryId),
                    )
                    ->orderBy('id')
                    ->limit($deliveryId !== '' ? 1 : $limit)
                    ->lockForUpdate();
                $ids = $query->pluck('id');

                if ($ids->isEmpty()) {
                    return 0;
                }

                return MonitoringAlertDelivery::query()
                    ->whereIn('id', $ids)
                    ->where('status', 'dead')
                    ->update([
                        'status' => 'pending',
                        'attempts' => 0,
                        'available_at' => now(),
                        'claimed_at' => null,
                        'claim_token' => null,
                        'last_attempt_at' => null,
                        'last_error_code' => null,
                        'updated_at' => now(),
                    ]);
            }, 3);

            Log::notice('monitoring.dead_alerts_requeued', [
                'count' => $requeued,
                'mode' => $deliveryId === '' ? 'bounded_batch' : 'single',
            ]);
            $this->components->info("Requeued {$requeued} dead monitoring alert delivery record(s).");

            return $deliveryId !== '' && $requeued !== 1
                ? self::FAILURE
                : self::SUCCESS;
        } catch (Throwable $exception) {
            Log::error('monitoring.dead_alert_requeue_failed', [
                'failure_class' => $exception::class,
            ]);
            $this->components->error('Dead monitoring alerts could not be requeued safely.');

            return self::FAILURE;
        }
    }
}
