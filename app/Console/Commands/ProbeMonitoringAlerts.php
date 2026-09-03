<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringAlertDelivery;
use App\Services\Monitoring\MonitoringAlertChannelRegistry;
use App\Services\Monitoring\MonitoringAlertDispatcher;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class ProbeMonitoringAlerts extends Command
{
    protected $signature = 'monitoring:alerts:canary
        {--operation-id= : Opaque deployment or scheduled probe identifier}';

    protected $description = 'Prove the signed off-host alert route with an idempotent canary';

    public function handle(
        MonitoringAlertChannelRegistry $channels,
        MonitoringAlertDispatcher $dispatcher,
        MonitoringHeartbeatRecorder $heartbeats,
    ): int {
        if (! $channels->webhookIsValid()) {
            if (! $this->option('quiet')) {
                $this->components->error('The off-host webhook channel is not safely configured.');
            }

            return self::INVALID;
        }

        $operationId = trim((string) $this->option('operation-id'));
        $operationId = $operationId !== '' ? $operationId : (string) Str::uuid();
        if (preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/', $operationId) !== 1) {
            if (! $this->option('quiet')) {
                $this->components->error('A bounded canary operation ID is required.');
            }

            return self::INVALID;
        }

        $startedAt = now('UTC')->toImmutable();

        try {
            $deliveries = collect(['log', 'webhook'])
                ->mapWithKeys(function (string $channel) use ($operationId): array {
                    $deduplicationKey = hash(
                        'sha256',
                        "monitoring-alert-canary\0{$operationId}\0{$channel}",
                    );

                    return [$channel => MonitoringAlertDelivery::query()->firstOrCreate(
                        ['deduplication_key' => $deduplicationKey],
                        [
                            'event' => 'canary',
                            'channel' => $channel,
                            'severity' => 'info',
                            'status' => 'pending',
                            'payload' => [
                                'schema_version' => 1,
                                'event' => 'observability.canary',
                                'source' => 'monitoring-control-plane',
                                'operation_id' => $operationId,
                                'title' => 'UBSC observability delivery verification',
                                'severity' => 'info',
                                'status' => 'operational',
                                'emitted_at' => now()->toIso8601String(),
                            ],
                            'attempts' => 0,
                            'available_at' => now(),
                        ],
                    )];
                });

            if (! $this->operationIsFreshAndConsistent(
                $deliveries,
                $operationId,
                $startedAt,
            )) {
                foreach ([
                    (string) config(
                        'observability.alerting.dispatcher_heartbeat_key',
                        'monitoring-alert-dispatcher',
                    ),
                    (string) config(
                        'observability.alerting.off_host_canary_heartbeat_key',
                        'monitoring-alert-off-host-canary',
                    ),
                ] as $heartbeatKey) {
                    $heartbeats->record(
                        key: $heartbeatKey,
                        category: 'alerting',
                        status: MonitoringStatus::Outage,
                        message: 'A stale or inconsistent observability canary operation was rejected.',
                        context: [
                            'canary_delivered' => false,
                            'operation_id' => $operationId,
                            'reason' => 'stale_or_inconsistent_operation',
                        ],
                    );
                }

                if (! $this->option('quiet')) {
                    $this->components->error(
                        'The canary operation ID is stale or conflicts with persisted evidence.',
                    );
                }

                return self::FAILURE;
            }

            if ($deliveries->contains(
                static fn (MonitoringAlertDelivery $delivery): bool => $delivery->status !== 'delivered',
            )) {
                $dispatcher->dispatch((int) config('monitoring.alerting.batch_size', 50));
                $deliveries->each->refresh();
            }

            $channelStatuses = $deliveries
                ->map(static fn (MonitoringAlertDelivery $delivery): string => (string) $delivery->status)
                ->all();
            $delivered = $deliveries->every(
                static fn (MonitoringAlertDelivery $delivery): bool => $delivery->status === 'delivered'
                    && $delivery->delivered_at !== null,
            );
            $heartbeats->record(
                key: (string) config(
                    'observability.alerting.dispatcher_heartbeat_key',
                    'monitoring-alert-dispatcher',
                ),
                category: 'alerting',
                status: $delivered
                    ? MonitoringStatus::Operational
                    : MonitoringStatus::Outage,
                message: $delivered
                    ? 'Structured log and signed off-host alert canaries were delivered.'
                    : 'The structured log or signed off-host alert canary was not delivered.',
                context: [
                    'canary_delivered' => $delivered,
                    'channel_statuses' => $channelStatuses,
                    'operation_id' => $operationId,
                ],
            );
            $heartbeats->record(
                key: (string) config(
                    'observability.alerting.off_host_canary_heartbeat_key',
                    'monitoring-alert-off-host-canary',
                ),
                category: 'alerting',
                status: $delivered
                    ? MonitoringStatus::Operational
                    : MonitoringStatus::Outage,
                message: $delivered
                    ? 'Structured log and signed off-host alert canaries were delivered.'
                    : 'The structured log or signed off-host alert canary was not delivered.',
                context: [
                    'canary_delivered' => $delivered,
                    'channel_statuses' => $channelStatuses,
                    'operation_id' => $operationId,
                ],
            );

            if (! $this->option('quiet')) {
                $delivered
                    ? $this->components->info('Structured log and off-host alert canaries delivered successfully.')
                    : $this->components->error('Observability delivery canary failed.');
            }

            return $delivered ? self::SUCCESS : self::FAILURE;
        } catch (Throwable $exception) {
            foreach ([
                (string) config(
                    'observability.alerting.dispatcher_heartbeat_key',
                    'monitoring-alert-dispatcher',
                ),
                (string) config(
                    'observability.alerting.off_host_canary_heartbeat_key',
                    'monitoring-alert-off-host-canary',
                ),
            ] as $heartbeatKey) {
                try {
                    $heartbeats->record(
                        key: $heartbeatKey,
                        category: 'alerting',
                        status: MonitoringStatus::Outage,
                        message: 'Off-host alert canary execution failed.',
                    );
                } catch (Throwable) {
                    // The command still exits non-zero if its heartbeat store
                    // is the dependency that failed.
                }
            }
            Log::error('monitoring.alert_canary_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Off-host alert canary could not be completed.');
            }

            return self::FAILURE;
        }
    }

    /**
     * @param  iterable<string, MonitoringAlertDelivery>  $deliveries
     */
    private function operationIsFreshAndConsistent(
        iterable $deliveries,
        string $operationId,
        CarbonImmutable $startedAt,
    ): bool {
        $reuseSeconds = (int) config(
            'observability.alerting.canary_reuse_seconds',
            600,
        );
        $oldestAccepted = $startedAt->subSeconds($reuseSeconds);
        $newestAccepted = $startedAt->addMinutes(5);

        foreach ($deliveries as $channel => $delivery) {
            $payload = is_array($delivery->payload) ? $delivery->payload : [];
            $createdAt = $delivery->created_at;
            if (! is_string($channel)
                || ! in_array($channel, ['log', 'webhook'], true)
                || ! $createdAt instanceof DateTimeInterface
                || CarbonImmutable::instance($createdAt)->lessThan($oldestAccepted)
                || CarbonImmutable::instance($createdAt)->greaterThan($newestAccepted)
                || ! hash_equals('canary', (string) $delivery->event)
                || ! hash_equals($channel, (string) $delivery->channel)
                || ! is_string($payload['operation_id'] ?? null)
                || ! hash_equals($operationId, (string) $payload['operation_id'])) {
                return false;
            }
        }

        return true;
    }
}
