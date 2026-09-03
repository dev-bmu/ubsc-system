<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Services\DataGovernance\ServiceAuditVerifier;

class MonitoringSnapshotBuilder
{
    public function __construct(
        private readonly ReadinessService $readiness,
        private readonly MonitoringTelemetryReader $telemetry,
        private readonly DataIntegrityMonitor $dataIntegrity,
        private readonly ServiceAuditVerifier $auditVerifier,
        private readonly MonitoringBackupMonitor $backupMonitor,
        private readonly DisasterRecoveryMonitor $disasterRecovery,
        private readonly DatabaseReplicationMonitor $databaseReplication,
        private readonly InvoicePdfOperationalStatus $invoiceDocuments,
        private readonly PerformanceCapacityMonitor $performanceMonitor,
        private readonly CapacityControlMonitor $capacityControl,
        private readonly ResilienceDrillMonitor $resilienceDrills,
        private readonly ExternalAvailabilityConfiguration $externalAvailability,
    ) {}

    /** @return array<string, mixed> */
    public function build(): array
    {
        $readiness = $this->readiness->report();
        $queue = $this->telemetry->queue();
        $scheduler = $this->telemetry->scheduler();
        $incidents = $this->telemetry->incidents();
        $security = $this->telemetry->security();
        $integrity = $this->integrity();
        $auditLedger = $this->auditVerifier->latest();
        $backup = $this->backupMonitor->summary();
        $recovery = $this->disasterRecovery->summary();
        $replication = $this->databaseReplication->summary();
        $documents = $this->invoiceDocuments->summary();
        $performance = $this->performanceMonitor->summary();
        $capacity = $this->capacityControl->summary();
        $resilience = $this->resilienceDrills->summary();
        $availability = $this->externalAvailability->summary();
        $services = collect($readiness['checks'])->map(
            static fn (array $check): array => [
                'key' => $check['key'],
                'name' => $check['name'],
                'category' => 'dependency',
                'status' => $check['status'],
                'observed_at' => $readiness['checked_at'],
                'latency_ms' => $check['latency_ms'],
                'message' => $check['message'],
            ],
        )->values();
        $services->push([
            'key' => 'scheduler',
            'name' => 'Task scheduler',
            'category' => 'scheduler',
            'status' => $scheduler['status'],
            'observed_at' => $scheduler['last_seen_at'],
            'latency_ms' => null,
            'message' => $scheduler['last_seen_at'] === null
                ? 'Scheduler heartbeat has not been observed.'
                : null,
        ]);
        if ((bool) $backup['configured']) {
            $services->push([
                'key' => 'verified-backup',
                'name' => 'Verified backup',
                'category' => 'backup',
                'status' => $backup['status'],
                'observed_at' => $backup['last_verified_at'],
                'latency_ms' => null,
                'message' => $backup['message'],
            ]);
        }
        foreach ([
            'pitr' => ['key' => 'pitr-capability', 'name' => 'Point-in-time recovery'],
            'restore_drill' => ['key' => 'restore-drill', 'name' => 'Restore drill'],
            'evidence_chain' => ['key' => 'recovery-evidence-chain', 'name' => 'Recovery evidence chain'],
        ] as $signalKey => $identity) {
            $signal = data_get($recovery, 'signals.'.$signalKey);
            if (! is_array($signal) || ! (bool) ($signal['configured'] ?? false)) {
                continue;
            }
            $services->push([
                'key' => $identity['key'],
                'name' => $identity['name'],
                'category' => 'recovery',
                'status' => (string) ($signal['status'] ?? MonitoringStatus::Unknown->value),
                'observed_at' => $signal['observed_at'] ?? null,
                'latency_ms' => null,
                'message' => $signal['message'] ?? null,
            ]);
        }
        foreach ([
            'topology' => ['key' => 'database-replication-topology', 'name' => 'Database replication topology'],
            'ledger' => ['key' => 'database-replication-ledger', 'name' => 'Replication event ledger'],
        ] as $signalKey => $identity) {
            $signal = data_get($replication, 'signals.'.$signalKey);
            if (! is_array($signal) || ! (bool) ($signal['configured'] ?? false)) {
                continue;
            }
            $services->push([
                'key' => $identity['key'],
                'name' => $identity['name'],
                'category' => 'replication',
                'status' => (string) ($signal['status'] ?? MonitoringStatus::Unknown->value),
                'observed_at' => $signal['observed_at'] ?? null,
                'latency_ms' => $signalKey === 'topology'
                    ? data_get($replication, 'current.maximum_replica_lag_ms')
                    : null,
                'message' => $signal['message'] ?? null,
            ]);
        }
        $services->push([
            'key' => 'service-audit-ledger',
            'name' => 'Service audit ledger',
            'category' => 'data-integrity',
            'status' => $auditLedger['status'],
            'observed_at' => $auditLedger['observed_at'],
            'latency_ms' => null,
            'message' => $auditLedger['message'],
        ]);
        $services->push([
            'key' => 'queue-worker',
            'name' => 'Queue worker',
            'category' => 'queue',
            'status' => $queue['status'],
            'observed_at' => $queue['worker_last_seen_at'],
            'latency_ms' => null,
            'message' => $queue['message'] ?? ($queue['worker_last_seen_at'] === null
                ? 'Queue worker heartbeat has not been observed.'
                : null),
        ]);
        $services->push([
            'key' => 'invoice-pdf-pipeline',
            'name' => 'Invoice document pipeline',
            'category' => 'documents',
            'status' => $documents['status'],
            'observed_at' => $documents['worker_last_seen_at']
                ?? $documents['latest_generated_at'],
            'latency_ms' => $documents['latest_render_duration_ms'],
            'message' => $documents['message'],
        ]);
        if ((bool) ($capacity['enabled'] ?? false)) {
            $services->push([
                'key' => 'capacity-control-plane',
                'name' => 'Capacity control plane',
                'category' => 'capacity',
                'status' => (string) ($capacity['status'] ?? MonitoringStatus::Unknown->value),
                'observed_at' => data_get($capacity, 'observation.observed_at'),
                'latency_ms' => null,
                'message' => $capacity['message'] ?? null,
            ]);
        }
        if ((bool) ($resilience['configured'] ?? false)) {
            $services->push([
                'key' => 'resilience-drill-campaign',
                'name' => 'Controlled resilience game day',
                'category' => 'resilience',
                'status' => (string) ($resilience['status'] ?? MonitoringStatus::Unknown->value),
                'observed_at' => data_get($resilience, 'campaign.completed_at'),
                'latency_ms' => null,
                'message' => $resilience['message'] ?? null,
            ]);
        }

        $statusInputs = $services->map(
            static fn (array $service): MonitoringStatus => MonitoringStatus::tryFrom($service['status'])
                ?? MonitoringStatus::Unknown,
        )->all();
        $securityStatus = MonitoringStatus::tryFrom((string) $security['status'])
            ?? MonitoringStatus::Unknown;

        if ($securityStatus->priority() >= MonitoringStatus::Degraded->priority()) {
            $statusInputs[] = $securityStatus;
        }

        $statusInputs[] = MonitoringStatus::tryFrom((string) $integrity['status'])
            ?? MonitoringStatus::Unknown;

        $performanceStatus = MonitoringStatus::tryFrom((string) $performance['status'])
            ?? MonitoringStatus::Unknown;

        if ($performanceStatus->priority() >= MonitoringStatus::Degraded->priority()) {
            $statusInputs[] = $performanceStatus;
        }

        if (($incidents['highest_severity'] ?? null) === 'critical') {
            $statusInputs[] = MonitoringStatus::Outage;
        } elseif (($incidents['highest_severity'] ?? null) === 'warning') {
            $statusInputs[] = MonitoringStatus::Degraded;
        }

        $overall = MonitoringStatus::worst($statusInputs);
        $database = $services->firstWhere('key', 'database');
        array_unshift($performance['signals'], [
            'key' => 'database_probe_latency',
            'name' => 'Database probe latency',
            'value' => $database['latency_ms'] ?? null,
            'unit' => 'ms',
            'status' => $database['status'] ?? MonitoringStatus::Unknown->value,
            'message' => $database['message'] ?? null,
        ]);

        return [
            'schema_version' => 1,
            'generated_at' => now()->toIso8601String(),
            'served_at' => null,
            'snapshot_age_seconds' => 0,
            'snapshot_stale' => false,
            'cache_ttl_seconds' => (int) config('monitoring.snapshot_cache_seconds', 15),
            'environment' => (string) config('app.env', 'production'),
            'topology' => (string) config('production.topology', ''),
            'release' => config('monitoring.release'),
            'overall' => [
                'status' => $overall->value,
                'active_incidents' => (int) $incidents['active_count'],
                'highest_severity' => $incidents['highest_severity'],
            ],
            'services' => $services->all(),
            'availability' => $availability,
            'performance' => $performance,
            'capacity' => $capacity,
            'resilience' => $resilience,
            'integrity' => $integrity,
            'audit_ledger' => $auditLedger,
            'backup' => $backup,
            'recovery' => $recovery,
            'replication' => $replication,
            'documents' => $documents,
            'security' => $security,
            'usage' => $this->telemetry->usage(),
            'queue' => $queue,
            'scheduler' => $scheduler,
            'incidents' => $incidents,
            'alerting' => [
                'status' => 'unconfigured',
                'delivery_configured' => false,
                'channels' => [],
                'last_delivery_at' => null,
                'message' => 'Off-host alert delivery and escalation are not configured.',
            ],
            'slos' => $this->slos(),
            'observability' => [
                'coverage_status' => 'partial',
                'configured_signals' => [
                    'dependency_readiness',
                    'scheduler_heartbeat',
                    'queue_heartbeat',
                    'bounded_usage_snapshot',
                    'incident_register',
                    'data_integrity_invariants',
                    'append_only_audit_verification',
                    'private_invoice_artifact_pipeline',
                    'document_queue_heartbeat',
                    'http_request_histograms',
                    'http_throughput_and_error_rate',
                    'queue_wait_and_runtime_histograms',
                    'signed_capacity_control_plane',
                    ...((bool) ($resilience['configured'] ?? false)
                        ? ['signed_resilience_game_day_evidence']
                        : []),
                    'server_generated_request_correlation',
                    ...((bool) ($recovery['configured'] ?? false)
                        ? ['pitr_recovery_posture', 'signed_recovery_evidence']
                        : []),
                    ...((bool) ($replication['configured'] ?? false)
                        ? ['signed_database_replication_topology', 'replication_fencing_and_lag']
                        : []),
                    ...((bool) ($availability['external_monitoring_configured'] ?? false)
                        ? ['external_availability']
                        : []),
                    ...((bool) data_get($performance, 'database.supported', false)
                        ? ['database_capacity_counters']
                        : []),
                ],
                'missing_signals' => [
                    ...((bool) ($availability['external_monitoring_configured'] ?? false)
                        ? []
                        : ['external_availability']),
                    ...((bool) config('observability.signals.apm_connected', false)
                        ? []
                        : ['distributed_traces']),
                    'browser_rum',
                    ...((bool) config('observability.signals.centralized_security_events', false)
                        ? []
                        : ['centralized_security_events']),
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

    /** @return array<string, mixed> */
    private function integrity(): array
    {
        $snapshot = $this->dataIntegrity->latest();

        if ($snapshot === null) {
            return [
                'available' => false,
                'is_stale' => true,
                'status' => MonitoringStatus::Unknown->value,
                'source_status' => 'unavailable',
                'generated_at' => null,
                'expires_at' => null,
                'duration_ms' => null,
                'totals' => $this->emptyIntegrityTotals(),
                'domains' => collect(['bookings', 'memberships', 'payments'])
                    ->mapWithKeys(fn (string $domain): array => [
                        $domain => [
                            'status' => MonitoringStatus::Unknown->value,
                            ...$this->emptyIntegrityTotals(),
                        ],
                    ])
                    ->all(),
                'checks' => [],
                'action_queue' => [],
            ];
        }

        $isStale = (bool) ($snapshot['is_stale'] ?? true);
        $domains = collect((array) ($snapshot['domains'] ?? []))
            ->map(static function (array $domain) use ($isStale): array {
                $sourceStatus = (string) ($domain['status'] ?? 'unavailable');

                return [
                    'status' => $isStale
                        ? MonitoringStatus::Unknown->value
                        : self::integrityStatus($sourceStatus)->value,
                    'checks' => max(0, (int) ($domain['checks'] ?? 0)),
                    'violations' => max(0, (int) ($domain['violations'] ?? 0)),
                    'critical' => max(0, (int) ($domain['critical'] ?? 0)),
                    'warning' => max(0, (int) ($domain['warning'] ?? 0)),
                    'info' => max(0, (int) ($domain['info'] ?? 0)),
                ];
            })
            ->all();
        $checks = collect((array) ($snapshot['checks'] ?? []))
            ->map(fn (array $check): array => $this->integrityCheck($check))
            ->values()
            ->all();
        $actionQueue = collect((array) ($snapshot['action_queue'] ?? []))
            ->map(fn (array $check): array => $this->integrityCheck($check))
            ->values()
            ->all();
        $sourceStatus = (string) ($snapshot['status'] ?? 'unavailable');

        return [
            'available' => true,
            'is_stale' => $isStale,
            'status' => $isStale
                ? MonitoringStatus::Unknown->value
                : self::integrityStatus($sourceStatus)->value,
            'source_status' => $sourceStatus,
            'generated_at' => $snapshot['generated_at'] ?? null,
            'expires_at' => $snapshot['expires_at'] ?? null,
            'duration_ms' => isset($snapshot['duration_ms'])
                ? round((float) $snapshot['duration_ms'], 2)
                : null,
            'totals' => [
                'checks' => max(0, (int) ($snapshot['totals']['checks'] ?? 0)),
                'violations' => max(0, (int) ($snapshot['totals']['violations'] ?? 0)),
                'critical' => max(0, (int) ($snapshot['totals']['critical'] ?? 0)),
                'warning' => max(0, (int) ($snapshot['totals']['warning'] ?? 0)),
                'info' => max(0, (int) ($snapshot['totals']['info'] ?? 0)),
            ],
            'domains' => $domains,
            'checks' => $checks,
            'action_queue' => $actionQueue,
        ];
    }

    /**
     * @param  array<string, mixed>  $check
     * @return array<string, mixed>
     */
    private function integrityCheck(array $check): array
    {
        $severity = in_array($check['severity'] ?? null, ['critical', 'warning', 'info'], true)
            ? (string) $check['severity']
            : 'info';
        $count = max(0, (int) ($check['count'] ?? 0));

        return [
            'key' => (string) ($check['key'] ?? 'unknown'),
            'title' => (string) ($check['title'] ?? 'Unnamed integrity check'),
            'domain' => (string) ($check['domain'] ?? 'unknown'),
            'severity' => $severity,
            'count' => $count,
            'status' => $count === 0
                ? MonitoringStatus::Operational->value
                : ($severity === 'critical'
                    ? MonitoringStatus::Outage->value
                    : MonitoringStatus::Degraded->value),
            'description' => (string) ($check['description'] ?? ''),
            'recommended_action' => (string) ($check['recommended_action'] ?? ''),
            'reconciliation' => (string) ($check['reconciliation'] ?? 'manual_review'),
            // Scanner samples are bounded opaque identifiers only. They never
            // contain customer names, email addresses, or payment secrets.
            'samples' => array_values((array) ($check['samples'] ?? [])),
            'context' => (array) ($check['context'] ?? []),
        ];
    }

    private static function integrityStatus(string $status): MonitoringStatus
    {
        return match ($status) {
            'healthy' => MonitoringStatus::Operational,
            'warning' => MonitoringStatus::Degraded,
            'critical' => MonitoringStatus::Outage,
            default => MonitoringStatus::Unknown,
        };
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

    /** @return array<string, mixed> */
    private function slos(): array
    {
        $definitions = collect((array) config('monitoring.slos.definitions', []))
            ->map(static function (array $definition): array {
                $target = $definition['target_percent'] ?? null;
                $target = is_numeric($target) && (float) $target > 0 && (float) $target <= 100
                    ? round((float) $target, 4)
                    : null;

                return [
                    'key' => (string) ($definition['key'] ?? 'unknown'),
                    'name' => (string) ($definition['name'] ?? 'Unnamed objective'),
                    'target_percent' => $target,
                    'indicator' => (string) ($definition['indicator'] ?? ''),
                    'source' => (string) ($definition['source'] ?? 'unconfigured'),
                    'compliance_percent' => null,
                    'error_budget_remaining_percent' => null,
                    'status' => MonitoringStatus::Unknown->value,
                    'message' => $target === null
                        ? 'Target has not been adopted after a production baseline.'
                        : 'Historical SLI telemetry source is not configured.',
                ];
            })
            ->values();

        return [
            'window_days' => (int) config('monitoring.slos.window_days', 28),
            'evaluation_status' => $definitions->contains(
                static fn (array $definition): bool => $definition['target_percent'] !== null,
            ) ? 'partial' : 'unconfigured',
            'items' => $definitions->all(),
        ];
    }
}
