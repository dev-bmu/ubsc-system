<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringAlertDispatcher;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class DeliverMonitoringAlerts extends Command
{
    protected $signature = 'monitoring:alerts:deliver {--limit= : Maximum outbox records to claim}';

    protected $description = 'Deliver durable monitoring incident alerts';

    public function handle(
        MonitoringAlertDispatcher $dispatcher,
        MonitoringHeartbeatRecorder $heartbeats,
    ): int {
        if (! (bool) config('monitoring.enabled', true)) {
            return self::SUCCESS;
        }

        $limit = $this->option('limit');
        $limit = is_numeric($limit)
            ? (int) $limit
            : (int) config('monitoring.alerting.batch_size', 50);

        try {
            $result = $dispatcher->dispatch($limit);
            $status = $result['dead'] > 0 || $result['lease_lost'] > 0
                ? MonitoringStatus::Degraded
                : MonitoringStatus::Operational;
            $heartbeats->record(
                key: (string) config(
                    'observability.alerting.dispatcher_heartbeat_key',
                    'monitoring-alert-dispatcher',
                ),
                category: 'alerting',
                status: $status,
                message: $status === MonitoringStatus::Operational
                    ? 'Monitoring alert outbox dispatch cycle completed.'
                    : 'Monitoring alert dispatch produced a dead letter or lease-fencing anomaly.',
                context: $result,
            );

            if (! $this->option('quiet')) {
                $this->line(json_encode($result, JSON_THROW_ON_ERROR));
            }

            return $result['dead'] > 0 || $result['lease_lost'] > 0
                ? self::FAILURE
                : self::SUCCESS;
        } catch (Throwable $exception) {
            try {
                $heartbeats->record(
                    key: (string) config(
                        'observability.alerting.dispatcher_heartbeat_key',
                        'monitoring-alert-dispatcher',
                    ),
                    category: 'alerting',
                    status: MonitoringStatus::Outage,
                    message: 'Monitoring alert dispatch cycle failed.',
                    context: ['failure_class' => class_basename($exception)],
                );
            } catch (Throwable) {
                // The durable log entry below remains the final fallback when
                // the heartbeat database is the failed dependency.
            }
            Log::error('monitoring.alert_dispatch_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Monitoring alert delivery failed safely; pending records remain durable.');
            }

            return self::FAILURE;
        }
    }
}
