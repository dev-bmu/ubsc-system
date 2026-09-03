<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringSnapshot;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Throwable;

class MonitoringSnapshotService
{
    public const CACHE_KEY = 'monitoring:cockpit:current:v1';

    public function __construct(
        private readonly ExternalAvailabilityConfiguration $externalAvailability,
        private readonly BackgroundQueueRegistry $queues,
    ) {}

    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $ttl = (int) config('monitoring.snapshot_cache_seconds', 15);

        try {
            $snapshot = Cache::remember(
                self::CACHE_KEY,
                now()->addSeconds($ttl),
                fn (): array => $this->load(),
            );
        } catch (Throwable) {
            $snapshot = $this->load();
        }

        return $this->withFreshness($this->withCapacityCoverage($snapshot));
    }

    /** @return array<string, mixed> */
    private function load(): array
    {
        try {
            $record = MonitoringSnapshot::query()->find('current');

            if ($record !== null
                && is_array($record->payload)
                && ($record->payload['schema_version'] ?? null) === 1
                && is_array($record->payload['overall'] ?? null)
                && is_array($record->payload['services'] ?? null)) {
                return $record->payload;
            }
        } catch (Throwable) {
            // Return an explicit unknown snapshot. The cockpit must remain
            // honest when its own read model is unavailable.
        }

        return $this->emptySnapshot();
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function withFreshness(array $snapshot): array
    {
        $servedAt = now();
        $generatedAt = null;

        try {
            if (is_string($snapshot['generated_at'] ?? null)
                && trim((string) $snapshot['generated_at']) !== '') {
                $generatedAt = CarbonImmutable::parse($snapshot['generated_at']);
            }
        } catch (Throwable) {
            // A malformed persisted timestamp is treated as stale telemetry,
            // never as a reason for the protected cockpit endpoint to fail.
        }
        $age = $generatedAt === null
            ? null
            : max(0, (int) $generatedAt->diffInSeconds($servedAt));
        $staleAfter = (int) config('monitoring.snapshot_stale_after_seconds', 180);
        $isStale = $age === null || $age >= $staleAfter;
        $collectorStatus = $isStale
            ? ($generatedAt === null ? MonitoringStatus::Unknown : MonitoringStatus::Degraded)
            : MonitoringStatus::Operational;
        $services = collect((array) ($snapshot['services'] ?? []))
            ->filter(static fn (mixed $service): bool => is_array($service))
            ->reject(static fn (array $service): bool => ($service['key'] ?? null) === 'monitoring-collector')
            ->values();
        $services->push([
            'key' => 'monitoring-collector',
            'name' => 'Monitoring collector',
            'category' => 'scheduler',
            'status' => $collectorStatus->value,
            'observed_at' => $generatedAt?->toIso8601String(),
            'latency_ms' => $snapshot['collection_duration_ms'] ?? null,
            'message' => $isStale ? 'Monitoring snapshot is missing or stale.' : null,
        ]);
        $currentOverall = MonitoringStatus::tryFrom((string) data_get(
            $snapshot,
            'overall.status',
            MonitoringStatus::Unknown->value,
        )) ?? MonitoringStatus::Unknown;

        if (! is_array($snapshot['overall'] ?? null)) {
            $snapshot['overall'] = [
                'active_incidents' => 0,
                'highest_severity' => null,
            ];
        }

        $snapshot['served_at'] = $servedAt->toIso8601String();
        $snapshot['snapshot_age_seconds'] = $age;
        $snapshot['snapshot_stale'] = $isStale;
        $snapshot['topology'] = (string) config('production.topology', '');
        $snapshot['services'] = $services->all();
        $snapshot['overall']['status'] = MonitoringStatus::worst([
            $currentOverall,
            $collectorStatus,
        ])->value;

        return $snapshot;
    }

    /** @return array<string, mixed> */
    private function emptySnapshot(): array
    {
        $unknown = MonitoringStatus::Unknown->value;

        return [
            'schema_version' => 1,
            'generated_at' => null,
            'served_at' => null,
            'snapshot_age_seconds' => null,
            'snapshot_stale' => true,
            'cache_ttl_seconds' => (int) config('monitoring.snapshot_cache_seconds', 15),
            'collection_duration_ms' => null,
            'environment' => (string) config('app.env', 'production'),
            'topology' => (string) config('production.topology', ''),
            'release' => config('monitoring.release'),
            'overall' => [
                'status' => $unknown,
                'active_incidents' => 0,
                'highest_severity' => null,
            ],
            'services' => [],
            'availability' => $this->externalAvailability->summary(),
            'performance' => [
                'status' => $unknown,
                'window_minutes' => (int) config('performance.window_minutes', 5),
                'minimum_samples' => (int) config('performance.minimum_samples', 20),
                'driver' => (string) config('performance.driver', 'database'),
                'http' => [
                    'status' => $unknown,
                    'sample_status' => 'unavailable',
                    'request_count' => 0,
                    'error_count' => 0,
                    'requests_per_minute' => 0,
                    'requests_per_second' => 0,
                    'average_ms' => null,
                    'p50_ms' => null,
                    'p95_ms' => null,
                    'p99_ms' => null,
                    'error_rate_percent' => null,
                    'capacity' => [
                        'status' => $unknown,
                        'tested_requests_per_second' => null,
                        'utilization_percent' => null,
                        'headroom_requests_per_second' => null,
                        'message' => 'No capacity baseline is available.',
                    ],
                    'scopes' => [],
                    'message' => 'Monitoring snapshot has not been collected.',
                ],
                'queues' => [
                    'status' => $unknown,
                    'sample_status' => 'unavailable',
                    'processed_count' => 0,
                    'failed_count' => 0,
                    'jobs_per_minute' => 0,
                    'average_wait_ms' => null,
                    'p50_wait_ms' => null,
                    'p95_wait_ms' => null,
                    'p99_wait_ms' => null,
                    'average_runtime_ms' => null,
                    'p50_runtime_ms' => null,
                    'p95_runtime_ms' => null,
                    'p99_runtime_ms' => null,
                    'error_rate_percent' => null,
                    'items' => [],
                    'message' => 'Monitoring snapshot has not been collected.',
                ],
                'database' => [
                    'supported' => false,
                    'driver' => (string) config('database.default'),
                    'status' => $unknown,
                    'sample_status' => 'unavailable',
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
                    'message' => 'Monitoring snapshot has not been collected.',
                ],
                'signals' => [],
            ],
            'capacity' => $this->emptyCapacity($unknown),
            'resilience' => [
                'configured' => (bool) config('resilience_drills.enabled', false)
                    || (bool) config('resilience_drills.enforce', false),
                'enabled' => (bool) config('resilience_drills.enabled', false),
                'enforced' => (bool) config('resilience_drills.enforce', false),
                'status' => $unknown,
                'target_environment' => (string) config(
                    'resilience_drills.target.environment',
                    '',
                ),
                'provider' => (string) config('resilience_drills.target.provider', ''),
                'orchestrator' => (string) config(
                    'resilience_drills.target.orchestrator',
                    '',
                ),
                'required_scenarios' => array_values((array) config(
                    'resilience_drills.campaign.required_scenarios',
                    [],
                )),
                'campaign' => null,
                'ledger' => null,
                'message' => 'Resilience drill telemetry is unavailable.',
            ],
            'integrity' => [
                'available' => false,
                'is_stale' => true,
                'status' => $unknown,
                'source_status' => 'unavailable',
                'generated_at' => null,
                'expires_at' => null,
                'duration_ms' => null,
                'totals' => $this->emptyIntegrityTotals(),
                'domains' => collect(['bookings', 'memberships', 'payments'])
                    ->mapWithKeys(fn (string $domain): array => [
                        $domain => [
                            'status' => $unknown,
                            ...$this->emptyIntegrityTotals(),
                        ],
                    ])
                    ->all(),
                'checks' => [],
                'action_queue' => [],
            ],
            'security' => [
                'status' => $unknown,
                'telemetry_configured' => false,
                'posture' => [
                    'staff_accounts' => 0,
                    'mfa_enabled' => 0,
                    'is_capped' => false,
                    'sample_limit' => (int) config('monitoring.limits.security_sample_size', 250),
                ],
                'recent_events' => [
                    'count' => null,
                    'is_capped' => false,
                    'items' => [],
                    'message' => 'Security event telemetry is unavailable.',
                ],
            ],
            'usage' => [
                'window_minutes' => (int) config('monitoring.usage_window_minutes', 1_440),
                'bookings_created' => $this->emptyCount(),
                'memberships_created' => $this->emptyCount(),
                'payments_paid' => $this->emptyCount(),
            ],
            'queue' => [
                'connection' => (string) config('monitoring.queue.connection', 'database'),
                'queue' => (string) config('monitoring.queue.queue', 'default'),
                'adapter_status' => 'unavailable',
                'status' => $unknown,
                'sample_limit' => (int) config('monitoring.limits.queue_sample_size', 1_000),
                'depth' => null,
                'depth_is_capped' => false,
                'reserved' => null,
                'available' => null,
                'delayed' => null,
                'oldest_age_seconds' => null,
                'failed_recent' => null,
                'failed_recent_is_capped' => false,
                'worker_last_seen_at' => null,
                'worker_lag_seconds' => null,
                'message' => 'Monitoring snapshot has not been collected.',
            ],
            'scheduler' => [
                'last_seen_at' => null,
                'lag_seconds' => null,
                'expected_interval_seconds' => (int) config('monitoring.scheduler.expected_interval_seconds', 60),
                'status' => $unknown,
            ],
            'backup' => [
                'configured' => false,
                'status' => $unknown,
                'storage_available' => null,
                'last_verified_at' => null,
                'last_attempt_at' => null,
                'age_seconds' => null,
                'warning_after_seconds' => (int) config('monitoring.backup.warning_after_seconds', 108_000),
                'outage_after_seconds' => (int) config('monitoring.backup.outage_after_seconds', 172_800),
                'backup_id' => null,
                'size_bytes' => null,
                'immutable_until' => null,
                'object_lock_mode' => null,
                'failure_code' => null,
                'next_due_at' => null,
                'outage_at' => null,
                'message' => 'Verified backup evidence is not configured.',
            ],
            'recovery' => [
                'configured' => false,
                'status' => $unknown,
                'objectives' => [
                    'rpo_seconds' => (int) config('disaster_recovery.objectives.rpo_seconds', 300),
                    'rto_seconds' => (int) config('disaster_recovery.objectives.rto_seconds', 3_600),
                ],
                'target' => [
                    'provider' => '',
                    'dataset_id' => '',
                    'primary_region' => '',
                    'recovery_region' => '',
                    'backup_destination_id' => '',
                    'independent_verifier' => '',
                ],
                'signals' => [],
                'evidence' => [
                    'available' => false,
                    'head_sequence' => null,
                    'head_fingerprint' => null,
                    'latest_verified_backup' => null,
                    'latest_backup_attempt' => null,
                    'latest_restore_drill' => null,
                    'latest_pitr_observation' => null,
                    'items' => [],
                    'message' => 'Recovery evidence storage is unavailable.',
                ],
                'message' => 'Recovery posture telemetry is unavailable.',
            ],
            'replication' => [
                'configured' => false,
                'status' => $unknown,
                'target' => [
                    'provider' => '',
                    'cluster_id' => '',
                    'dataset_id' => '',
                    'environment' => '',
                    'primary_region' => '',
                    'writer_endpoint_id' => '',
                    'reader_endpoint_id' => '',
                    'independent_observer' => '',
                ],
                'policy' => [
                    'mode' => '',
                    'minimum_availability_zones' => 1,
                    'minimum_replicas' => 0,
                    'minimum_synchronous_replicas' => 0,
                    'failover_rto_seconds' => 0,
                    'automatic_failback' => false,
                    'application_replica_reads' => false,
                    'read_after_write_seconds' => 30,
                ],
                'current' => null,
                'signals' => [],
                'ledger' => [
                    'available' => false,
                    'event_count' => null,
                    'head_sequence' => null,
                    'head_fingerprint' => null,
                    'items' => [],
                    'message' => 'Replication event storage is unavailable.',
                ],
                'message' => 'Database replication telemetry is unavailable.',
            ],
            'documents' => [
                'status' => $unknown,
                'prewarm_enabled' => (bool) config('invoice_pdf.prewarm.enabled', false),
                'connection' => (string) (config('invoice_pdf.prewarm.connection')
                    ?: config('background_jobs.connection', 'database')),
                'queue' => (string) config('invoice_pdf.prewarm.queue', 'documents'),
                'disk' => (string) config('invoice_pdf.disk', 'invoice-pdf'),
                'archive_configured' => trim((string) config('invoice_pdf.archive_disk', '')) !== '',
                'template_version' => (string) config('invoice_pdf.template_version'),
                'hot_retention_days' => (int) config('invoice_pdf.lifecycle.hot_retention_days', 90),
                'pending' => null,
                'pending_is_capped' => false,
                'oldest_age_seconds' => null,
                'failed_recent' => null,
                'failed_recent_is_capped' => false,
                'worker_last_seen_at' => null,
                'worker_lag_seconds' => null,
                'renderer_last_seen_at' => null,
                'renderer_last_failure_at' => null,
                'latest_generated_at' => null,
                'latest_size_bytes' => null,
                'latest_render_duration_ms' => null,
                'latest_storage_tier' => null,
                'expired_hot' => null,
                'expired_hot_is_capped' => false,
                'storage_free_bytes' => null,
                'storage_total_bytes' => null,
                'storage_free_percent' => null,
                'message' => 'Invoice document telemetry is unavailable.',
            ],
            'incidents' => [
                'limit' => (int) config('monitoring.limits.incident_limit', 25),
                'active_count' => 0,
                'active_count_is_capped' => false,
                'highest_severity' => null,
                'items' => [],
            ],
            'alerting' => [
                'status' => 'unconfigured',
                'delivery_configured' => false,
                'channels' => [],
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
                'message' => 'Off-host alert delivery and escalation are not configured.',
            ],
            'slos' => [
                'window_days' => (int) config('monitoring.slos.window_days', 28),
                'evaluation_status' => 'unconfigured',
                'items' => [],
            ],
            'history' => [
                'available' => false,
                'bucket_minutes' => 60,
                'retention_days' => (int) config('monitoring.history.retention_days', 90),
                'window_hours' => (int) config('monitoring.history.dashboard_hours', 24),
                'sample_count' => 0,
                'expected_sample_count' => 0,
                'missing_sample_count' => 0,
                'latest_sample_at' => null,
                'points' => [],
            ],
            'observability' => [
                'coverage_status' => 'unavailable',
                'configured_signals' => [],
                'missing_signals' => [
                    'internal_snapshot',
                    'external_availability',
                    'http_request_metrics',
                    'distributed_traces',
                    'browser_rum',
                    'centralized_security_events',
                    'historical_slo_series',
                ],
            ],
            'limits' => [
                'queue_sample_size' => (int) config('monitoring.limits.queue_sample_size', 1_000),
                'failed_job_sample_size' => (int) config('monitoring.limits.failed_job_sample_size', 500),
                'usage_sample_size' => (int) config('monitoring.limits.usage_sample_size', 1_000),
                'incident_limit' => (int) config('monitoring.limits.incident_limit', 25),
            ],
        ];
    }

    /** @return array{value: null, is_capped: false, sample_limit: int} */
    private function emptyCount(): array
    {
        return [
            'value' => null,
            'is_capped' => false,
            'sample_limit' => (int) config('monitoring.limits.usage_sample_size', 1_000),
        ];
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function withCapacityCoverage(array $snapshot): array
    {
        $current = is_array($snapshot['capacity'] ?? null) ? $snapshot['capacity'] : [];
        if (isset($current['target_coverage']) && ! is_array($current['target_coverage'])) {
            unset($current['target_coverage']);
        }
        $snapshot['capacity'] = array_replace_recursive(
            $this->emptyCapacity(MonitoringStatus::Unknown->value),
            $current,
        );

        return $snapshot;
    }

    /** @return array<string, mixed> */
    private function emptyCapacity(string $unknown): array
    {
        $targets = ['web', ...$this->queues->capacityTargetKeys()];
        $requiredScopes = array_values((array) config('capacity_planning.evidence.required_scopes', []));

        return [
            'status' => $unknown,
            'enabled' => (bool) config('capacity_planning.enabled', false),
            'enforced' => (bool) config('capacity_planning.enforce', false),
            'mode' => (string) config('capacity_planning.mode', 'advisory'),
            'provider' => (string) config('capacity_planning.platform.provider', ''),
            'infrastructure_profile' => (string) config('capacity_planning.infrastructure_profile', ''),
            'evidence' => null,
            'evidence_coverage' => [
                'required' => count($requiredScopes),
                'verified' => 0,
                'missing_scopes' => $requiredScopes,
            ],
            'observation' => null,
            'target_coverage' => [
                'required' => count($targets),
                'reported' => 0,
                'missing_targets' => $targets,
                'required_observer_cycles' => (int) config('capacity_planning.platform.minimum_live_observations', 2),
                'verified_observer_cycles' => 0,
                'minimum_observer_spacing_seconds' => (int) config('capacity_planning.platform.minimum_observation_spacing_seconds', 15),
                'maximum_observer_spacing_seconds' => (int) config('capacity_planning.platform.maximum_observation_spacing_seconds', 75),
            ],
            'plan' => null,
            'policy' => [
                'web_minimum_instances' => (int) config('capacity_planning.web.minimum_instances', 2),
                'web_maximum_instances' => (int) config('capacity_planning.web.maximum_instances', 20),
                'scale_up_threshold_percent' => (int) config('capacity_planning.plan.scale_up_threshold_percent', 65),
                'scale_down_threshold_percent' => (int) config('capacity_planning.plan.scale_down_threshold_percent', 35),
                'scale_down_stabilization_seconds' => (int) config('capacity_planning.plan.scale_down_stabilization_seconds', 900),
            ],
            'message' => 'Capacity control-plane telemetry is unavailable.',
        ];
    }

    /** @return array{checks:int,violations:int,critical:int,warning:int,info:int} */
    private function emptyIntegrityTotals(): array
    {
        return [
            'checks' => 0,
            'violations' => 0,
            'critical' => 0,
            'warning' => 0,
            'info' => 0,
        ];
    }
}
