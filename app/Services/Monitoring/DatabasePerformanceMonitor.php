<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Throwable;

final class DatabasePerformanceMonitor
{
    private const HEARTBEAT_KEY = 'performance-database-counters';

    public function __construct(
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $connection = $this->connection();
        $driver = strtolower($connection->getDriverName());

        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return $this->unknown(
                $driver,
                'Detailed database capacity counters require MySQL or MariaDB.',
            );
        }

        try {
            $status = $this->variables($connection, 'GLOBAL STATUS', [
                'Threads_connected',
                'Threads_running',
                'Slow_queries',
                'Innodb_row_lock_current_waits',
                'Innodb_row_lock_waits',
                'Innodb_row_lock_time',
                'Innodb_buffer_pool_read_requests',
                'Innodb_buffer_pool_reads',
                'Questions',
                'Uptime',
            ]);
            $configuration = $this->variables($connection, 'GLOBAL VARIABLES', [
                'max_connections',
            ]);
            $now = CarbonImmutable::now('UTC');
            $previous = $this->previous();
            $elapsed = $previous?->observed_at === null
                ? null
                : max(1, (int) $previous->observed_at->diffInSeconds($now));
            $previousContext = (array) ($previous?->context ?? []);
            $threadsConnected = $this->integer($status, 'Threads_connected');
            $threadsRunning = $this->integer($status, 'Threads_running');
            $maxConnections = max(0, $this->integer($configuration, 'max_connections'));
            $connectionUtilization = $maxConnections > 0
                ? round(($threadsConnected / $maxConnections) * 100, 2)
                : null;
            $slowPerMinute = $this->rate(
                $this->integer($status, 'Slow_queries'),
                $previousContext['slow_queries'] ?? null,
                $elapsed,
                60,
            );
            $lockWaitsPerMinute = $this->rate(
                $this->integer($status, 'Innodb_row_lock_waits'),
                $previousContext['row_lock_waits'] ?? null,
                $elapsed,
                60,
            );
            $queriesPerSecond = $this->rate(
                $this->integer($status, 'Questions'),
                $previousContext['questions'] ?? null,
                $elapsed,
            );
            $bufferPoolHitPercent = $this->bufferPoolHitPercent(
                $status,
                $previousContext,
            );
            $currentLockWaits = $this->integer($status, 'Innodb_row_lock_current_waits');
            $metricStatus = $this->status(
                $connectionUtilization,
                $currentLockWaits,
                $slowPerMinute,
            );

            $context = [
                'slow_queries' => $this->integer($status, 'Slow_queries'),
                'row_lock_waits' => $this->integer($status, 'Innodb_row_lock_waits'),
                'row_lock_time_ms' => $this->integer($status, 'Innodb_row_lock_time'),
                'buffer_reads' => $this->integer($status, 'Innodb_buffer_pool_reads'),
                'buffer_read_requests' => $this->integer($status, 'Innodb_buffer_pool_read_requests'),
                'questions' => $this->integer($status, 'Questions'),
                'uptime_seconds' => $this->integer($status, 'Uptime'),
            ];

            try {
                $this->heartbeats->record(
                    key: self::HEARTBEAT_KEY,
                    category: 'performance',
                    status: $metricStatus,
                    message: 'Sanitized monotonic database capacity counters.',
                    context: $context,
                );
            } catch (Throwable) {
                // Current counters remain useful when historical baseline
                // persistence is temporarily unavailable.
            }

            return [
                'supported' => true,
                'driver' => $driver,
                'status' => $metricStatus->value,
                'sample_status' => $elapsed === null ? 'collecting' : 'ready',
                'sample_interval_seconds' => $elapsed,
                'connections' => [
                    'active' => $threadsConnected,
                    'running' => $threadsRunning,
                    'maximum' => $maxConnections > 0 ? $maxConnections : null,
                    'utilization_percent' => $connectionUtilization,
                ],
                'queries_per_second' => $queriesPerSecond,
                'slow_queries_per_minute' => $slowPerMinute,
                'lock_waits_current' => $currentLockWaits,
                'lock_waits_per_minute' => $lockWaitsPerMinute,
                'buffer_pool_hit_percent' => $bufferPoolHitPercent,
                'uptime_seconds' => $this->integer($status, 'Uptime'),
                'message' => $elapsed === null
                    ? 'Counter baseline recorded; rates become available on the next collection.'
                    : null,
            ];
        } catch (Throwable) {
            return $this->unknown(
                $driver,
                'Database capacity counters could not be read with the current database privileges.',
            );
        }
    }

    private function connection(): ConnectionInterface
    {
        $configured = config('performance.database_connection');

        return is_string($configured) && trim($configured) !== ''
            ? DB::connection($configured)
            : DB::connection();
    }

    /**
     * @param  list<string>  $names
     * @return array<string, int|string>
     */
    private function variables(
        ConnectionInterface $connection,
        string $kind,
        array $names,
    ): array {
        $quoted = implode(', ', array_map(
            static fn (string $name): string => "'".str_replace("'", "''", $name)."'",
            $names,
        ));
        $rows = $connection->select(
            "SHOW {$kind} WHERE Variable_name IN ({$quoted})",
        );
        $values = [];

        foreach ($rows as $row) {
            $data = array_change_key_case((array) $row, CASE_LOWER);
            $name = (string) ($data['variable_name'] ?? '');

            if ($name !== '') {
                $values[$name] = $data['value'] ?? 0;
            }
        }

        return $values;
    }

    private function previous(): ?MonitoringHeartbeat
    {
        try {
            return MonitoringHeartbeat::query()->find(self::HEARTBEAT_KEY);
        } catch (Throwable) {
            return null;
        }
    }

    /** @param array<string, int|string> $values */
    private function integer(array $values, string $key): int
    {
        foreach ($values as $name => $value) {
            if (strcasecmp($name, $key) === 0) {
                return max(0, (int) $value);
            }
        }

        return 0;
    }

    private function rate(
        int $current,
        mixed $previous,
        ?int $elapsedSeconds,
        int $periodSeconds = 1,
    ): ?float {
        if ($elapsedSeconds === null || ! is_numeric($previous) || $current < (int) $previous) {
            return null;
        }

        return round((($current - (int) $previous) / $elapsedSeconds) * $periodSeconds, 3);
    }

    /**
     * @param  array<string, int|string>  $status
     * @param  array<string, mixed>  $previous
     */
    private function bufferPoolHitPercent(array $status, array $previous): ?float
    {
        $reads = $this->integer($status, 'Innodb_buffer_pool_reads');
        $requests = $this->integer($status, 'Innodb_buffer_pool_read_requests');
        $previousReads = $previous['buffer_reads'] ?? null;
        $previousRequests = $previous['buffer_read_requests'] ?? null;

        if (! is_numeric($previousReads)
            || ! is_numeric($previousRequests)
            || $reads < (int) $previousReads
            || $requests < (int) $previousRequests) {
            return null;
        }

        $readDelta = $reads - (int) $previousReads;
        $requestDelta = $requests - (int) $previousRequests;

        return $requestDelta > 0
            ? round(max(0, 1 - ($readDelta / $requestDelta)) * 100, 3)
            : null;
    }

    private function status(
        ?float $connectionUtilization,
        int $currentLockWaits,
        ?float $slowPerMinute,
    ): MonitoringStatus {
        $statuses = [MonitoringStatus::Operational];
        $warningConnections = (float) config('performance.database.connection_warning_percent', 70);
        $outageConnections = (float) config('performance.database.connection_outage_percent', 90);
        $warningLocks = (int) config('performance.database.lock_wait_warning', 1);
        $outageLocks = (int) config('performance.database.lock_wait_outage', 5);
        $warningSlow = (float) config('performance.database.slow_query_warning_per_minute', 1);
        $outageSlow = (float) config('performance.database.slow_query_outage_per_minute', 10);

        if ($connectionUtilization !== null) {
            $statuses[] = match (true) {
                $connectionUtilization >= $outageConnections => MonitoringStatus::Outage,
                $connectionUtilization >= $warningConnections => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };
        }

        $statuses[] = match (true) {
            $currentLockWaits >= $outageLocks => MonitoringStatus::Outage,
            $currentLockWaits >= $warningLocks => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        if ($slowPerMinute !== null) {
            $statuses[] = match (true) {
                $slowPerMinute >= $outageSlow => MonitoringStatus::Outage,
                $slowPerMinute >= $warningSlow => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };
        }

        return MonitoringStatus::worst($statuses);
    }

    /** @return array<string, mixed> */
    private function unknown(string $driver, string $message): array
    {
        return [
            'supported' => false,
            'driver' => $driver,
            'status' => MonitoringStatus::Unknown->value,
            'sample_status' => 'unavailable',
            'sample_interval_seconds' => null,
            'connections' => [
                'active' => null,
                'running' => null,
                'maximum' => null,
                'utilization_percent' => null,
            ],
            'queries_per_second' => null,
            'slow_queries_per_minute' => null,
            'lock_waits_current' => null,
            'lock_waits_per_minute' => null,
            'buffer_pool_hit_percent' => null,
            'uptime_seconds' => null,
            'message' => $message,
        ];
    }
}
