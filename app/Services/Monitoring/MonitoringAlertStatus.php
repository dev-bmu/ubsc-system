<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringAlertDelivery;
use App\Models\MonitoringHeartbeat;
use Carbon\CarbonImmutable;
use Throwable;

final class MonitoringAlertStatus
{
    public function __construct(private readonly MonitoringAlertChannelRegistry $channels) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $descriptors = $this->channels->descriptors();
        $hasOffHost = $this->channels->hasOffHostChannel();
        $hasLocal = collect($descriptors)->contains(
            static fn (array $channel): bool => $channel['configured'] && ! $channel['off_host'],
        );

        try {
            $active = MonitoringAlertDelivery::query()
                ->whereIn('status', ['pending', 'processing']);
            $pending = (clone $active)->count();
            $oldest = (clone $active)->oldest('created_at')->value('created_at');
            $dead = MonitoringAlertDelivery::query()->where('status', 'dead')->count();
            $lastDelivery = MonitoringAlertDelivery::query()
                ->whereNotNull('delivered_at')
                ->latest('delivered_at')
                ->value('delivered_at');
            $lastOffHost = MonitoringAlertDelivery::query()
                ->where('channel', 'webhook')
                ->whereNotNull('delivered_at')
                ->latest('delivered_at')
                ->value('delivered_at');
            $dispatcher = MonitoringHeartbeat::query()->find(
                (string) config(
                    'observability.alerting.dispatcher_heartbeat_key',
                    'monitoring-alert-dispatcher',
                ),
            );
            $canary = MonitoringHeartbeat::query()->find(
                (string) config(
                    'observability.alerting.off_host_canary_heartbeat_key',
                    'monitoring-alert-off-host-canary',
                ),
            );
        } catch (Throwable) {
            return [
                'status' => 'unknown',
                'delivery_configured' => $hasOffHost,
                'channels' => $descriptors,
                'pending_deliveries' => null,
                'dead_deliveries' => null,
                'oldest_pending_age_seconds' => null,
                'dispatcher_status' => MonitoringStatus::Unknown->value,
                'dispatcher_last_seen_at' => null,
                'off_host_canary_status' => MonitoringStatus::Unknown->value,
                'off_host_canary_last_seen_at' => null,
                'last_delivery_at' => null,
                'last_off_host_delivery_at' => null,
                'last_off_host_delivery_age_seconds' => null,
                'off_host_delivery_status' => MonitoringStatus::Unknown->value,
                'message' => 'Alert delivery state could not be read.',
            ];
        }

        $oldestAge = $this->age($oldest);
        $dispatcherAge = $dispatcher?->observed_at === null
            ? null
            : $this->age($dispatcher->observed_at);
        $dispatcherStatus = $this->dispatcherStatus($dispatcher, $dispatcherAge);
        $canaryAge = $canary?->observed_at === null
            ? null
            : $this->age($canary->observed_at);
        $canaryStatus = $this->canaryStatus($canary, $canaryAge);
        $backlogStatus = $this->backlogStatus($pending, $oldestAge);
        $lastOffHostAge = $this->age($lastOffHost);
        $offHostStatus = MonitoringStatus::worst([
            $this->offHostStatus($lastOffHostAge),
            $canaryStatus,
        ]);
        $runtimeStatus = MonitoringStatus::worst([
            $dispatcherStatus,
            $backlogStatus,
            $offHostStatus,
            $dead > 0 ? MonitoringStatus::Degraded : MonitoringStatus::Operational,
        ]);
        $configurationStatus = match (true) {
            $hasOffHost => 'operational',
            $hasLocal => 'local_only',
            count($descriptors) > 0 => 'misconfigured',
            default => 'unconfigured',
        };
        $status = match (true) {
            $configurationStatus !== 'operational' => $configurationStatus,
            $runtimeStatus === MonitoringStatus::Outage => 'outage',
            $runtimeStatus === MonitoringStatus::Degraded => 'degraded',
            $runtimeStatus === MonitoringStatus::Unknown => 'unknown',
            default => 'operational',
        };

        return [
            'status' => $status,
            'delivery_configured' => $hasOffHost,
            'channels' => $descriptors,
            'pending_deliveries' => $pending,
            'dead_deliveries' => $dead,
            'oldest_pending_age_seconds' => $oldestAge,
            'dispatcher_status' => $dispatcherStatus->value,
            'dispatcher_last_seen_at' => $dispatcher?->observed_at?->toIso8601String(),
            'off_host_canary_status' => $canaryStatus->value,
            'off_host_canary_last_seen_at' => $canary?->observed_at?->toIso8601String(),
            'last_delivery_at' => $this->iso($lastDelivery),
            'last_off_host_delivery_at' => $this->iso($lastOffHost),
            'last_off_host_delivery_age_seconds' => $lastOffHostAge,
            'off_host_delivery_status' => $offHostStatus->value,
            'message' => match ($status) {
                'operational' => 'Signed off-host delivery was recently proven; dispatcher liveness and backlog are healthy.',
                'outage' => 'Alert dispatch is stale or its durable outbox exceeded an outage boundary.',
                'degraded' => 'Alert delivery has dead letters or an outbox/dispatcher warning.',
                'local_only' => 'Alerts are durable but currently delivered only to application logs.',
                'misconfigured' => 'A requested alert channel is not configured correctly.',
                'unknown' => 'Alert delivery is configured but its dispatcher state is unknown.',
                default => 'No alert delivery channel is configured.',
            },
        ];
    }

    private function dispatcherStatus(
        ?MonitoringHeartbeat $heartbeat,
        ?int $age,
    ): MonitoringStatus {
        if ($heartbeat === null || $age === null) {
            return MonitoringStatus::Unknown;
        }

        $freshness = match (true) {
            $age >= (int) config(
                'observability.alerting.dispatcher_outage_after_seconds',
                600,
            ) => MonitoringStatus::Outage,
            $age >= (int) config(
                'observability.alerting.dispatcher_warning_after_seconds',
                180,
            ) => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return MonitoringStatus::worst([
            MonitoringStatus::tryFrom((string) $heartbeat->status)
                ?? MonitoringStatus::Unknown,
            $freshness,
        ]);
    }

    private function backlogStatus(int $pending, ?int $oldestAge): MonitoringStatus
    {
        return match (true) {
            $pending >= (int) config('observability.alerting.pending_outage', 100),
            $oldestAge !== null && $oldestAge >= (int) config(
                'observability.alerting.oldest_outage_seconds',
                900,
            ) => MonitoringStatus::Outage,
            $pending >= (int) config('observability.alerting.pending_warning', 25),
            $oldestAge !== null && $oldestAge >= (int) config(
                'observability.alerting.oldest_warning_seconds',
                300,
            ) => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
    }

    private function offHostStatus(?int $age): MonitoringStatus
    {
        if ($age === null) {
            return MonitoringStatus::Unknown;
        }

        return match (true) {
            $age >= (int) config(
                'observability.alerting.off_host_outage_after_seconds',
                172_800,
            ) => MonitoringStatus::Outage,
            $age >= (int) config(
                'observability.alerting.off_host_warning_after_seconds',
                90_000,
            ) => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
    }

    private function canaryStatus(
        ?MonitoringHeartbeat $heartbeat,
        ?int $age,
    ): MonitoringStatus {
        if ($heartbeat === null || $age === null) {
            return MonitoringStatus::Unknown;
        }

        return MonitoringStatus::worst([
            MonitoringStatus::tryFrom((string) $heartbeat->status)
                ?? MonitoringStatus::Unknown,
            $this->offHostStatus($age),
        ]);
    }

    private function age(mixed $value): ?int
    {
        if ($value === null) {
            return null;
        }

        try {
            $timestamp = $value instanceof \DateTimeInterface
                ? CarbonImmutable::instance($value)
                : CarbonImmutable::parse((string) $value);
        } catch (Throwable) {
            return null;
        }

        if ($timestamp->greaterThan(now()->addMinutes(5))) {
            return null;
        }

        return max(0, (int) $timestamp->diffInSeconds(now()));
    }

    private function iso(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        try {
            return CarbonImmutable::parse((string) $value)->toIso8601String();
        } catch (Throwable) {
            return null;
        }
    }
}
