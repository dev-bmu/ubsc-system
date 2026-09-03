<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use Carbon\CarbonImmutable;
use Throwable;

final class PerformanceCapacityMonitor
{
    public function __construct(
        private readonly PerformanceMetricRepository $metrics,
        private readonly BackgroundQueueRegistry $queues,
        private readonly MonitoringTelemetryReader $telemetry,
        private readonly DatabasePerformanceMonitor $database,
        private readonly QueueWorkerCapacityAdvisor $workerCapacity,
    ) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $windowMinutes = min(30, max(1, (int) config('performance.window_minutes', 5)));
        $minimumSamples = max(1, (int) config('performance.minimum_samples', 20));
        $database = $this->database->summary();

        if (! (bool) config('performance.enabled', false)) {
            return $this->unavailable(
                $windowMinutes,
                $minimumSamples,
                $database,
                'First-party performance telemetry is disabled.',
            );
        }

        try {
            $requestRows = $this->metrics->requestWindow();
            $request = $this->requestSummary(
                $requestRows,
                $windowMinutes,
                $minimumSamples,
            );
        } catch (Throwable) {
            $request = $this->emptyRequest(
                $windowMinutes,
                $minimumSamples,
                'Request metric storage is not available.',
            );
        }

        try {
            $requestSlis = $this->requestSlis(
                $this->metrics->requestMinute(),
            );
        } catch (Throwable) {
            $requestSlis = $this->emptyRequestSlis();
        }

        $queueDefinitions = $this->queues->all();

        try {
            $queueRows = $this->metrics->queueWindow($queueDefinitions);
            $queue = $this->queueSummary(
                $queueRows,
                $queueDefinitions,
                $windowMinutes,
                $minimumSamples,
            );
        } catch (Throwable) {
            $queue = $this->emptyQueue(
                $windowMinutes,
                'Queue metric storage is not available.',
            );
        }

        $status = $this->knownWorst([
            MonitoringStatus::tryFrom((string) $request['status']) ?? MonitoringStatus::Unknown,
            MonitoringStatus::tryFrom((string) $queue['status']) ?? MonitoringStatus::Unknown,
            MonitoringStatus::tryFrom((string) $database['status']) ?? MonitoringStatus::Unknown,
        ]);

        return [
            'status' => $status->value,
            'window_minutes' => $windowMinutes,
            'minimum_samples' => $minimumSamples,
            'driver' => $this->metrics->driver(),
            'http' => $request,
            'sli' => $requestSlis,
            'queues' => $queue,
            'database' => $database,
            'signals' => $this->signals($request, $queue, $database),
        ];
    }

    /**
     * @param  list<array<string, int|string>>  $rows
     * @return array<string, mixed>
     */
    private function requestSlis(array $rows): array
    {
        $bookingScope = (string) config('observability.slo.booking_scope', 'booking_checkout');
        $latencyScopes = array_values(array_filter(
            (array) config('observability.slo.latency_scopes', ['public_read', 'booking_checkout']),
            static fn (mixed $scope): bool => is_string($scope) && $scope !== '',
        ));
        $threshold = max(50, (int) config('observability.slo.latency_threshold_ms', 800));
        $bookingRows = array_values(array_filter(
            $rows,
            static fn (array $row): bool => ($row['scope'] ?? null) === $bookingScope,
        ));
        $latencyRows = array_values(array_filter(
            $rows,
            static fn (array $row): bool => in_array(
                (string) ($row['scope'] ?? ''),
                $latencyScopes,
                true,
            ),
        ));
        $bookingTotal = array_sum(array_map(
            static fn (array $row): int => max(0, (int) ($row['request_count'] ?? 0)),
            $bookingRows,
        ));
        $bookingErrors = min($bookingTotal, array_sum(array_map(
            static fn (array $row): int => max(0, (int) ($row['error_count'] ?? 0)),
            $bookingRows,
        )));
        $latencyTotal = array_sum(array_map(
            static fn (array $row): int => max(0, (int) ($row['request_count'] ?? 0)),
            $latencyRows,
        ));
        $latencyGood = array_sum(array_map(
            static fn (array $row): int => (int) ($row['latency_upper_bound_ms'] ?? PHP_INT_MAX) <= $threshold
                ? max(0, (int) ($row['request_count'] ?? 0))
                : 0,
            $latencyRows,
        ));

        return [
            'sampled_minute' => isset($rows[0]['bucket_started_at'])
                ? (string) $rows[0]['bucket_started_at']
                : CarbonImmutable::now('UTC')->subMinute()->startOfMinute()->toIso8601String(),
            'booking_success' => $this->sliSample(
                max(0, $bookingTotal - $bookingErrors),
                $bookingTotal,
                $this->sloTarget('booking_success'),
            ),
            'request_latency' => [
                ...$this->sliSample(
                    min($latencyGood, $latencyTotal),
                    $latencyTotal,
                    $this->sloTarget('request_latency'),
                ),
                'threshold_ms' => $threshold,
            ],
        ];
    }

    /** @return array{status:string,good_count:int,total_count:int} */
    private function sliSample(int $good, int $total, mixed $target): array
    {
        $target = is_numeric($target) ? (float) $target : null;
        $ratio = $total > 0 ? ($good / $total) * 100 : null;
        $status = $total < 1 || $target === null
            ? MonitoringStatus::Unknown
            : ($ratio >= $target ? MonitoringStatus::Operational : MonitoringStatus::Degraded);

        return [
            'status' => $status->value,
            'good_count' => max(0, min($good, $total)),
            'total_count' => max(0, $total),
        ];
    }

    private function sloTarget(string $key): ?float
    {
        foreach ((array) config('monitoring.slos.definitions', []) as $definition) {
            if (is_array($definition)
                && ($definition['key'] ?? null) === $key
                && is_numeric($definition['target_percent'] ?? null)) {
                return (float) $definition['target_percent'];
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function emptyRequestSlis(): array
    {
        return [
            'sampled_minute' => null,
            'booking_success' => [
                'status' => MonitoringStatus::Unknown->value,
                'good_count' => 0,
                'total_count' => 0,
            ],
            'request_latency' => [
                'status' => MonitoringStatus::Unknown->value,
                'good_count' => 0,
                'total_count' => 0,
                'threshold_ms' => (int) config('observability.slo.latency_threshold_ms', 800),
            ],
        ];
    }

    /**
     * @param  list<array<string, int|string>>  $rows
     * @return array<string, mixed>
     */
    private function requestSummary(
        array $rows,
        int $windowMinutes,
        int $minimumSamples,
    ): array {
        $scopes = [];
        $statuses = [];

        foreach ((array) config('performance.scopes', []) as $key => $definition) {
            if (! is_string($key) || ! is_array($definition)) {
                continue;
            }

            $scopeRows = array_values(array_filter(
                $rows,
                static fn (array $row): bool => (string) ($row['scope'] ?? '') === $key,
            ));
            $summary = $this->summarizeRequests(
                $scopeRows,
                $windowMinutes,
                $minimumSamples,
                (int) ($definition['p95_target_ms'] ?? 0),
                (int) ($definition['p99_target_ms'] ?? 0),
            );
            $summary['capacity'] = $this->capacity(
                (float) $summary['requests_per_second'],
                $definition['tested_requests_per_second'] ?? null,
                $summary['sample_status'] === 'ready',
            );

            if ($summary['sample_status'] === 'ready'
                && $summary['capacity']['status'] !== MonitoringStatus::Unknown->value) {
                $summary['status'] = $this->knownWorst([
                    MonitoringStatus::tryFrom((string) $summary['status'])
                        ?? MonitoringStatus::Unknown,
                    MonitoringStatus::tryFrom((string) $summary['capacity']['status'])
                        ?? MonitoringStatus::Unknown,
                ])->value;
            }

            $summary['key'] = $key;
            $summary['label'] = (string) ($definition['label'] ?? $key);
            $scopes[] = $summary;

            if ($summary['sample_status'] === 'ready') {
                $statuses[] = MonitoringStatus::tryFrom((string) $summary['status'])
                    ?? MonitoringStatus::Unknown;
            }
        }

        $all = $this->summarizeRequests(
            $rows,
            $windowMinutes,
            $minimumSamples,
            0,
            0,
        );
        $all['capacity'] = $this->capacity(
            (float) $all['requests_per_second'],
            config('performance.capacity.tested_requests_per_second'),
            $all['sample_status'] === 'ready',
        );
        $status = $statuses === []
            ? MonitoringStatus::Unknown
            : $this->knownWorst($statuses);

        if ($all['sample_status'] === 'ready'
            && ($all['capacity']['status'] ?? MonitoringStatus::Unknown->value)
            !== MonitoringStatus::Unknown->value) {
            $status = $this->knownWorst([
                $status,
                MonitoringStatus::tryFrom((string) $all['capacity']['status'])
                    ?? MonitoringStatus::Unknown,
            ]);
        }

        return [
            ...$all,
            'status' => $status->value,
            'scopes' => $scopes,
            'message' => $all['request_count'] === 0
                ? 'Collecting the first low-cardinality request samples.'
                : ($all['sample_status'] === 'ready'
                    ? null
                    : "At least {$minimumSamples} requests are required for stable percentiles."),
        ];
    }

    /**
     * @param  list<array<string, int|string>>  $rows
     * @return array<string, int|float|string|null>
     */
    private function summarizeRequests(
        array $rows,
        int $windowMinutes,
        int $minimumSamples,
        int $p95Target,
        int $p99Target,
    ): array {
        $syntheticTotal = 0;
        $marginalTotal = 0;
        $errors = 0;
        $durationSum = 0;
        $histogram = [];

        foreach ($rows as $row) {
            $syntheticTotal += max(0, (int) ($row['total_requests'] ?? 0));
            $count = max(0, (int) ($row['request_count'] ?? 0));
            $marginalTotal += $count;
            $errors += max(0, (int) ($row['error_count'] ?? 0));
            $durationSum += max(0, (int) ($row['duration_sum_ms'] ?? 0));
            $bound = max(0, (int) ($row['latency_upper_bound_ms'] ?? 0));

            if ($bound > 0 && $count > 0) {
                $histogram[$bound] = ($histogram[$bound] ?? 0) + $count;
            }
        }

        $requests = $syntheticTotal > 0 ? $syntheticTotal : $marginalTotal;
        $errorRate = $requests > 0 ? round(($errors / $requests) * 100, 3) : null;
        $p50 = $this->percentile($histogram, $requests, 0.50);
        $p95 = $this->percentile($histogram, $requests, 0.95);
        $p99 = $this->percentile($histogram, $requests, 0.99);
        $sampleStatus = $requests >= $minimumSamples ? 'ready' : 'collecting';
        $status = $sampleStatus === 'ready'
            ? $this->requestStatus($p95, $p99, $errorRate, $p95Target, $p99Target)
            : MonitoringStatus::Unknown;

        return [
            'status' => $status->value,
            'sample_status' => $sampleStatus,
            'request_count' => $requests,
            'error_count' => min($errors, $requests),
            'requests_per_minute' => round($requests / $windowMinutes, 3),
            'requests_per_second' => round($requests / ($windowMinutes * 60), 3),
            'average_ms' => $requests > 0 ? round($durationSum / $requests, 2) : null,
            'p50_ms' => $p50,
            'p95_ms' => $p95,
            'p99_ms' => $p99,
            'p95_target_ms' => $p95Target > 0 ? $p95Target : null,
            'p99_target_ms' => $p99Target > 0 ? $p99Target : null,
            'error_rate_percent' => $errorRate,
        ];
    }

    /**
     * @param  list<array<string, int|string>>  $rows
     * @param  list<array{key:string,label:string,connection:string,queue:string}>  $definitions
     * @return array<string, mixed>
     */
    private function queueSummary(
        array $rows,
        array $definitions,
        int $windowMinutes,
        int $minimumSamples,
    ): array {
        $items = [];
        $statuses = [];

        foreach ($definitions as $definition) {
            $queueRows = array_values(array_filter(
                $rows,
                static fn (array $row): bool => (string) ($row['connection'] ?? '') === $definition['connection']
                    && (string) ($row['queue'] ?? '') === $definition['queue'],
            ));
            $metrics = $this->summarizeQueueRows(
                $queueRows,
                $windowMinutes,
                $minimumSamples,
            );
            $pulse = $this->telemetry->queueFor(
                connection: $definition['connection'],
                queue: $definition['queue'],
                thresholds: [
                    'warning_depth' => (int) config('background_jobs.monitoring.warning_depth', 50),
                    'outage_depth' => (int) config('background_jobs.monitoring.outage_depth', 250),
                    'warning_age_seconds' => (int) config('background_jobs.monitoring.warning_age_seconds', 120),
                    'outage_age_seconds' => (int) config('background_jobs.monitoring.outage_age_seconds', 600),
                ],
                sampleLimit: (int) config('background_jobs.monitoring.sample_limit', 1_000),
            );
            $workers = $this->workerCapacity->recommend($definition, $metrics, $pulse);
            $status = $this->knownWorst([
                MonitoringStatus::tryFrom((string) $pulse['status']) ?? MonitoringStatus::Unknown,
                MonitoringStatus::tryFrom((string) $metrics['status']) ?? MonitoringStatus::Unknown,
                ($workers['capacity_limited'] ?? false)
                    ? MonitoringStatus::Degraded
                    : MonitoringStatus::Unknown,
            ]);
            $items[] = [
                ...$definition,
                ...$metrics,
                ...$pulse,
                'workers' => $workers,
                'status' => $status->value,
            ];
            $statuses[] = $status;
        }

        $aggregate = $this->summarizeQueueRows(
            $rows,
            $windowMinutes,
            $minimumSamples,
        );

        return [
            ...$aggregate,
            'status' => $statuses === []
                ? MonitoringStatus::Unknown->value
                : $this->knownWorst($statuses)->value,
            'items' => $items,
            'message' => $definitions === []
                ? 'No background queue definitions are configured.'
                : null,
        ];
    }

    /**
     * @param  list<array<string, int|string>>  $rows
     * @return array<string, int|float|string|null>
     */
    private function summarizeQueueRows(
        array $rows,
        int $windowMinutes,
        int $minimumSamples,
    ): array {
        $syntheticTotal = 0;
        $databaseTotal = 0;
        $failed = 0;
        $waitSum = 0;
        $runtimeSum = 0;
        $waitHistogram = [];
        $runtimeHistogram = [];

        foreach ($rows as $row) {
            $syntheticTotal += max(0, (int) ($row['total_processed'] ?? 0));
            $count = max(0, (int) ($row['processed_count'] ?? 0));
            $failed += max(0, (int) ($row['failed_count'] ?? 0));
            $waitSum += max(0, (int) ($row['wait_sum_ms'] ?? 0));
            $runtimeSum += max(0, (int) ($row['runtime_sum_ms'] ?? 0));
            $waitBound = max(0, (int) ($row['wait_upper_bound_ms'] ?? 0));
            $runtimeBound = max(0, (int) ($row['runtime_upper_bound_ms'] ?? 0));

            if ($waitBound > 0) {
                $waitHistogram[$waitBound] = ($waitHistogram[$waitBound] ?? 0) + $count;
            }

            if ($runtimeBound > 0) {
                $runtimeHistogram[$runtimeBound] = ($runtimeHistogram[$runtimeBound] ?? 0) + $count;
            }

            if ($waitBound > 0 && $runtimeBound > 0) {
                $databaseTotal += $count;
            }
        }

        $processed = $syntheticTotal > 0 ? $syntheticTotal : $databaseTotal;
        $errorRate = $processed > 0 ? round(($failed / $processed) * 100, 3) : null;
        $p95Wait = $this->percentile($waitHistogram, $processed, 0.95);
        $p95Runtime = $this->percentile($runtimeHistogram, $processed, 0.95);
        $sampleStatus = $processed >= $minimumSamples ? 'ready' : 'collecting';
        $status = $sampleStatus === 'ready'
            ? $this->queueMetricStatus($p95Wait, $errorRate)
            : MonitoringStatus::Unknown;

        return [
            'status' => $status->value,
            'sample_status' => $sampleStatus,
            'processed_count' => $processed,
            'failed_count' => min($failed, $processed),
            'jobs_per_minute' => round($processed / $windowMinutes, 3),
            'average_wait_ms' => $processed > 0 ? round($waitSum / $processed, 2) : null,
            'p50_wait_ms' => $this->percentile($waitHistogram, $processed, 0.50),
            'p95_wait_ms' => $p95Wait,
            'p99_wait_ms' => $this->percentile($waitHistogram, $processed, 0.99),
            'average_runtime_ms' => $processed > 0 ? round($runtimeSum / $processed, 2) : null,
            'p50_runtime_ms' => $this->percentile($runtimeHistogram, $processed, 0.50),
            'p95_runtime_ms' => $p95Runtime,
            'p99_runtime_ms' => $this->percentile($runtimeHistogram, $processed, 0.99),
            'error_rate_percent' => $errorRate,
        ];
    }

    private function requestStatus(
        ?int $p95,
        ?int $p99,
        ?float $errorRate,
        int $p95Target,
        int $p99Target,
    ): MonitoringStatus {
        $statuses = [$this->errorStatus(
            $errorRate,
            (float) config('performance.error_rate.warning_percent', 1),
            (float) config('performance.error_rate.outage_percent', 5),
        )];

        if ($p95Target > 0 && $p95 !== null) {
            $statuses[] = match (true) {
                $p95 >= $p95Target * 2 => MonitoringStatus::Outage,
                $p95 > $p95Target => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };
        }

        if ($p99Target > 0 && $p99 !== null) {
            $statuses[] = match (true) {
                $p99 >= $p99Target * 2 => MonitoringStatus::Outage,
                $p99 > $p99Target => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };
        }

        return $this->knownWorst($statuses);
    }

    private function queueMetricStatus(?int $p95Wait, ?float $errorRate): MonitoringStatus
    {
        $statuses = [$this->errorStatus(
            $errorRate,
            (float) config('performance.queue.error_warning_percent', 1),
            (float) config('performance.queue.error_outage_percent', 5),
        )];

        if ($p95Wait !== null) {
            $statuses[] = match (true) {
                $p95Wait >= (int) config('performance.queue.wait_outage_ms', 30_000) => MonitoringStatus::Outage,
                $p95Wait >= (int) config('performance.queue.wait_warning_ms', 5_000) => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };
        }

        return $this->knownWorst($statuses);
    }

    private function errorStatus(
        ?float $rate,
        float $warning,
        float $outage,
    ): MonitoringStatus {
        if ($rate === null) {
            return MonitoringStatus::Unknown;
        }

        return match (true) {
            $rate >= $outage => MonitoringStatus::Outage,
            $rate >= $warning => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
    }

    /** @return array<string, int|float|string|null> */
    private function capacity(
        float $requestsPerSecond,
        mixed $configured,
        bool $sampleReady,
    ): array {
        if (! is_numeric($configured) || (float) $configured <= 0) {
            return [
                'status' => MonitoringStatus::Unknown->value,
                'tested_requests_per_second' => null,
                'utilization_percent' => null,
                'headroom_requests_per_second' => null,
                'message' => 'Set tested capacity only after a repeatable production-like load test.',
            ];
        }

        $tested = (float) $configured;
        $utilization = round(($requestsPerSecond / $tested) * 100, 2);
        $status = ! $sampleReady
            ? MonitoringStatus::Unknown
            : match (true) {
                $utilization >= (float) config('performance.capacity.outage_utilization_percent', 90) => MonitoringStatus::Outage,
                $utilization >= (float) config('performance.capacity.warning_utilization_percent', 70) => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };

        return [
            'status' => $status->value,
            'tested_requests_per_second' => round($tested, 3),
            'utilization_percent' => $utilization,
            'headroom_requests_per_second' => round(max(0, $tested - $requestsPerSecond), 3),
            'message' => $sampleReady
                ? null
                : 'Capacity is configured, but the live sample window is still collecting.',
        ];
    }

    /** @param array<int, int> $histogram */
    private function percentile(array $histogram, int $sampleCount, float $quantile): ?int
    {
        if ($sampleCount < 1 || $histogram === []) {
            return null;
        }

        ksort($histogram, SORT_NUMERIC);
        $target = max(1, (int) ceil($sampleCount * $quantile));
        $observed = 0;

        foreach ($histogram as $upperBound => $count) {
            $observed += max(0, (int) $count);

            if ($observed >= $target) {
                return (int) $upperBound;
            }
        }

        return (int) array_key_last($histogram);
    }

    /** @param iterable<MonitoringStatus> $statuses */
    private function knownWorst(iterable $statuses): MonitoringStatus
    {
        $known = [];

        foreach ($statuses as $status) {
            if ($status !== MonitoringStatus::Unknown) {
                $known[] = $status;
            }
        }

        return $known === [] ? MonitoringStatus::Unknown : MonitoringStatus::worst($known);
    }

    /** @return list<array<string, mixed>> */
    private function signals(array $request, array $queue, array $database): array
    {
        return [
            [
                'key' => 'http_request_latency',
                'name' => 'HTTP P95 latency',
                'value' => $request['p95_ms'],
                'unit' => 'ms',
                'status' => $request['status'],
                'message' => $request['message'],
            ],
            [
                'key' => 'http_throughput',
                'name' => 'HTTP throughput',
                'value' => $request['requests_per_minute'],
                'unit' => 'req/min',
                'status' => $request['status'],
                'message' => null,
            ],
            [
                'key' => 'http_error_rate',
                'name' => 'HTTP 5xx rate',
                'value' => $request['error_rate_percent'],
                'unit' => '%',
                'status' => $request['status'],
                'message' => null,
            ],
            [
                'key' => 'queue_wait_p95',
                'name' => 'Queue wait P95',
                'value' => $queue['p95_wait_ms'],
                'unit' => 'ms',
                'status' => $queue['status'],
                'message' => $queue['message'],
            ],
            [
                'key' => 'database_connections',
                'name' => 'Database connections',
                'value' => data_get($database, 'connections.utilization_percent'),
                'unit' => '%',
                'status' => $database['status'],
                'message' => $database['message'],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function emptyRequest(int $windowMinutes, int $minimumSamples, string $message): array
    {
        return [
            ...$this->summarizeRequests([], $windowMinutes, $minimumSamples, 0, 0),
            'capacity' => $this->capacity(
                0,
                config('performance.capacity.tested_requests_per_second'),
                false,
            ),
            'scopes' => [],
            'message' => $message,
        ];
    }

    /** @return array<string, mixed> */
    private function emptyQueue(int $windowMinutes, string $message): array
    {
        return [
            ...$this->summarizeQueueRows([], $windowMinutes, 1),
            'items' => [],
            'message' => $message,
        ];
    }

    /** @return array<string, mixed> */
    private function unavailable(
        int $windowMinutes,
        int $minimumSamples,
        array $database,
        string $message,
    ): array {
        $request = $this->emptyRequest($windowMinutes, $minimumSamples, $message);
        $queue = $this->emptyQueue($windowMinutes, $message);

        return [
            'status' => MonitoringStatus::Unknown->value,
            'window_minutes' => $windowMinutes,
            'minimum_samples' => $minimumSamples,
            'driver' => $this->metrics->driver(),
            'http' => $request,
            'sli' => $this->emptyRequestSlis(),
            'queues' => $queue,
            'database' => $database,
            'signals' => $this->signals($request, $queue, $database),
        ];
    }
}
