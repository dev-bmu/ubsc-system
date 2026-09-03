<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Models\MonitoringRollup;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class MonitoringRollupRecorder
{
    public const BASELINE_HEARTBEAT_KEY = 'monitoring-rollup-baseline';

    public function recordExternalAvailability(
        MonitoringStatus $status,
        CarbonInterface $sampledAt,
        ?int $latencyMs = null,
    ): void {
        // The signed receipt is inserted in the caller's transaction before
        // this method runs, so every accepted external probe is already
        // deduplicated even when provider callbacks arrive out of order.
        $sampledAt = CarbonImmutable::instance($sampledAt)
            ->setTimezone((string) config('app.timezone', 'UTC'))
            ->setMicrosecond(0);
        $this->recordMetric(
            key: (string) config(
                'observability.external_sli.metric_key',
                'sli.public_availability',
            ),
            status: $status,
            sampledAt: $sampledAt,
            latencyMs: $latencyMs,
            sliGoodCount: $status === MonitoringStatus::Operational ? 1 : 0,
            sliTotalCount: 1,
            externallyDeduplicated: true,
        );
    }

    /**
     * Persist one idempotent sample per metric and minute. Repeated manual
     * collections in the same minute cannot inflate availability figures.
     *
     * @param  array<string, mixed>  $snapshot
     */
    public function record(array $snapshot, ?CarbonInterface $sampledAt = null): void
    {
        $sampledAt = CarbonImmutable::instance($sampledAt ?? now())->startOfMinute();
        $this->recordBaseline($sampledAt);
        $overall = MonitoringStatus::tryFrom((string) data_get($snapshot, 'overall.status'))
            ?? MonitoringStatus::Unknown;

        $this->recordMetric(
            key: 'overall',
            status: $overall,
            sampledAt: $sampledAt,
        );

        collect((array) ($snapshot['services'] ?? []))
            ->filter(static fn (mixed $service): bool => is_array($service))
            ->unique(static fn (array $service): string => (string) ($service['key'] ?? ''))
            ->each(function (array $service) use ($sampledAt): void {
                $serviceKey = (string) ($service['key'] ?? '');

                if (preg_match('/^[a-z0-9][a-z0-9_.:-]{0,83}$/', $serviceKey) !== 1) {
                    return;
                }

                $this->recordMetric(
                    key: 'service.'.$serviceKey,
                    status: MonitoringStatus::tryFrom((string) ($service['status'] ?? ''))
                        ?? MonitoringStatus::Unknown,
                    sampledAt: $sampledAt,
                    latencyMs: is_numeric($service['latency_ms'] ?? null)
                        ? (int) $service['latency_ms']
                        : null,
                );
            });

        $queueDepth = data_get($snapshot, 'queue.depth');

        $this->recordMetric(
            key: 'queue.depth',
            status: MonitoringStatus::tryFrom((string) data_get($snapshot, 'queue.status'))
                ?? MonitoringStatus::Unknown,
            sampledAt: $sampledAt,
            value: is_numeric($queueDepth) ? (float) $queueDepth : null,
        );

        if (is_array($snapshot['documents'] ?? null)) {
            $documentStatus = MonitoringStatus::tryFrom((string) data_get(
                $snapshot,
                'documents.status',
            )) ?? MonitoringStatus::Unknown;
            $documentDepth = data_get($snapshot, 'documents.pending');
            $renderDuration = data_get($snapshot, 'documents.latest_render_duration_ms');
            $storageFreePercent = data_get($snapshot, 'documents.storage_free_percent');

            $this->recordMetric(
                key: 'documents.queue_depth',
                status: $documentStatus,
                sampledAt: $sampledAt,
                value: is_numeric($documentDepth) ? (float) $documentDepth : null,
            );
            $this->recordMetric(
                key: 'documents.render_duration',
                status: $documentStatus,
                sampledAt: $sampledAt,
                latencyMs: is_numeric($renderDuration) ? (int) $renderDuration : null,
                value: is_numeric($renderDuration) ? (float) $renderDuration : null,
            );
            $this->recordMetric(
                key: 'documents.storage_free_percent',
                status: $documentStatus,
                sampledAt: $sampledAt,
                value: is_numeric($storageFreePercent) ? (float) $storageFreePercent : null,
            );
        }

        if (is_array($snapshot['performance'] ?? null)) {
            $performanceStatus = MonitoringStatus::tryFrom((string) data_get(
                $snapshot,
                'performance.status',
            )) ?? MonitoringStatus::Unknown;
            $httpStatus = MonitoringStatus::tryFrom((string) data_get(
                $snapshot,
                'performance.http.status',
            )) ?? MonitoringStatus::Unknown;
            $queueStatus = MonitoringStatus::tryFrom((string) data_get(
                $snapshot,
                'performance.queues.status',
            )) ?? MonitoringStatus::Unknown;
            $databaseStatus = MonitoringStatus::tryFrom((string) data_get(
                $snapshot,
                'performance.database.status',
            )) ?? MonitoringStatus::Unknown;

            foreach ([
                'http.requests_per_minute' => 'performance.http.requests_per_minute',
                'http.error_rate_percent' => 'performance.http.error_rate_percent',
                'http.p50_ms' => 'performance.http.p50_ms',
                'http.p95_ms' => 'performance.http.p95_ms',
                'http.p99_ms' => 'performance.http.p99_ms',
                'http.capacity.utilization_percent' => 'performance.http.capacity_utilization',
            ] as $path => $key) {
                $value = data_get($snapshot, 'performance.'.$path);
                $this->recordMetric(
                    key: $key,
                    status: $httpStatus,
                    sampledAt: $sampledAt,
                    latencyMs: str_ends_with($path, '_ms') && is_numeric($value)
                        ? (int) $value
                        : null,
                    value: is_numeric($value) ? (float) $value : null,
                );
            }

            foreach ([
                'processed_count' => 'performance.queue.processed',
                'jobs_per_minute' => 'performance.queue.jobs_per_minute',
                'error_rate_percent' => 'performance.queue.error_rate_percent',
                'p95_wait_ms' => 'performance.queue.p95_wait_ms',
                'p95_runtime_ms' => 'performance.queue.p95_runtime_ms',
            ] as $path => $key) {
                $value = data_get($snapshot, 'performance.queues.'.$path);
                $this->recordMetric(
                    key: $key,
                    status: $queueStatus,
                    sampledAt: $sampledAt,
                    latencyMs: str_ends_with($path, '_ms') && is_numeric($value)
                        ? (int) $value
                        : null,
                    value: is_numeric($value) ? (float) $value : null,
                );
            }

            foreach ([
                'connections.utilization_percent' => 'performance.database.connection_utilization',
                'queries_per_second' => 'performance.database.queries_per_second',
                'slow_queries_per_minute' => 'performance.database.slow_queries_per_minute',
                'lock_waits_current' => 'performance.database.lock_waits_current',
                'buffer_pool_hit_percent' => 'performance.database.buffer_pool_hit_percent',
            ] as $path => $key) {
                $value = data_get($snapshot, 'performance.database.'.$path);
                $this->recordMetric(
                    key: $key,
                    status: $databaseStatus,
                    sampledAt: $sampledAt,
                    value: is_numeric($value) ? (float) $value : null,
                );
            }

            $this->recordMetric(
                key: 'performance.overall',
                status: $performanceStatus,
                sampledAt: $sampledAt,
            );

            foreach ([
                'booking_success' => 'sli.booking_success',
                'request_latency' => 'sli.request_latency',
            ] as $path => $metricKey) {
                $good = data_get($snapshot, "performance.sli.{$path}.good_count");
                $total = data_get($snapshot, "performance.sli.{$path}.total_count");
                $status = MonitoringStatus::tryFrom((string) data_get(
                    $snapshot,
                    "performance.sli.{$path}.status",
                )) ?? MonitoringStatus::Unknown;
                $this->recordMetric(
                    key: $metricKey,
                    status: $status,
                    sampledAt: $sampledAt,
                    sliGoodCount: is_numeric($good) ? (int) $good : 0,
                    sliTotalCount: is_numeric($total) ? (int) $total : 0,
                );
            }
        }

        $duration = $snapshot['collection_duration_ms'] ?? null;

        $this->recordMetric(
            key: 'collector.duration',
            status: $overall,
            sampledAt: $sampledAt,
            latencyMs: is_numeric($duration) ? (int) $duration : null,
            value: is_numeric($duration) ? (float) $duration : null,
        );
    }

    private function recordBaseline(CarbonImmutable $sampledAt): void
    {
        try {
            MonitoringHeartbeat::query()->firstOrCreate(
                ['key' => self::BASELINE_HEARTBEAT_KEY],
                [
                    'category' => 'monitoring',
                    'status' => MonitoringStatus::Operational->value,
                    'observed_at' => $sampledAt,
                    'last_success_at' => $sampledAt,
                    'message' => 'Internal SLI coverage baseline.',
                ],
            );
        } catch (QueryException $exception) {
            if (! MonitoringHeartbeat::query()->whereKey(self::BASELINE_HEARTBEAT_KEY)->exists()) {
                throw $exception;
            }
        }
    }

    private function recordMetric(
        string $key,
        MonitoringStatus $status,
        CarbonImmutable $sampledAt,
        ?int $latencyMs = null,
        ?float $value = null,
        int $sliGoodCount = 0,
        int $sliTotalCount = 0,
        bool $externallyDeduplicated = false,
    ): void {
        if (preg_match('/^[a-z0-9][a-z0-9_.:-]{0,99}$/', $key) !== 1) {
            throw new InvalidArgumentException('Invalid monitoring rollup metric key.');
        }

        $bucketStartedAt = $sampledAt->startOfHour();
        $latencyMs = $latencyMs === null ? null : max(0, min($latencyMs, 86_400_000));
        $value = $value !== null && is_finite($value) ? $value : null;
        $sliTotalCount = max(0, $sliTotalCount);
        $sliGoodCount = max(0, min($sliGoodCount, $sliTotalCount));
        $countColumn = $status->value.'_count';

        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                DB::transaction(function () use (
                    $key,
                    $sampledAt,
                    $bucketStartedAt,
                    $latencyMs,
                    $value,
                    $sliGoodCount,
                    $sliTotalCount,
                    $countColumn,
                    $externallyDeduplicated,
                ): void {
                    $rollup = MonitoringRollup::query()
                        ->where('metric_key', $key)
                        ->where('bucket_started_at', $bucketStartedAt)
                        ->lockForUpdate()
                        ->first();

                    if (! $externallyDeduplicated
                        && $rollup !== null
                        && $rollup->last_sampled_at !== null
                        && $rollup->last_sampled_at->greaterThanOrEqualTo($sampledAt)) {
                        return;
                    }

                    if ($rollup === null) {
                        $rollup = new MonitoringRollup([
                            'metric_key' => $key,
                            'bucket_started_at' => $bucketStartedAt,
                            'first_sampled_at' => $sampledAt,
                            'last_sampled_at' => $sampledAt,
                            'sample_count' => 0,
                            'operational_count' => 0,
                            'degraded_count' => 0,
                            'outage_count' => 0,
                            'unknown_count' => 0,
                            'sli_good_count' => 0,
                            'sli_total_count' => 0,
                            'latency_sample_count' => 0,
                            'latency_sum_ms' => 0,
                            'value_sample_count' => 0,
                            'value_sum' => 0,
                        ]);
                    }

                    $attributes = [
                        'first_sampled_at' => $rollup->first_sampled_at === null
                            || $sampledAt->lessThan($rollup->first_sampled_at)
                                ? $sampledAt
                                : $rollup->first_sampled_at,
                        'last_sampled_at' => $rollup->last_sampled_at === null
                            || $sampledAt->greaterThan($rollup->last_sampled_at)
                                ? $sampledAt
                                : $rollup->last_sampled_at,
                        'sample_count' => (int) $rollup->sample_count + 1,
                        $countColumn => (int) $rollup->{$countColumn} + 1,
                        'sli_good_count' => (int) $rollup->sli_good_count + $sliGoodCount,
                        'sli_total_count' => (int) $rollup->sli_total_count + $sliTotalCount,
                    ];

                    if ($latencyMs !== null) {
                        $attributes['latency_sample_count'] = (int) $rollup->latency_sample_count + 1;
                        $attributes['latency_sum_ms'] = (int) $rollup->latency_sum_ms + $latencyMs;
                        $attributes['latency_max_ms'] = max(
                            $latencyMs,
                            (int) ($rollup->latency_max_ms ?? 0),
                        );
                    }

                    if ($value !== null) {
                        $attributes['value_sample_count'] = (int) $rollup->value_sample_count + 1;
                        $attributes['value_sum'] = (float) $rollup->value_sum + $value;
                        $attributes['value_max'] = max(
                            $value,
                            (float) ($rollup->value_max ?? $value),
                        );
                        $attributes['value_last'] = $value;
                    }

                    $rollup->forceFill($attributes)->save();
                }, 3);

                return;
            } catch (QueryException $exception) {
                if ($attempt === 3) {
                    throw $exception;
                }
            }
        }
    }
}
