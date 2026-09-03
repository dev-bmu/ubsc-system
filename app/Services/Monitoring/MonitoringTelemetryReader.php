<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Models\MonitoringIncident;
use App\Models\User;
use App\Support\AdminAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class MonitoringTelemetryReader
{
    /** @return array<string, mixed> */
    public function queue(): array
    {
        return $this->queueFor(
            connection: (string) config('monitoring.queue.connection', 'database'),
            queue: (string) config('monitoring.queue.queue', 'default'),
        );
    }

    /**
     * Read one explicitly named queue without issuing an unbounded count.
     *
     * @param  array{warning_depth?: int, outage_depth?: int, warning_age_seconds?: int, outage_age_seconds?: int}  $thresholds
     * @return array<string, mixed>
     */
    public function queueFor(
        string $connection,
        string $queue,
        array $thresholds = [],
        ?int $sampleLimit = null,
    ): array {
        $connection = trim($connection);
        $queue = trim($queue);
        $sampleLimit = min(5_000, max(
            10,
            $sampleLimit ?? (int) config('monitoring.limits.queue_sample_size', 1_000),
        ));
        $failedLimit = (int) config('monitoring.limits.failed_job_sample_size', 500);
        $limits = $this->queueThresholds($thresholds);
        $worker = $this->heartbeat(
            MonitoringHeartbeatRecorder::queueKey($connection, $queue),
        );
        $workerStatus = $this->freshnessStatus(
            $worker,
            $limits['warning_age_seconds'],
            $limits['outage_age_seconds'],
        );

        $base = [
            'connection' => $connection,
            'queue' => $queue,
            'adapter_status' => 'unavailable',
            'status' => $workerStatus->value,
            'sample_limit' => $sampleLimit,
            'depth' => null,
            'depth_is_capped' => false,
            'reserved' => null,
            'available' => null,
            'delayed' => null,
            'oldest_age_seconds' => null,
            'failed_recent' => null,
            'failed_recent_is_capped' => false,
            'worker_last_seen_at' => $worker?->observed_at?->toIso8601String(),
            'worker_lag_seconds' => $this->lagSeconds($worker?->observed_at),
            'message' => null,
        ];

        $queueDefinition = config('queue.connections.'.$connection);

        if (! is_array($queueDefinition)
            || (string) ($queueDefinition['driver'] ?? '') !== 'database') {
            return [
                ...$base,
                'message' => 'Queue depth adapter is not configured for this connection.',
            ];
        }

        try {
            $table = (string) ($queueDefinition['table'] ?? 'jobs');
            $databaseConnection = $queueDefinition['connection'] ?? null;
            $database = is_string($databaseConnection) && $databaseConnection !== ''
                ? DB::connection($databaseConnection)
                : DB::connection();

            if (! $database->getSchemaBuilder()->hasTable($table)) {
                return [
                    ...$base,
                    'status' => MonitoringStatus::Unknown->value,
                    'message' => 'Queue storage is not available.',
                ];
            }

            $rows = $database->table($table)
                ->where('queue', $queue)
                ->orderBy('id')
                ->limit($sampleLimit + 1)
                ->get(['id', 'reserved_at', 'available_at', 'created_at']);
            $depthIsCapped = $rows->count() > $sampleLimit;
            $sample = $rows->take($sampleLimit);
            $now = now()->getTimestamp();
            $depth = $sample->count();
            $reserved = $sample->whereNotNull('reserved_at')->count();
            $delayed = $sample->filter(
                static fn (object $job): bool => $job->reserved_at === null
                    && (int) $job->available_at > $now,
            )->count();
            $available = max(0, $depth - $reserved - $delayed);
            $oldestCreatedAt = $sample->min(
                static fn (object $job): int => (int) $job->created_at,
            );
            $oldestAge = $oldestCreatedAt === null
                ? null
                : max(0, $now - (int) $oldestCreatedAt);
            $failed = $this->failedJobs($connection, $queue, $failedLimit);
            $status = $this->queueStatus(
                $workerStatus,
                $depth,
                $oldestAge,
                $limits,
            );

            return [
                ...$base,
                'adapter_status' => 'configured',
                'status' => $status->value,
                'depth' => $depth,
                'depth_is_capped' => $depthIsCapped,
                'reserved' => $reserved,
                'available' => $available,
                'delayed' => $delayed,
                'oldest_age_seconds' => $oldestAge,
                'failed_recent' => $failed['value'],
                'failed_recent_is_capped' => $failed['is_capped'],
                'message' => $this->queueMessage(
                    workerStatus: $workerStatus,
                    depth: $depth,
                    depthIsCapped: $depthIsCapped,
                    oldestAge: $oldestAge,
                    thresholds: $limits,
                ),
            ];
        } catch (Throwable) {
            return [
                ...$base,
                'status' => MonitoringStatus::Unknown->value,
                'message' => 'Queue telemetry could not be collected.',
            ];
        }
    }

    /** @return array<string, mixed> */
    public function scheduler(): array
    {
        $expected = (int) config('monitoring.scheduler.expected_interval_seconds', 60);
        $heartbeat = $this->heartbeat(
            (string) config('monitoring.scheduler.heartbeat_key', 'scheduler'),
        );
        $status = $this->freshnessStatus(
            $heartbeat,
            (int) config('monitoring.scheduler.warning_after_seconds', 150),
            (int) config('monitoring.scheduler.outage_after_seconds', 300),
        );

        return [
            'last_seen_at' => $heartbeat?->observed_at?->toIso8601String(),
            'lag_seconds' => $this->lagSeconds($heartbeat?->observed_at),
            'expected_interval_seconds' => $expected,
            'status' => $status->value,
        ];
    }

    /** @return array<string, mixed> */
    public function usage(): array
    {
        $minutes = (int) config('monitoring.usage_window_minutes', 1_440);
        $cutoff = now()->subMinutes($minutes);
        $limit = (int) config('monitoring.limits.usage_sample_size', 1_000);

        return [
            'window_minutes' => $minutes,
            'bookings_created' => $this->boundedRecentCount(
                'bookings',
                $limit,
                static fn (QueryBuilder $query) => $query->where('created_at', '>=', $cutoff),
            ),
            'memberships_created' => $this->boundedRecentCount(
                'memberships',
                $limit,
                static fn (QueryBuilder $query) => $query->where('created_at', '>=', $cutoff),
            ),
            'payments_paid' => $this->boundedRecentCount(
                'transactions',
                $limit,
                static fn (QueryBuilder $query) => $query
                    ->where('payment_status', 'PAID')
                    ->where('paid_at', '>=', $cutoff),
            ),
        ];
    }

    /** @return array<string, mixed> */
    public function security(): array
    {
        $limit = (int) config('monitoring.limits.security_sample_size', 250);

        try {
            if (! Schema::hasTable('users')
                || ! Schema::hasTable('admin_mfa_settings')
                || ! Schema::hasTable((string) config('permission.table_names.roles', 'roles'))) {
                throw new \RuntimeException('Security posture tables are unavailable.');
            }

            $staff = User::query()
                ->whereHas('roles', static function (Builder $query): void {
                    $query->whereIn('name', AdminAccess::STAFF_ROLES);
                })
                ->with(['adminMfaSetting:id,user_id,enabled_at,recovery_codes_acknowledged_at'])
                ->orderBy('id')
                ->limit($limit + 1)
                ->get(['id']);
            $isCapped = $staff->count() > $limit;
            $sample = $staff->take($limit);
            $enabled = $sample->filter(static function (User $user): bool {
                $setting = $user->adminMfaSetting;

                return $setting !== null
                    && $setting->enabled_at !== null
                    && $setting->recovery_codes_acknowledged_at !== null;
            })->count();
            $hasGap = $enabled < $sample->count();

            return [
                'status' => $hasGap
                    ? MonitoringStatus::Degraded->value
                    : MonitoringStatus::Unknown->value,
                'telemetry_configured' => false,
                'posture' => [
                    'staff_accounts' => $sample->count(),
                    'mfa_enabled' => $enabled,
                    'is_capped' => $isCapped,
                    'sample_limit' => $limit,
                ],
                'recent_events' => [
                    'count' => null,
                    'is_capped' => false,
                    'items' => [],
                    'message' => 'Centralized security event telemetry is not configured.',
                ],
            ];
        } catch (Throwable) {
            return [
                'status' => MonitoringStatus::Unknown->value,
                'telemetry_configured' => false,
                'posture' => [
                    'staff_accounts' => 0,
                    'mfa_enabled' => 0,
                    'is_capped' => false,
                    'sample_limit' => $limit,
                ],
                'recent_events' => [
                    'count' => null,
                    'is_capped' => false,
                    'items' => [],
                    'message' => 'Security posture and event telemetry could not be collected.',
                ],
            ];
        }
    }

    /** @return array<string, mixed> */
    public function incidents(): array
    {
        $limit = (int) config('monitoring.limits.incident_limit', 25);

        try {
            if (! Schema::hasTable('monitoring_incidents')) {
                throw new \RuntimeException('Incident table is unavailable.');
            }

            $activeIds = MonitoringIncident::query()
                ->whereIn('status', MonitoringIncident::ACTIVE_STATUSES)
                ->orderByDesc('id')
                ->limit($limit + 1)
                ->pluck('id');
            $isCapped = $activeIds->count() > $limit;
            $items = collect();

            foreach (MonitoringIncident::SEVERITIES as $severity) {
                $remaining = $limit - $items->count();

                if ($remaining <= 0) {
                    break;
                }

                $items = $items->concat(
                    MonitoringIncident::query()
                        ->whereIn('status', MonitoringIncident::ACTIVE_STATUSES)
                        ->where('severity', $severity)
                        ->orderByDesc('last_observed_at')
                        ->limit($remaining)
                        ->get(),
                );
            }

            return [
                'limit' => $limit,
                'active_count' => min($activeIds->count(), $limit),
                'active_count_is_capped' => $isCapped,
                'highest_severity' => $items->first()?->severity,
                'items' => $items->map(static fn (MonitoringIncident $incident): array => [
                    'public_id' => $incident->public_id,
                    'title' => $incident->title,
                    'summary' => $incident->summary,
                    'severity' => $incident->severity,
                    'status' => $incident->status,
                    'started_at' => $incident->started_at->toIso8601String(),
                    'acknowledged_at' => $incident->acknowledged_at?->toIso8601String(),
                    'updated_at' => $incident->updated_at?->toIso8601String(),
                ])->values()->all(),
            ];
        } catch (Throwable) {
            return [
                'limit' => $limit,
                'active_count' => 0,
                'active_count_is_capped' => false,
                'highest_severity' => null,
                'items' => [],
            ];
        }
    }

    private function heartbeat(string $key): ?MonitoringHeartbeat
    {
        try {
            if (! Schema::hasTable('monitoring_heartbeats')) {
                return null;
            }

            return MonitoringHeartbeat::query()->find($key);
        } catch (Throwable) {
            return null;
        }
    }

    private function freshnessStatus(
        ?MonitoringHeartbeat $heartbeat,
        int $warningAfter,
        int $outageAfter,
    ): MonitoringStatus {
        if ($heartbeat === null || $heartbeat->observed_at === null) {
            return MonitoringStatus::Unknown;
        }

        $recorded = MonitoringStatus::tryFrom((string) $heartbeat->status)
            ?? MonitoringStatus::Unknown;

        if (in_array($recorded, [MonitoringStatus::Outage, MonitoringStatus::Degraded], true)) {
            return $recorded;
        }

        $lag = $this->lagSeconds($heartbeat->observed_at) ?? PHP_INT_MAX;

        return match (true) {
            $lag >= $outageAfter => MonitoringStatus::Outage,
            $lag >= $warningAfter => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
    }

    private function queueStatus(
        MonitoringStatus $workerStatus,
        int $depth,
        ?int $oldestAge,
        array $thresholds,
    ): MonitoringStatus {
        $statuses = [$workerStatus];
        $warningDepth = $thresholds['warning_depth'];
        $outageDepth = $thresholds['outage_depth'];
        $warningAge = $thresholds['warning_age_seconds'];
        $outageAge = $thresholds['outage_age_seconds'];

        $statuses[] = match (true) {
            $depth >= $outageDepth => MonitoringStatus::Outage,
            $depth >= $warningDepth => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $statuses[] = match (true) {
            $oldestAge !== null && $oldestAge >= $outageAge => MonitoringStatus::Outage,
            $oldestAge !== null && $oldestAge >= $warningAge => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return MonitoringStatus::worst($statuses);
    }

    private function queueMessage(
        MonitoringStatus $workerStatus,
        int $depth,
        bool $depthIsCapped,
        ?int $oldestAge,
        array $thresholds,
    ): ?string {
        $messages = [];
        $warningDepth = $thresholds['warning_depth'];
        $outageDepth = $thresholds['outage_depth'];
        $warningAge = $thresholds['warning_age_seconds'];
        $outageAge = $thresholds['outage_age_seconds'];

        $workerMessage = match ($workerStatus) {
            MonitoringStatus::Unknown => 'Queue worker heartbeat has not been observed.',
            MonitoringStatus::Degraded => 'Queue worker heartbeat exceeded the warning threshold.',
            MonitoringStatus::Outage => 'Queue worker heartbeat exceeded the outage threshold.',
            default => null,
        };

        if ($workerMessage !== null) {
            $messages[] = $workerMessage;
        }

        if ($depthIsCapped) {
            $messages[] = 'Queue depth exceeds the bounded sample limit.';
        } elseif ($depth >= $outageDepth) {
            $messages[] = 'Queue depth exceeded the outage threshold.';
        } elseif ($depth >= $warningDepth) {
            $messages[] = 'Queue depth exceeded the warning threshold.';
        }

        if ($oldestAge !== null && $oldestAge >= $outageAge) {
            $messages[] = 'The oldest queued job exceeded the outage age threshold.';
        } elseif ($oldestAge !== null && $oldestAge >= $warningAge) {
            $messages[] = 'The oldest queued job exceeded the warning age threshold.';
        }

        return $messages === [] ? null : implode(' ', $messages);
    }

    /**
     * @param  array{warning_depth?: int, outage_depth?: int, warning_age_seconds?: int, outage_age_seconds?: int}  $thresholds
     * @return array{warning_depth: int, outage_depth: int, warning_age_seconds: int, outage_age_seconds: int}
     */
    private function queueThresholds(array $thresholds): array
    {
        $warningDepth = max(1, (int) ($thresholds['warning_depth']
            ?? config('monitoring.queue.warning_depth', 100)));
        $warningAge = max(30, (int) ($thresholds['warning_age_seconds']
            ?? config('monitoring.queue.warning_after_seconds', 180)));

        return [
            'warning_depth' => $warningDepth,
            'outage_depth' => max(
                $warningDepth + 1,
                (int) ($thresholds['outage_depth']
                    ?? config('monitoring.queue.outage_depth', 500)),
            ),
            'warning_age_seconds' => $warningAge,
            'outage_age_seconds' => max(
                $warningAge + 30,
                (int) ($thresholds['outage_age_seconds']
                    ?? config('monitoring.queue.outage_after_seconds', 600)),
            ),
        ];
    }

    /** @return array{value: int|null, is_capped: bool} */
    private function failedJobs(string $connection, string $queue, int $limit): array
    {
        try {
            $table = (string) config('queue.failed.table', 'failed_jobs');
            $failedConnection = config('queue.failed.database');
            $database = is_string($failedConnection) && $failedConnection !== ''
                ? DB::connection($failedConnection)
                : DB::connection();

            if (! $database->getSchemaBuilder()->hasTable($table)) {
                return ['value' => null, 'is_capped' => false];
            }

            $rows = $database->table($table)
                ->where('connection', $connection)
                ->where('queue', $queue)
                ->where('failed_at', '>=', now()->subDay())
                ->orderByDesc('id')
                ->limit($limit + 1)
                ->get(['id']);

            return [
                'value' => min($rows->count(), $limit),
                'is_capped' => $rows->count() > $limit,
            ];
        } catch (Throwable) {
            return ['value' => null, 'is_capped' => false];
        }
    }

    /**
     * @param  callable(QueryBuilder): mixed  $scope
     * @return array{value: int|null, is_capped: bool, sample_limit: int}
     */
    private function boundedRecentCount(
        string $table,
        int $limit,
        callable $scope,
    ): array {
        try {
            if (! in_array($table, ['bookings', 'memberships', 'transactions'], true)
                || ! Schema::hasTable($table)) {
                throw new \RuntimeException('Usage table is unavailable.');
            }

            $query = DB::table($table);
            $scope($query);
            $rows = $query
                ->orderByDesc('id')
                ->limit($limit + 1)
                ->pluck('id');

            return [
                'value' => min($rows->count(), $limit),
                'is_capped' => $rows->count() > $limit,
                'sample_limit' => $limit,
            ];
        } catch (Throwable) {
            return [
                'value' => null,
                'is_capped' => false,
                'sample_limit' => $limit,
            ];
        }
    }

    private function lagSeconds(mixed $observedAt): ?int
    {
        if ($observedAt === null) {
            return null;
        }

        return max(0, (int) CarbonImmutable::parse($observedAt)->diffInSeconds(now()));
    }
}
