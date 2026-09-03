<?php

namespace App\Services\Production;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Services\Monitoring\BackgroundQueueRegistry;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class ProcessRuntimeProbe
{
    public function __construct(
        private readonly BackgroundQueueRegistry $queues,
    ) {}

    /**
     * @return array{valid:bool,strict_valid:bool,failures:int,warnings:int,checks:list<array{code:string,status:string,message:string>>}
     */
    public function report(): array
    {
        $checks = [];

        if (! (bool) config('monitoring.enabled', true)) {
            $this->add(
                $checks,
                'runtime.monitoring',
                'fail',
                'Runtime dead-man monitoring must remain enabled in production.',
            );

            return $this->summarize($checks);
        }

        try {
            if (! Schema::hasTable('monitoring_heartbeats')) {
                throw new \RuntimeException('heartbeat storage unavailable');
            }

            $queueDefinitions = $this->queues->all();
            $expectedQueueKeys = array_keys((array) config('process_supervision.workers', []));
            $registeredQueueKeys = array_column($queueDefinitions, 'key');
            $missingQueueKeys = array_diff($expectedQueueKeys, $registeredQueueKeys);
            $this->add(
                $checks,
                'runtime.queue_coverage',
                $missingQueueKeys === [] ? 'pass' : 'fail',
                $missingQueueKeys === []
                    ? 'Dead-man probes cover every supervised queue lane.'
                    : 'One or more supervised queue lanes are missing from dead-man monitoring.',
            );

            $definitions = $this->definitions($queueDefinitions);
            $keys = array_column($definitions, 'heartbeat_key');
            $heartbeats = MonitoringHeartbeat::query()
                ->whereIn('key', $keys)
                ->get(['key', 'status', 'observed_at', 'latency_ms'])
                ->keyBy('key');
            $nowTimestamp = now()->getTimestamp();
            $maximumClockSkew = max(1, (int) config(
                'process_supervision.safety.maximum_heartbeat_clock_skew_seconds',
                30,
            ));

            foreach ($definitions as $definition) {
                /** @var MonitoringHeartbeat|null $heartbeat */
                $heartbeat = $heartbeats->get($definition['heartbeat_key']);
                $observedTimestamp = $heartbeat?->observed_at?->getTimestamp();
                $isFutureDated = $observedTimestamp !== null
                    && $observedTimestamp > ($nowTimestamp + $maximumClockSkew);
                $lag = $observedTimestamp === null || $isFutureDated
                    ? null
                    : max(0, $nowTimestamp - $observedTimestamp);
                $latencyMs = is_numeric($heartbeat?->latency_ms)
                    ? max(0, (int) $heartbeat->latency_ms)
                    : null;
                $latencyIsMissing = $definition['requires_latency']
                    && $latencyMs === null;
                $recordedStatus = MonitoringStatus::tryFrom((string) ($heartbeat?->status ?? ''));
                $status = match (true) {
                    $heartbeat === null || $lag === null => 'fail',
                    $latencyIsMissing => 'fail',
                    $recordedStatus !== MonitoringStatus::Operational => 'fail',
                    $lag >= $definition['outage_after_seconds'] => 'fail',
                    $latencyMs !== null
                        && $latencyMs >= $definition['outage_latency_ms'] => 'fail',
                    $lag >= $definition['warning_after_seconds'] => 'warning',
                    $latencyMs !== null
                        && $latencyMs >= $definition['warning_latency_ms'] => 'warning',
                    default => 'pass',
                };

                $this->add(
                    $checks,
                    $definition['code'],
                    $status,
                    match ($status) {
                        'pass' => $definition['label'].' heartbeat is fresh, timely, and operational.',
                        'warning' => $definition['label'].' heartbeat age or queue latency exceeded its warning threshold.',
                        default => $isFutureDated
                            ? $definition['label'].' heartbeat is future-dated beyond the allowed clock skew.'
                            : $definition['label'].' heartbeat is missing, stale, delayed, or unhealthy.',
                    },
                );
            }
        } catch (Throwable) {
            $this->add(
                $checks,
                'runtime.heartbeat_storage',
                'fail',
                'Runtime heartbeat storage could not be read.',
            );
        }

        return $this->summarize($checks);
    }

    /**
     * @param  list<array{key:string,label:string,connection:string,queue:string}>  $queueDefinitions
     * @return list<array{code:string,label:string,heartbeat_key:string,warning_after_seconds:int,outage_after_seconds:int,warning_latency_ms:int,outage_latency_ms:int,requires_latency:bool}>
     */
    private function definitions(array $queueDefinitions): array
    {
        $definitions = [[
            'code' => 'runtime.scheduler',
            'label' => 'Scheduler',
            'heartbeat_key' => (string) config(
                'monitoring.scheduler.heartbeat_key',
                'scheduler',
            ),
            'warning_after_seconds' => (int) config(
                'monitoring.scheduler.warning_after_seconds',
                150,
            ),
            'outage_after_seconds' => (int) config(
                'monitoring.scheduler.outage_after_seconds',
                300,
            ),
            'warning_latency_ms' => PHP_INT_MAX,
            'outage_latency_ms' => PHP_INT_MAX,
            'requires_latency' => false,
        ]];
        $warning = (int) config('background_jobs.monitoring.warning_age_seconds', 120);
        $outage = (int) config('background_jobs.monitoring.outage_age_seconds', 600);

        foreach ($queueDefinitions as $queue) {
            $definitions[] = [
                'code' => 'runtime.queue.'.str_replace('_', '-', $queue['key']),
                'label' => 'Queue '.$queue['label'],
                'heartbeat_key' => MonitoringHeartbeatRecorder::queueKey(
                    $queue['connection'],
                    $queue['queue'],
                ),
                'warning_after_seconds' => max(30, $warning),
                'outage_after_seconds' => max($warning + 30, $outage),
                'warning_latency_ms' => max(30, $warning) * 1_000,
                'outage_latency_ms' => max($warning + 30, $outage) * 1_000,
                'requires_latency' => true,
            ];
        }

        return $definitions;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function summarize(array $checks): array
    {
        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $warnings = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'warning',
        ));

        return [
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => $checks,
        ];
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }
}
