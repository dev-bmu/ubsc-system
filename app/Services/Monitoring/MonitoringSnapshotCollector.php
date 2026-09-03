<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringSnapshot;
use App\Services\DataGovernance\ServiceAuditVerifier;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class MonitoringSnapshotCollector
{
    public function __construct(
        private readonly MonitoringSnapshotBuilder $builder,
        private readonly DataIntegrityMonitor $dataIntegrity,
        private readonly MonitoringIncidentManager $incidents,
        private readonly ServiceAuditVerifier $auditVerifier,
        private readonly MonitoringRollupRecorder $rollups,
        private readonly MonitoringHistoryReader $history,
        private readonly MonitoringSloService $slos,
        private readonly MonitoringAlertStatus $alerting,
        private readonly MonitoringBackupMonitor $backupMonitor,
        private readonly DisasterRecoveryMonitor $disasterRecovery,
        private readonly ResilienceDrillMonitor $resilienceDrills,
        private readonly MonitoringTelemetryReader $telemetry,
    ) {}

    /** @return array<string, mixed> */
    public function collect(): array
    {
        $startedAt = hrtime(true);
        $this->refreshIntegrityWhenNeeded();
        $this->refreshAuditLedgerWhenNeeded();
        $this->synchronizeIntegrityIncident();
        $this->synchronizeAuditLedgerIncident();
        $this->synchronizeBackupIncident();
        $this->synchronizeRecoveryIncidents($this->disasterRecovery->summary());
        $this->synchronizeResilienceIncident($this->resilienceDrills->summary());
        $payload = $this->builder->build();
        $this->synchronizeInvoiceDocumentIncident((array) ($payload['documents'] ?? []));
        $this->synchronizePerformanceIncident((array) ($payload['performance'] ?? []));
        $this->synchronizeCapacityIncident((array) ($payload['capacity'] ?? []));
        $payload['incidents'] = $this->telemetry->incidents();
        $payload['overall']['active_incidents'] = (int) $payload['incidents']['active_count'];
        $payload['overall']['highest_severity'] = $payload['incidents']['highest_severity'];
        $payload['collection_duration_ms'] = max(
            0,
            (int) round((hrtime(true) - $startedAt) / 1_000_000),
        );

        try {
            $this->rollups->record($payload);
        } catch (Throwable $exception) {
            // Current health remains available even if historical storage is
            // temporarily unavailable. The dashboard will expose the gap.
            Log::warning('monitoring.rollup_record_failed', [
                'failure_class' => $exception::class,
            ]);
        }

        $payload['history'] = $this->history->overview();
        $payload['slos'] = $this->slos->summary();
        $payload['alerting'] = $this->alerting->summary();
        $this->synchronizeAlertingIncident((array) $payload['alerting']);
        $this->synchronizeSloIncidents((array) $payload['slos']);
        $payload['incidents'] = $this->telemetry->incidents();
        $payload['overall']['active_incidents'] = (int) $payload['incidents']['active_count'];
        $payload['overall']['highest_severity'] = $payload['incidents']['highest_severity'];
        $payload['overall']['status'] = MonitoringStatus::worst([
            MonitoringStatus::tryFrom((string) $payload['overall']['status'])
                ?? MonitoringStatus::Unknown,
            match ($payload['incidents']['highest_severity'] ?? null) {
                'critical' => MonitoringStatus::Outage,
                'warning' => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            },
        ])->value;
        $payload['observability']['configured_signals'] = array_values(array_unique([
            ...(array) data_get($payload, 'observability.configured_signals', []),
            'bounded_hourly_rollups',
            'internal_slo_error_budget',
            'durable_incident_alert_outbox',
            'alert_dispatcher_dead_man_signal',
            'request_based_sli_rollups',
            ...((bool) data_get($payload, 'backup.configured', false)
                ? ['verified_backup_freshness']
                : []),
        ]));
        $payload['observability']['missing_signals'] = array_values(array_diff(
            (array) data_get($payload, 'observability.missing_signals', []),
            ['historical_slo_series'],
        ));

        $durationMs = max(0, (int) round((hrtime(true) - $startedAt) / 1_000_000));
        $payload['collection_duration_ms'] = $durationMs;

        MonitoringSnapshot::query()->updateOrCreate(
            ['key' => 'current'],
            [
                'schema_version' => 1,
                'status' => (string) $payload['overall']['status'],
                'payload' => $payload,
                'collected_at' => now(),
                'collection_duration_ms' => $durationMs,
            ],
        );

        try {
            Cache::forget(MonitoringSnapshotService::CACHE_KEY);
        } catch (\Throwable) {
            // A cache outage must not discard the freshly persisted read
            // model. Readers will fall back to the database record.
        }

        return $payload;
    }

    /** @param array<string, mixed> $recovery */
    private function synchronizeRecoveryIncidents(array $recovery): void
    {
        foreach ([
            'pitr' => 'Point-in-time recovery',
            'restore_drill' => 'Database restore drill',
            'evidence_chain' => 'Recovery evidence integrity',
        ] as $signalKey => $title) {
            $key = 'recovery-'.$signalKey;
            $signal = data_get($recovery, 'signals.'.$signalKey);

            try {
                if (! is_array($signal) || ! (bool) ($signal['configured'] ?? false)) {
                    $this->incidents->resolve($key);

                    continue;
                }

                $status = MonitoringStatus::tryFrom((string) ($signal['status'] ?? ''))
                    ?? MonitoringStatus::Unknown;
                if ($status === MonitoringStatus::Operational) {
                    $this->incidents->resolve($key);

                    continue;
                }

                $this->incidents->openOrRefresh(
                    key: $key,
                    source: 'recovery',
                    title: $title.' is not operational',
                    severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                    summary: (string) ($signal['message'] ?? 'Recovery signal is unavailable.'),
                    context: [
                        'status' => $status->value,
                        'age_seconds' => $signal['age_seconds'] ?? null,
                        'lag_seconds' => $signal['lag_seconds'] ?? null,
                        'observed_rpo_seconds' => $signal['observed_rpo_seconds'] ?? null,
                        'observed_rto_seconds' => $signal['observed_rto_seconds'] ?? null,
                    ],
                );
            } catch (Throwable $exception) {
                Log::warning('monitoring.recovery_incident_sync_failed', [
                    'signal' => $signalKey,
                    'failure_class' => $exception::class,
                ]);
            }
        }
    }

    /** @param array<string, mixed> $resilience */
    private function synchronizeResilienceIncident(array $resilience): void
    {
        $key = 'resilience-drill-posture';

        try {
            if (! (bool) ($resilience['configured'] ?? false)) {
                $this->incidents->resolve($key);

                return;
            }

            $status = MonitoringStatus::tryFrom((string) ($resilience['status'] ?? ''))
                ?? MonitoringStatus::Unknown;
            if ($status === MonitoringStatus::Operational) {
                $this->incidents->resolve($key);

                return;
            }

            $this->incidents->openOrRefresh(
                key: $key,
                source: 'resilience',
                title: $status === MonitoringStatus::Outage
                    ? 'Resilience proof is outside its safe boundary'
                    : 'Resilience proof needs operator attention',
                severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                summary: (string) ($resilience['message']
                    ?? 'Resilience campaign state is unavailable.'),
                context: [
                    'status' => $status->value,
                    'target_environment' => $resilience['target_environment'] ?? null,
                    'campaign_id' => data_get($resilience, 'campaign.campaign_id'),
                    'campaign_age_seconds' => data_get($resilience, 'campaign.age_seconds'),
                    'passed_count' => data_get($resilience, 'campaign.passed_count'),
                    'failed_count' => data_get($resilience, 'campaign.failed_count'),
                    'aborted_count' => data_get($resilience, 'campaign.aborted_count'),
                    'campaign_controls_passed' => data_get(
                        $resilience,
                        'campaign.campaign_controls_passed',
                    ),
                    'ledger_status' => data_get($resilience, 'ledger.status'),
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.resilience_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    /** @param array<string, mixed> $alerting */
    private function synchronizeAlertingIncident(array $alerting): void
    {
        $key = 'monitoring-alert-delivery';

        try {
            if (! (bool) config('observability.enforce', false)) {
                $this->incidents->resolve($key);

                return;
            }

            $status = (string) ($alerting['status'] ?? 'unknown');
            if ($status === 'operational') {
                $this->incidents->resolve($key);

                return;
            }

            $this->incidents->openOrRefresh(
                key: $key,
                source: 'alerting',
                title: $status === 'outage'
                    ? 'Incident delivery control plane is unavailable'
                    : 'Incident delivery control plane needs attention',
                severity: $status === 'outage' ? 'critical' : 'warning',
                summary: (string) ($alerting['message'] ?? 'Alert delivery state is unknown.'),
                context: [
                    'status' => $status,
                    'pending' => $alerting['pending_deliveries'] ?? null,
                    'dead' => $alerting['dead_deliveries'] ?? null,
                    'oldest_pending_age_seconds' => $alerting['oldest_pending_age_seconds'] ?? null,
                    'dispatcher_status' => $alerting['dispatcher_status'] ?? null,
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.alerting_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    /** @param array<string, mixed> $slos */
    private function synchronizeSloIncidents(array $slos): void
    {
        $thresholds = (array) config('observability.slo.burn_rate', []);

        foreach ((array) ($slos['items'] ?? []) as $objective) {
            if (! is_array($objective)) {
                continue;
            }
            $objectiveKey = (string) ($objective['key'] ?? '');
            if (preg_match('/^[a-z0-9][a-z0-9_.:-]{0,63}$/', $objectiveKey) !== 1) {
                continue;
            }
            $key = 'slo-burn-'.$objectiveKey;
            $telemetryKey = 'slo-telemetry-'.$objectiveKey;

            try {
                $expected = max(0, (int) ($objective['expected_samples'] ?? 0));
                $missing = max(0, (int) ($objective['missing_samples'] ?? 0));
                $recentMissing = max(
                    0,
                    (int) ($objective['recent_missing_samples'] ?? $missing),
                );
                if ($recentMissing > 0) {
                    $this->incidents->openOrRefresh(
                        key: $telemetryKey,
                        source: 'observability',
                        title: 'SLO telemetry has missing observation intervals',
                        severity: $recentMissing >= 3
                            ? 'critical'
                            : 'warning',
                        summary: (string) ($objective['message'] ?? 'SLO coverage is incomplete.'),
                        context: [
                            'objective' => $objectiveKey,
                            'expected_samples' => $expected,
                            'recorded_samples' => $objective['recorded_samples'] ?? null,
                            'missing_samples' => $missing,
                            'recent_missing_samples' => $recentMissing,
                        ],
                    );
                } else {
                    $this->incidents->resolve($telemetryKey);
                }

                if (($objective['evaluation_status'] ?? null) !== 'evaluated') {
                    $this->incidents->resolve($key);

                    continue;
                }

                $oneHour = $objective['burn_rates']['1h'] ?? null;
                $sixHours = $objective['burn_rates']['6h'] ?? null;
                $twentyFourHours = $objective['burn_rates']['24h'] ?? null;
                $fastBurn = is_numeric($oneHour) && is_numeric($sixHours)
                    && (float) $oneHour >= (float) ($thresholds['fast_short_window'] ?? 14.4)
                    && (float) $sixHours >= (float) ($thresholds['fast_long_window'] ?? 6.0);
                $slowBurn = is_numeric($sixHours) && is_numeric($twentyFourHours)
                    && (float) $sixHours >= (float) ($thresholds['slow_short_window'] ?? 6.0)
                    && (float) $twentyFourHours >= (float) ($thresholds['slow_long_window'] ?? 3.0);
                $compliance = $objective['compliance_percent'] ?? null;
                $target = $objective['target_percent'] ?? null;
                $outsideTarget = is_numeric($compliance)
                    && is_numeric($target)
                    && (float) $compliance < (float) $target;

                if (! $fastBurn && ! $slowBurn && ! $outsideTarget) {
                    $this->incidents->resolve($key);

                    continue;
                }

                $this->incidents->openOrRefresh(
                    key: $key,
                    source: 'slo',
                    title: match (true) {
                        $fastBurn => 'SLO error budget is burning rapidly',
                        $slowBurn => 'SLO error budget has a sustained burn',
                        default => 'SLO objective is outside its target',
                    },
                    severity: $fastBurn ? 'critical' : 'warning',
                    summary: (string) ($objective['message'] ?? 'SLO requires attention.'),
                    context: [
                        'objective' => $objectiveKey,
                        'compliance_percent' => $objective['compliance_percent'] ?? null,
                        'target_percent' => $objective['target_percent'] ?? null,
                        'budget_remaining_percent' => $objective['error_budget_remaining_percent'] ?? null,
                        'burn_rate_1h' => $oneHour,
                        'burn_rate_6h' => $sixHours,
                        'burn_rate_24h' => $twentyFourHours,
                    ],
                );
            } catch (Throwable $exception) {
                Log::warning('monitoring.slo_incident_sync_failed', [
                    'objective' => $objectiveKey,
                    'failure_class' => $exception::class,
                ]);
            }
        }
    }

    private function refreshIntegrityWhenNeeded(): void
    {
        $summary = $this->dataIntegrity->summary();

        if ($summary['available'] && ! $summary['is_stale']) {
            return;
        }

        try {
            $this->dataIntegrity->refresh();
        } catch (Throwable $exception) {
            // The general cockpit remains available with an explicit Unknown
            // integrity status. Never fail every other signal because one
            // read-only scanner or its distributed lock is unavailable.
            Log::warning('monitoring.data_integrity_refresh_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    private function synchronizeIntegrityIncident(): void
    {
        $summary = $this->dataIntegrity->summary();
        $sourceStatus = (string) $summary['status'];
        $isHealthy = $summary['available']
            && ! $summary['is_stale']
            && $sourceStatus === 'healthy';

        try {
            if ($isHealthy) {
                $this->incidents->resolve('data-integrity-scan');

                return;
            }

            $critical = max(0, (int) ($summary['totals']['critical'] ?? 0));
            $warning = max(0, (int) ($summary['totals']['warning'] ?? 0));
            $severity = $sourceStatus === 'critical' ? 'critical' : 'warning';
            $title = match (true) {
                ! $summary['available'] => 'Pemindaian integritas data belum tersedia',
                $summary['is_stale'] => 'Pemindaian integritas data kedaluwarsa',
                $sourceStatus === 'critical' => 'Invariant data kritis terdeteksi',
                default => 'Invariant data perlu ditinjau',
            };

            $this->incidents->openOrRefresh(
                key: 'data-integrity-scan',
                source: 'data-integrity',
                title: $title,
                severity: $severity,
                summary: sprintf(
                    '%d pelanggaran terdeteksi pada %d pemeriksaan read-only.',
                    max(0, (int) ($summary['totals']['violations'] ?? 0)),
                    max(0, (int) ($summary['totals']['checks'] ?? 0)),
                ),
                context: [
                    'status' => $sourceStatus,
                    'is_stale' => (bool) $summary['is_stale'],
                    'checks' => max(0, (int) ($summary['totals']['checks'] ?? 0)),
                    'violations' => max(0, (int) ($summary['totals']['violations'] ?? 0)),
                    'critical' => $critical,
                    'warning' => $warning,
                ],
            );
        } catch (Throwable $exception) {
            // Incident persistence is secondary to collecting the current
            // snapshot. External logs preserve a signal if its table/cache is
            // the component currently unavailable.
            Log::warning('monitoring.data_integrity_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    private function refreshAuditLedgerWhenNeeded(): void
    {
        $audit = $this->auditVerifier->latest();
        $warningAfter = max(
            60,
            (int) config('data_audit.verification_warning_after_seconds', 900),
        );
        $hasCompletedCycle = (bool) ($audit['context']['has_completed_cycle'] ?? false);
        $needsRefresh = $audit['observed_at'] === null
            || (int) ($audit['lag_seconds'] ?? PHP_INT_MAX) >= $warningAfter
            || ! $hasCompletedCycle;

        if (! $needsRefresh) {
            return;
        }

        try {
            $this->auditVerifier->verify();
        } catch (Throwable $exception) {
            Log::warning('monitoring.service_audit_refresh_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    private function synchronizeAuditLedgerIncident(): void
    {
        $audit = $this->auditVerifier->latest();
        $status = MonitoringStatus::tryFrom((string) $audit['status'])
            ?? MonitoringStatus::Unknown;

        try {
            if ($status === MonitoringStatus::Operational) {
                $this->incidents->resolve('service-audit-ledger');

                return;
            }

            $this->incidents->openOrRefresh(
                key: 'service-audit-ledger',
                source: 'data-governance',
                title: $status === MonitoringStatus::Outage
                    ? 'Integritas ledger audit bermasalah'
                    : 'Verifier ledger audit belum sehat',
                severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                summary: (string) ($audit['message'] ?? 'Status verifier ledger audit tidak tersedia.'),
                context: [
                    'status' => $status->value,
                    'lag_seconds' => $audit['lag_seconds'],
                    'total_events' => (int) ($audit['context']['total_events'] ?? 0),
                    'last_cycle_mismatches' => (int) ($audit['context']['last_cycle_mismatches'] ?? 0),
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.service_audit_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    private function synchronizeBackupIncident(): void
    {
        $backup = $this->backupMonitor->summary();
        $key = 'verified-backup-freshness';

        try {
            if (! (bool) $backup['configured']
                || $backup['status'] === MonitoringStatus::Operational->value) {
                $this->incidents->resolve($key);

                return;
            }

            $status = MonitoringStatus::tryFrom((string) $backup['status'])
                ?? MonitoringStatus::Unknown;

            $this->incidents->openOrRefresh(
                key: $key,
                source: 'backup',
                title: $status === MonitoringStatus::Outage
                    ? 'Verified backup is outside its safe freshness window'
                    : 'Verified backup freshness needs attention',
                severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                summary: (string) $backup['message'],
                context: [
                    'status' => $status->value,
                    'age_seconds' => $backup['age_seconds'],
                    'warning_after_seconds' => (int) $backup['warning_after_seconds'],
                    'outage_after_seconds' => (int) $backup['outage_after_seconds'],
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.backup_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    /** @param array<string, mixed> $documents */
    private function synchronizeInvoiceDocumentIncident(array $documents): void
    {
        $key = 'invoice-document-pipeline';

        try {
            if (! (bool) ($documents['prewarm_enabled'] ?? false)) {
                $this->incidents->resolve($key);

                return;
            }

            $status = MonitoringStatus::tryFrom((string) ($documents['status'] ?? 'unknown'))
                ?? MonitoringStatus::Unknown;

            if ($status === MonitoringStatus::Operational) {
                $this->incidents->resolve($key);

                return;
            }

            $this->incidents->openOrRefresh(
                key: $key,
                source: 'documents',
                title: $status === MonitoringStatus::Outage
                    ? 'Invoice document pipeline requires immediate attention'
                    : 'Invoice document pipeline is not fully healthy',
                severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                summary: (string) ($documents['message']
                    ?? 'Invoice document telemetry is not available.'),
                context: [
                    'status' => $status->value,
                    'pending' => $documents['pending'] ?? null,
                    'oldest_age_seconds' => $documents['oldest_age_seconds'] ?? null,
                    'failed_recent' => $documents['failed_recent'] ?? null,
                    'expired_hot' => $documents['expired_hot'] ?? null,
                    'storage_free_percent' => $documents['storage_free_percent'] ?? null,
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.invoice_document_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    /** @param array<string, mixed> $performance */
    private function synchronizePerformanceIncident(array $performance): void
    {
        $key = 'application-performance-capacity';
        $status = MonitoringStatus::tryFrom((string) ($performance['status'] ?? 'unknown'))
            ?? MonitoringStatus::Unknown;

        try {
            if ($status === MonitoringStatus::Operational) {
                $this->incidents->resolve($key);

                return;
            }

            // Insufficient samples and unavailable telemetry are deliberately
            // not converted into a false performance incident. Existing
            // incidents remain open until a known healthy sample resolves it.
            if ($status === MonitoringStatus::Unknown) {
                return;
            }

            $this->incidents->openOrRefresh(
                key: $key,
                source: 'performance',
                title: $status === MonitoringStatus::Outage
                    ? 'Application performance exceeds the critical threshold'
                    : 'Application performance needs attention',
                severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                summary: 'HTTP latency, error rate, queue delay, or database capacity crossed a configured threshold.',
                context: [
                    'status' => $status->value,
                    'http_p95_ms' => data_get($performance, 'http.p95_ms'),
                    'http_error_percent' => data_get($performance, 'http.error_rate_percent'),
                    'requests_per_minute' => data_get($performance, 'http.requests_per_minute'),
                    'queue_wait_p95_ms' => data_get($performance, 'queues.p95_wait_ms'),
                    'database_connection_percent' => data_get(
                        $performance,
                        'database.connections.utilization_percent',
                    ),
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.performance_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }

    /** @param array<string, mixed> $capacity */
    private function synchronizeCapacityIncident(array $capacity): void
    {
        $key = 'capacity-control-plane';

        try {
            if (! (bool) config('capacity_planning.enforce', false)) {
                $this->incidents->resolve($key);

                return;
            }

            $status = MonitoringStatus::tryFrom((string) ($capacity['status'] ?? 'unknown'))
                ?? MonitoringStatus::Unknown;
            if ($status === MonitoringStatus::Operational) {
                $this->incidents->resolve($key);

                return;
            }

            $this->incidents->openOrRefresh(
                key: $key,
                source: 'capacity',
                title: $status === MonitoringStatus::Outage
                    ? 'Autoscaling control plane is unavailable'
                    : 'Autoscaling control plane is held by a safety gate',
                severity: $status === MonitoringStatus::Outage ? 'critical' : 'warning',
                summary: (string) ($capacity['message'] ?? 'Capacity control state is unknown.'),
                context: [
                    'status' => $status->value,
                    'mode' => $capacity['mode'] ?? null,
                    'provider' => $capacity['provider'] ?? null,
                    'plan_status' => data_get($capacity, 'plan.status'),
                    'plan_fresh' => data_get($capacity, 'plan.fresh'),
                    'convergence_stalled_targets' => data_get(
                        $capacity,
                        'plan.convergence_stalled_targets',
                        [],
                    ),
                    'evidence_available' => is_array($capacity['evidence'] ?? null),
                    'observation_available' => is_array($capacity['observation'] ?? null),
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('monitoring.capacity_incident_sync_failed', [
                'failure_class' => $exception::class,
            ]);
        }
    }
}
