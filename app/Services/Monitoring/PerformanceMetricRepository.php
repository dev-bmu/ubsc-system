<?php

namespace App\Services\Monitoring;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use InvalidArgumentException;

class PerformanceMetricRepository
{
    private const REQUEST_TABLE = 'performance_request_buckets';

    private const QUEUE_TABLE = 'performance_queue_buckets';

    public function driver(): string
    {
        return strtolower(trim((string) config('performance.driver', 'database')));
    }

    public function recordRequest(
        string $scope,
        int $durationMs,
        bool $failed,
        ?CarbonInterface $at = null,
    ): void {
        if (! array_key_exists($scope, (array) config('performance.scopes', []))) {
            throw new InvalidArgumentException('Unsupported performance request scope.');
        }

        $durationMs = $this->duration($durationMs);
        $bucket = $this->latencyUpperBound($durationMs);
        $startedAt = $this->minute($at);

        match ($this->driver()) {
            'database' => $this->recordDatabaseRequest(
                $scope,
                $startedAt,
                $bucket,
                $durationMs,
                $failed,
            ),
            'redis' => $this->recordRedisRequest(
                $scope,
                $startedAt,
                $bucket,
                $durationMs,
                $failed,
            ),
            default => throw new InvalidArgumentException('Unsupported performance metric driver.'),
        };
    }

    public function recordQueue(
        string $connection,
        string $queue,
        int $waitMs,
        int $runtimeMs,
        bool $failed,
        ?CarbonInterface $at = null,
    ): void {
        $this->assertIdentifier($connection);
        $this->assertIdentifier($queue);
        $waitMs = $this->duration($waitMs);
        $runtimeMs = $this->duration($runtimeMs);
        $waitBucket = $this->latencyUpperBound($waitMs);
        $runtimeBucket = $this->latencyUpperBound($runtimeMs);
        $startedAt = $this->minute($at);

        match ($this->driver()) {
            'database' => $this->recordDatabaseQueue(
                $connection,
                $queue,
                $startedAt,
                $waitBucket,
                $runtimeBucket,
                $waitMs,
                $runtimeMs,
                $failed,
            ),
            'redis' => $this->recordRedisQueue(
                $connection,
                $queue,
                $startedAt,
                $waitBucket,
                $runtimeBucket,
                $waitMs,
                $runtimeMs,
                $failed,
            ),
            default => throw new InvalidArgumentException('Unsupported performance metric driver.'),
        };
    }

    /** @return list<array<string, int|string>> */
    public function requestWindow(?CarbonInterface $at = null): array
    {
        $end = $this->minute($at);
        $start = $end->subMinutes($this->windowMinutes() - 1);

        return match ($this->driver()) {
            'database' => $this->database()->table(self::REQUEST_TABLE)
                ->whereBetween('bucket_started_at', [$start, $end->endOfMinute()])
                ->whereIn('scope', array_keys((array) config('performance.scopes', [])))
                ->orderBy('bucket_started_at')
                ->orderBy('scope')
                ->orderBy('latency_upper_bound_ms')
                ->get([
                    'bucket_started_at', 'scope', 'latency_upper_bound_ms',
                    'request_count', 'error_count', 'duration_sum_ms',
                ])
                ->map(static fn (object $row): array => (array) $row)
                ->all(),
            'redis' => $this->redisRequestWindow($start, $end),
            default => throw new InvalidArgumentException('Unsupported performance metric driver.'),
        };
    }

    /**
     * Return one complete low-cardinality minute for SLI aggregation. The
     * collector normally requests the previous minute so in-flight requests
     * cannot move between buckets while the objective sample is recorded.
     *
     * @return list<array<string, int|string>>
     */
    public function requestMinute(?CarbonInterface $at = null): array
    {
        $minute = $this->minute($at ?? CarbonImmutable::now('UTC')->subMinute());

        return match ($this->driver()) {
            'database' => $this->database()->table(self::REQUEST_TABLE)
                ->whereBetween('bucket_started_at', [$minute, $minute->endOfMinute()])
                ->whereIn('scope', array_keys((array) config('performance.scopes', [])))
                ->orderBy('scope')
                ->orderBy('latency_upper_bound_ms')
                ->get([
                    'bucket_started_at', 'scope', 'latency_upper_bound_ms',
                    'request_count', 'error_count', 'duration_sum_ms',
                ])
                ->map(static fn (object $row): array => (array) $row)
                ->all(),
            'redis' => $this->redisRequestWindow($minute, $minute),
            default => throw new InvalidArgumentException('Unsupported performance metric driver.'),
        };
    }

    /**
     * @param  list<array{connection:string,queue:string}>  $queues
     * @return list<array<string, int|string>>
     */
    public function queueWindow(array $queues, ?CarbonInterface $at = null): array
    {
        $end = $this->minute($at);
        $start = $end->subMinutes($this->windowMinutes() - 1);

        return match ($this->driver()) {
            'database' => $this->databaseQueueWindow($queues, $start, $end),
            'redis' => $this->redisQueueWindow($queues, $start, $end),
            default => throw new InvalidArgumentException('Unsupported performance metric driver.'),
        };
    }

    /** @return array{request_buckets:int,queue_buckets:int} */
    public function prune(int $limit = 5_000): array
    {
        if ($this->driver() !== 'database') {
            return ['request_buckets' => 0, 'queue_buckets' => 0];
        }

        $limit = min(25_000, max(1, $limit));
        $cutoff = CarbonImmutable::now('UTC')->subHours(
            max(24, (int) config('performance.retention_hours', 168)),
        );

        return [
            'request_buckets' => $this->pruneTable(self::REQUEST_TABLE, $cutoff, $limit),
            'queue_buckets' => $this->pruneTable(self::QUEUE_TABLE, $cutoff, $limit),
        ];
    }

    private function recordDatabaseRequest(
        string $scope,
        CarbonImmutable $startedAt,
        int $upperBound,
        int $durationMs,
        bool $failed,
    ): void {
        $now = now();
        $this->database()->table(self::REQUEST_TABLE)->upsert(
            [[
                'bucket_started_at' => $startedAt,
                'scope' => $scope,
                'latency_upper_bound_ms' => $upperBound,
                'request_count' => 1,
                'error_count' => $failed ? 1 : 0,
                'duration_sum_ms' => $durationMs,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['scope', 'bucket_started_at', 'latency_upper_bound_ms'],
            [
                'request_count' => DB::raw('request_count + 1'),
                'error_count' => DB::raw('error_count + '.($failed ? 1 : 0)),
                'duration_sum_ms' => DB::raw('duration_sum_ms + '.$durationMs),
                'updated_at' => $now,
            ],
        );
    }

    private function recordDatabaseQueue(
        string $connection,
        string $queue,
        CarbonImmutable $startedAt,
        int $waitUpperBound,
        int $runtimeUpperBound,
        int $waitMs,
        int $runtimeMs,
        bool $failed,
    ): void {
        $now = now();
        $this->database()->table(self::QUEUE_TABLE)->upsert(
            [[
                'bucket_started_at' => $startedAt,
                'connection' => $connection,
                'queue' => $queue,
                'wait_upper_bound_ms' => $waitUpperBound,
                'runtime_upper_bound_ms' => $runtimeUpperBound,
                'processed_count' => 1,
                'failed_count' => $failed ? 1 : 0,
                'wait_sum_ms' => $waitMs,
                'runtime_sum_ms' => $runtimeMs,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            [
                'connection', 'queue', 'bucket_started_at',
                'wait_upper_bound_ms', 'runtime_upper_bound_ms',
            ],
            [
                'processed_count' => DB::raw('processed_count + 1'),
                'failed_count' => DB::raw('failed_count + '.($failed ? 1 : 0)),
                'wait_sum_ms' => DB::raw('wait_sum_ms + '.$waitMs),
                'runtime_sum_ms' => DB::raw('runtime_sum_ms + '.$runtimeMs),
                'updated_at' => $now,
            ],
        );
    }

    private function recordRedisRequest(
        string $scope,
        CarbonImmutable $startedAt,
        int $upperBound,
        int $durationMs,
        bool $failed,
    ): void {
        $script = <<<'LUA'
redis.call('HINCRBY', KEYS[1], 'requests', 1)
redis.call('HINCRBY', KEYS[1], 'errors', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'duration_sum_ms', ARGV[2])
redis.call('HINCRBY', KEYS[1], 'latency:' .. ARGV[3], 1)
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
LUA;

        Redis::connection((string) config('performance.redis_connection', 'cache'))
            ->eval(
                $script,
                1,
                $this->requestRedisKey($scope, $startedAt),
                $failed ? 1 : 0,
                $durationMs,
                $upperBound,
                $this->redisTtlSeconds(),
            );
    }

    private function recordRedisQueue(
        string $connection,
        string $queue,
        CarbonImmutable $startedAt,
        int $waitUpperBound,
        int $runtimeUpperBound,
        int $waitMs,
        int $runtimeMs,
        bool $failed,
    ): void {
        $script = <<<'LUA'
redis.call('HINCRBY', KEYS[1], 'processed', 1)
redis.call('HINCRBY', KEYS[1], 'failed', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'wait_sum_ms', ARGV[2])
redis.call('HINCRBY', KEYS[1], 'runtime_sum_ms', ARGV[3])
redis.call('HINCRBY', KEYS[1], 'wait:' .. ARGV[4], 1)
redis.call('HINCRBY', KEYS[1], 'runtime:' .. ARGV[5], 1)
redis.call('EXPIRE', KEYS[1], ARGV[6])
return 1
LUA;

        Redis::connection((string) config('performance.redis_connection', 'cache'))
            ->eval(
                $script,
                1,
                $this->queueRedisKey($connection, $queue, $startedAt),
                $failed ? 1 : 0,
                $waitMs,
                $runtimeMs,
                $waitUpperBound,
                $runtimeUpperBound,
                $this->redisTtlSeconds(),
            );
    }

    /**
     * @param  list<array{connection:string,queue:string}>  $queues
     * @return list<array<string, int|string>>
     */
    private function databaseQueueWindow(
        array $queues,
        CarbonImmutable $start,
        CarbonImmutable $end,
    ): array {
        $safe = [];

        foreach ($queues as $definition) {
            $connection = (string) ($definition['connection'] ?? '');
            $queue = (string) ($definition['queue'] ?? '');
            $this->assertIdentifier($connection);
            $this->assertIdentifier($queue);
            $safe[$connection."\0".$queue] = compact('connection', 'queue');
        }

        if ($safe === []) {
            return [];
        }

        return $this->database()->table(self::QUEUE_TABLE)
            ->whereBetween('bucket_started_at', [$start, $end->endOfMinute()])
            ->where(function ($query) use ($safe): void {
                foreach ($safe as $definition) {
                    $query->orWhere(function ($pair) use ($definition): void {
                        $pair
                            ->where('connection', $definition['connection'])
                            ->where('queue', $definition['queue']);
                    });
                }
            })
            ->orderBy('bucket_started_at')
            ->orderBy('connection')
            ->orderBy('queue')
            ->get([
                'bucket_started_at', 'connection', 'queue',
                'wait_upper_bound_ms', 'runtime_upper_bound_ms',
                'processed_count', 'failed_count', 'wait_sum_ms',
                'runtime_sum_ms',
            ])
            ->map(static fn (object $row): array => (array) $row)
            ->all();
    }

    /** @return list<array<string, int|string>> */
    private function redisRequestWindow(
        CarbonImmutable $start,
        CarbonImmutable $end,
    ): array {
        $redis = Redis::connection((string) config('performance.redis_connection', 'cache'));
        $rows = [];

        foreach (array_keys((array) config('performance.scopes', [])) as $scope) {
            for ($minute = $start; $minute->lte($end); $minute = $minute->addMinute()) {
                $values = (array) $redis->hgetall($this->requestRedisKey($scope, $minute));

                foreach ($values as $field => $value) {
                    if (! is_string($field) || ! str_starts_with($field, 'latency:')) {
                        continue;
                    }

                    $upperBound = (int) substr($field, 8);
                    $count = max(0, (int) $value);
                    $rows[] = [
                        'bucket_started_at' => $minute->toDateTimeString(),
                        'scope' => $scope,
                        'latency_upper_bound_ms' => $upperBound,
                        'request_count' => $count,
                        'error_count' => 0,
                        'duration_sum_ms' => 0,
                    ];
                }

                $this->applyRedisRequestTotals($rows, $values, $scope, $minute);
            }
        }

        return $rows;
    }

    /**
     * @param  list<array{connection:string,queue:string}>  $queues
     * @return list<array<string, int|string>>
     */
    private function redisQueueWindow(
        array $queues,
        CarbonImmutable $start,
        CarbonImmutable $end,
    ): array {
        $redis = Redis::connection((string) config('performance.redis_connection', 'cache'));
        $rows = [];

        foreach ($queues as $definition) {
            $connection = (string) ($definition['connection'] ?? '');
            $queue = (string) ($definition['queue'] ?? '');
            $this->assertIdentifier($connection);
            $this->assertIdentifier($queue);

            for ($minute = $start; $minute->lte($end); $minute = $minute->addMinute()) {
                $values = (array) $redis->hgetall(
                    $this->queueRedisKey($connection, $queue, $minute),
                );
                $wait = $this->redisHistogram($values, 'wait:');
                $runtime = $this->redisHistogram($values, 'runtime:');

                foreach ($wait as $waitBound => $waitCount) {
                    // Redis stores marginal histograms. A zero opposite bound
                    // marks these synthetic rows so summaries never double
                    // count throughput while combining both dimensions.
                    $rows[] = [
                        'bucket_started_at' => $minute->toDateTimeString(),
                        'connection' => $connection,
                        'queue' => $queue,
                        'wait_upper_bound_ms' => (int) $waitBound,
                        'runtime_upper_bound_ms' => 0,
                        'processed_count' => $waitCount,
                        'failed_count' => 0,
                        'wait_sum_ms' => 0,
                        'runtime_sum_ms' => 0,
                    ];
                }

                foreach ($runtime as $runtimeBound => $runtimeCount) {
                    $rows[] = [
                        'bucket_started_at' => $minute->toDateTimeString(),
                        'connection' => $connection,
                        'queue' => $queue,
                        'wait_upper_bound_ms' => 0,
                        'runtime_upper_bound_ms' => (int) $runtimeBound,
                        'processed_count' => $runtimeCount,
                        'failed_count' => 0,
                        'wait_sum_ms' => 0,
                        'runtime_sum_ms' => 0,
                    ];
                }

                $processed = max(0, (int) ($values['processed'] ?? 0));

                if ($processed > 0) {
                    $rows[] = [
                        'bucket_started_at' => $minute->toDateTimeString(),
                        'connection' => $connection,
                        'queue' => $queue,
                        'wait_upper_bound_ms' => 0,
                        'runtime_upper_bound_ms' => 0,
                        'processed_count' => 0,
                        'failed_count' => max(0, (int) ($values['failed'] ?? 0)),
                        'wait_sum_ms' => max(0, (int) ($values['wait_sum_ms'] ?? 0)),
                        'runtime_sum_ms' => max(0, (int) ($values['runtime_sum_ms'] ?? 0)),
                        'total_processed' => $processed,
                    ];
                }
            }
        }

        return $rows;
    }

    /** @param list<array<string, int|string>> $rows */
    private function applyRedisRequestTotals(
        array &$rows,
        array $values,
        string $scope,
        CarbonImmutable $minute,
    ): void {
        $requests = max(0, (int) ($values['requests'] ?? 0));

        if ($requests === 0) {
            return;
        }

        $rows[] = [
            'bucket_started_at' => $minute->toDateTimeString(),
            'scope' => $scope,
            'latency_upper_bound_ms' => 0,
            'request_count' => 0,
            'error_count' => max(0, (int) ($values['errors'] ?? 0)),
            'duration_sum_ms' => max(0, (int) ($values['duration_sum_ms'] ?? 0)),
            'total_requests' => $requests,
        ];
    }

    /** @return array<int, int> */
    private function redisHistogram(array $values, string $prefix): array
    {
        $histogram = [];

        foreach ($values as $field => $value) {
            if (is_string($field) && str_starts_with($field, $prefix)) {
                $histogram[(int) substr($field, strlen($prefix))] = max(0, (int) $value);
            }
        }

        ksort($histogram);

        return $histogram;
    }

    private function requestRedisKey(string $scope, CarbonImmutable $minute): string
    {
        return $this->redisPrefix().':http:'.$minute->format('YmdHi').':'.$scope;
    }

    private function queueRedisKey(
        string $connection,
        string $queue,
        CarbonImmutable $minute,
    ): string {
        return $this->redisPrefix().':queue:'.$minute->format('YmdHi').':'.substr(
            hash('sha256', $connection."\0".$queue),
            0,
            20,
        );
    }

    private function redisPrefix(): string
    {
        $prefix = trim((string) config('performance.redis_prefix', 'performance:v1'), ':');

        return preg_match('/^[a-zA-Z0-9_.:-]{1,80}$/', $prefix) === 1
            ? $prefix
            : 'performance:v1';
    }

    private function redisTtlSeconds(): int
    {
        return (max(24, (int) config('performance.retention_hours', 168)) * 3_600)
            + 3_600;
    }

    private function pruneTable(
        string $table,
        CarbonImmutable $cutoff,
        int $limit,
    ): int {
        $ids = $this->database()->table($table)
            ->where('bucket_started_at', '<', $cutoff)
            ->orderBy('bucket_started_at')
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id');

        return $ids->isEmpty()
            ? 0
            : $this->database()->table($table)->whereIn('id', $ids)->delete();
    }

    private function latencyUpperBound(int $durationMs): int
    {
        foreach ((array) config('performance.latency_buckets_ms', []) as $bound) {
            if (is_numeric($bound) && $durationMs <= (int) $bound) {
                return (int) $bound;
            }
        }

        return max(30_000, (int) config('performance.maximum_duration_ms', 300_000));
    }

    private function duration(int $durationMs): int
    {
        return min(
            max(30_000, (int) config('performance.maximum_duration_ms', 300_000)),
            max(0, $durationMs),
        );
    }

    private function minute(?CarbonInterface $at): CarbonImmutable
    {
        return CarbonImmutable::instance($at ?? now('UTC'))
            ->utc()
            ->startOfMinute();
    }

    private function windowMinutes(): int
    {
        return min(30, max(1, (int) config('performance.window_minutes', 5)));
    }

    private function database(): ConnectionInterface
    {
        $connection = config('performance.database_connection');

        return is_string($connection) && trim($connection) !== ''
            ? DB::connection($connection)
            : DB::connection();
    }

    private function assertIdentifier(string $value): void
    {
        if (preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/', $value) !== 1) {
            throw new InvalidArgumentException('Invalid queue metric identifier.');
        }
    }
}
