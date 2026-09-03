<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Throwable;

final class DisasterRecoveryMonitor
{
    public function __construct(
        private readonly MonitoringBackupMonitor $backups,
        private readonly RecoveryEvidenceReadModel $evidence,
    ) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $configured = (bool) config('disaster_recovery.enforce', false)
            || (bool) config('disaster_recovery.pitr.enabled', false)
            || (bool) config('disaster_recovery.backup.enabled', false)
            || (bool) config('disaster_recovery.restore_drill.enabled', false);
        $keys = [
            (string) config('disaster_recovery.pitr.heartbeat_key', 'pitr-capability'),
            (string) config('disaster_recovery.restore_drill.heartbeat_key', 'restore-drill'),
            (string) config(
                'disaster_recovery.evidence.verification_heartbeat_key',
                'recovery-evidence-chain',
            ),
        ];

        $heartbeatStorageAvailable = true;
        try {
            $heartbeats = MonitoringHeartbeat::query()
                ->whereIn('key', $keys)
                ->get()
                ->keyBy('key');
        } catch (Throwable) {
            $heartbeats = collect();
            $heartbeatStorageAvailable = false;
        }
        $evidence = $this->evidence->summary();

        $signals = [
            'pitr' => $this->pitr(
                $heartbeats->get($keys[0]),
                is_array($evidence['latest_pitr_observation'] ?? null)
                    ? $evidence['latest_pitr_observation']
                    : null,
                (bool) ($evidence['available'] ?? false),
                $heartbeatStorageAvailable,
            ),
            'immutable_backup' => $this->backup(),
            'restore_drill' => $this->restoreDrill(
                is_array($evidence['latest_restore_drill'] ?? null)
                    ? $evidence['latest_restore_drill']
                    : null,
                (bool) ($evidence['available'] ?? false),
            ),
            'evidence_chain' => $this->evidenceChain(
                $heartbeats->get($keys[2]),
                (bool) ($evidence['available'] ?? false),
                $heartbeatStorageAvailable,
            ),
        ];
        $statuses = collect($signals)
            ->filter(static fn (array $signal): bool => (bool) ($signal['configured'] ?? false))
            ->map(static fn (array $signal): MonitoringStatus => MonitoringStatus::tryFrom(
                (string) ($signal['status'] ?? ''),
            ) ?? MonitoringStatus::Unknown)
            ->all();
        $status = $configured && $statuses !== []
            ? MonitoringStatus::worst($statuses)
            : MonitoringStatus::Unknown;

        return [
            'configured' => $configured,
            'status' => $status->value,
            'objectives' => [
                'rpo_seconds' => (int) config('disaster_recovery.objectives.rpo_seconds', 300),
                'rto_seconds' => (int) config('disaster_recovery.objectives.rto_seconds', 3_600),
            ],
            'target' => [
                'provider' => (string) config('disaster_recovery.target.provider', ''),
                'dataset_id' => (string) config('disaster_recovery.target.dataset_id', ''),
                'primary_region' => (string) config('disaster_recovery.target.primary_region', ''),
                'recovery_region' => (string) config('disaster_recovery.target.recovery_region', ''),
                'backup_destination_id' => (string) config(
                    'disaster_recovery.target.backup_destination_id',
                    '',
                ),
                'independent_verifier' => (string) config(
                    'disaster_recovery.target.independent_verifier',
                    '',
                ),
            ],
            'signals' => $signals,
            'evidence' => $evidence,
            'message' => match ($status) {
                MonitoringStatus::Operational => 'PITR, immutable backup, restore drill, and signed evidence are inside their safety windows.',
                MonitoringStatus::Degraded => 'At least one recovery control is approaching or exceeding its warning boundary.',
                MonitoringStatus::Outage => 'At least one required recovery control is outside its safe boundary.',
                default => 'Recovery evidence is not fully configured or cannot be read.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function pitr(
        ?MonitoringHeartbeat $heartbeat,
        ?array $evidence,
        bool $evidenceStorageAvailable,
        bool $heartbeatStorageAvailable,
    ): array {
        $configured = (bool) config('disaster_recovery.pitr.enabled', false)
            && (bool) config('disaster_recovery.pitr.observation_enabled', false);
        $warningAfter = (int) config(
            'disaster_recovery.pitr.warning_after_seconds',
            600,
        );
        $outageAfter = (int) config(
            'disaster_recovery.pitr.outage_after_seconds',
            1_200,
        );
        $rpo = (int) config('disaster_recovery.objectives.rpo_seconds', 300);

        if (! $configured) {
            return $this->unknown(
                false,
                'Provider PITR observation is not configured.',
            );
        }
        $attestationRequired = (bool) config(
            'disaster_recovery.attestation.required',
            false,
        );
        if ($attestationRequired) {
            if (! $evidenceStorageAvailable || $evidence === null) {
                return $this->outage(
                    ! $evidenceStorageAvailable
                        ? 'Signed PITR evidence storage could not be read.'
                        : 'No independently attested PITR observation has been recorded.',
                );
            }
            $latest = $this->parseTimestamp($evidence['recovery_point_at'] ?? null);
            $checked = $this->parseTimestamp($evidence['completed_at'] ?? null);
            $targetMatches = ($evidence['attested'] ?? false) === true
                && ($evidence['target_matches_current'] ?? false) === true;
            $providerCapability = ($evidence['continuous'] ?? false) === true
                && ($evidence['restorable'] ?? false) === true;
            $recordedStatus = MonitoringStatus::tryFrom(
                (string) ($evidence['status'] ?? ''),
            ) ?? MonitoringStatus::Outage;
        } else {
            if (! $heartbeatStorageAvailable || $heartbeat?->observed_at === null) {
                return $this->outage(
                    ! $heartbeatStorageAvailable
                        ? 'PITR observation storage could not be read.'
                        : 'No provider latest-restorable-time observation has been recorded.',
                );
            }
            $context = is_array($heartbeat->context) ? $heartbeat->context : [];
            $latest = $this->parseTimestamp($context['latest_recovery_point_at'] ?? null);
            $checked = $this->parseTimestamp($context['provider_checked_at'] ?? null)
                ?? CarbonImmutable::instance($heartbeat->observed_at);
            $targetMatches = $this->pitrTargetMatches($context);
            $providerCapability = ($context['continuous'] ?? false) === true
                && ($context['restorable'] ?? false) === true;
            $recordedStatus = MonitoringStatus::tryFrom((string) $heartbeat->status)
                ?? MonitoringStatus::Unknown;
        }
        if ($checked === null) {
            return $this->outage('PITR observation has an invalid provider timestamp.');
        }
        $observationAge = $this->age($checked);
        $recoveryLag = $latest === null ? null : $this->age($latest);
        $freshness = match (true) {
            ! $targetMatches || ! $providerCapability => MonitoringStatus::Outage,
            $observationAge === null || $recoveryLag === null => MonitoringStatus::Outage,
            $observationAge >= $outageAfter || $recoveryLag > $rpo * 2 => MonitoringStatus::Outage,
            $observationAge >= $warningAfter || $recoveryLag > $rpo => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $status = MonitoringStatus::worst([
            $recordedStatus,
            $freshness,
        ]);

        return [
            'configured' => true,
            'status' => $status->value,
            'observed_at' => $checked->toIso8601String(),
            'latest_recovery_point_at' => $latest?->toIso8601String(),
            'age_seconds' => $observationAge,
            'lag_seconds' => $recoveryLag,
            'rpo_seconds' => $rpo,
            'attested' => $attestationRequired
                && ($evidence['attested'] ?? false) === true,
            'outage_at' => $checked->addSeconds($outageAfter)->toIso8601String(),
            'message' => match ($status) {
                MonitoringStatus::Operational => 'Provider latest-restorable-time remains inside the RPO.',
                MonitoringStatus::Degraded => 'PITR observation or recovery-point lag is approaching its outage boundary.',
                MonitoringStatus::Outage => ! $targetMatches
                    ? 'PITR observation is not bound to the configured provider, dataset, and primary region.'
                    : (! $providerCapability
                        ? 'Provider PITR is not continuously restorable.'
                        : 'PITR observation is stale or the latest recovery point exceeds the RPO.'),
                default => 'PITR state cannot be determined from the provider observation.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function backup(): array
    {
        $summary = $this->backups->summary();

        return [
            'configured' => (bool) ($summary['configured'] ?? false),
            'status' => (string) ($summary['status'] ?? MonitoringStatus::Unknown->value),
            'storage_available' => $summary['storage_available'] ?? null,
            'observed_at' => $summary['last_verified_at'] ?? null,
            'last_attempt_at' => $summary['last_attempt_at'] ?? null,
            'age_seconds' => $summary['age_seconds'] ?? null,
            'backup_id' => $summary['backup_id'] ?? null,
            'size_bytes' => $summary['size_bytes'] ?? null,
            'immutable_until' => $summary['immutable_until'] ?? null,
            'object_lock_mode' => $summary['object_lock_mode'] ?? null,
            'failure_code' => $summary['failure_code'] ?? null,
            'next_due_at' => $summary['next_due_at'] ?? null,
            'outage_at' => $summary['outage_at'] ?? null,
            'message' => (string) ($summary['message'] ?? 'Backup state is unavailable.'),
        ];
    }

    /** @return array<string, mixed> */
    private function restoreDrill(?array $evidence, bool $storageAvailable): array
    {
        $configured = (bool) config('disaster_recovery.restore_drill.enabled', false);
        $warningAfter = max(1, (int) config(
            'disaster_recovery.restore_drill.interval_days',
            90,
        )) * 86_400;
        $outageAfter = $warningAfter + max(1, (int) config(
            'disaster_recovery.restore_drill.grace_days',
            14,
        )) * 86_400;

        if (! $configured) {
            return $this->unknown(
                false,
                'Restore drill evidence is not configured.',
            );
        }
        if (! $storageAvailable || $evidence === null) {
            return $this->outage(
                ! $storageAvailable
                    ? 'Restore evidence storage could not be read.'
                    : 'No isolated restore drill evidence has been recorded.',
            );
        }

        $completedAt = $this->parseTimestamp($evidence['completed_at'] ?? null);
        $age = $completedAt === null ? null : $this->age($completedAt);
        $freshness = match (true) {
            $age === null => MonitoringStatus::Outage,
            $age >= $outageAfter => MonitoringStatus::Outage,
            $age >= $warningAfter => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $attestationRequired = (bool) config(
            'disaster_recovery.attestation.required',
            false,
        );
        $attestationValid = ! $attestationRequired
            || (($evidence['attested'] ?? false) === true
                && ($evidence['target_matches_current'] ?? false) === true);
        $observedRpo = $this->integer($evidence['observed_rpo_seconds'] ?? null);
        $observedRto = $this->integer($evidence['observed_rto_seconds'] ?? null);
        $rpo = max(1, (int) config('disaster_recovery.objectives.rpo_seconds', 300));
        $rto = max(60, (int) config('disaster_recovery.objectives.rto_seconds', 3_600));
        $objectivesMet = $observedRpo !== null
            && $observedRto !== null
            && $observedRpo <= $rpo
            && $observedRto <= $rto;
        $failedChecks = is_array($evidence['failed_checks'] ?? null)
            ? $evidence['failed_checks']
            : [];
        $status = MonitoringStatus::worst([
            MonitoringStatus::tryFrom((string) ($evidence['status'] ?? ''))
                ?? MonitoringStatus::Outage,
            $freshness,
            $attestationValid
                ? MonitoringStatus::Operational
                : MonitoringStatus::Outage,
            $objectivesMet && $failedChecks === []
                ? MonitoringStatus::Operational
                : MonitoringStatus::Outage,
        ]);

        return [
            'configured' => true,
            'status' => $status->value,
            'observed_at' => $completedAt?->toIso8601String(),
            'age_seconds' => $age,
            'backup_id' => $evidence['backup_id'] ?? null,
            'observed_rpo_seconds' => $observedRpo,
            'observed_rto_seconds' => $observedRto,
            'rpo_seconds' => $rpo,
            'rto_seconds' => $rto,
            'target_environment' => is_string($evidence['target_environment'] ?? null)
                ? $evidence['target_environment']
                : null,
            'attested' => (bool) ($evidence['attested'] ?? false),
            'next_due_at' => $completedAt?->addSeconds($warningAfter)->toIso8601String(),
            'outage_at' => $completedAt?->addSeconds($outageAfter)->toIso8601String(),
            'failed_checks' => $failedChecks,
            'message' => match ($status) {
                MonitoringStatus::Operational => 'The latest isolated restore drill passed within the recovery objectives.',
                MonitoringStatus::Degraded => 'The latest restore drill is due or recorded a degraded outcome.',
                MonitoringStatus::Outage => ! $attestationValid
                    ? 'The latest restore drill lacks a current target-bound independent attestation.'
                    : (! $objectivesMet
                        ? 'The latest restore drill does not meet the current RPO/RTO objectives.'
                        : 'Restore evidence is overdue or the latest drill failed.'),
                default => 'Restore drill state cannot be determined.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function evidenceChain(
        ?MonitoringHeartbeat $heartbeat,
        bool $evidenceStorageAvailable,
        bool $heartbeatStorageAvailable,
    ): array {
        $configured = (bool) config('disaster_recovery.enforce', false);
        $warningAfter = (int) config(
            'disaster_recovery.evidence.verification_warning_after_seconds',
            7_200,
        );
        $outageAfter = (int) config(
            'disaster_recovery.evidence.verification_outage_after_seconds',
            14_400,
        );

        if (! $configured) {
            return $this->unknown(
                false,
                'Signed recovery evidence is not configured.',
            );
        }
        if (! $evidenceStorageAvailable
            || ! $heartbeatStorageAvailable
            || $heartbeat?->observed_at === null) {
            return $this->outage(match (true) {
                ! $evidenceStorageAvailable => 'Recovery evidence storage could not be read.',
                ! $heartbeatStorageAvailable => 'Recovery verification heartbeat storage could not be read.',
                default => 'The signed recovery evidence chain has not been verified.',
            });
        }

        $age = $this->age(CarbonImmutable::instance($heartbeat->observed_at));
        $freshness = match (true) {
            $age === null => MonitoringStatus::Outage,
            $age >= $outageAfter => MonitoringStatus::Outage,
            $age >= $warningAfter => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $status = MonitoringStatus::worst([
            MonitoringStatus::tryFrom((string) $heartbeat->status) ?? MonitoringStatus::Unknown,
            $freshness,
        ]);
        $context = is_array($heartbeat->context) ? $heartbeat->context : [];

        return [
            'configured' => true,
            'status' => $status->value,
            'observed_at' => $heartbeat->observed_at->toIso8601String(),
            'age_seconds' => $age,
            'total_evidence' => $this->integer($context['total_evidence'] ?? null),
            'last_sequence' => $this->integer($context['last_sequence'] ?? null),
            'failure_count' => $this->integer($context['failure_count'] ?? null),
            'message' => match ($status) {
                MonitoringStatus::Operational => 'The append-only evidence chain and signatures verify successfully.',
                MonitoringStatus::Degraded => 'Recovery evidence verification is approaching its maximum age.',
                MonitoringStatus::Outage => 'Recovery evidence is stale or its integrity verification failed.',
                default => 'Recovery evidence integrity cannot be determined.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function unknown(bool $configured, string $message): array
    {
        return [
            'configured' => $configured,
            'status' => MonitoringStatus::Unknown->value,
            'observed_at' => null,
            'age_seconds' => null,
            'message' => $message,
        ];
    }

    /** @return array<string, mixed> */
    private function outage(string $message): array
    {
        return [
            'configured' => true,
            'status' => MonitoringStatus::Outage->value,
            'observed_at' => null,
            'age_seconds' => null,
            'message' => $message,
        ];
    }

    private function parseTimestamp(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value);
        } catch (Throwable) {
            return null;
        }
    }

    private function age(CarbonInterface $observedAt): ?int
    {
        $futureTolerance = now()->addMinutes(5);
        if ($observedAt->greaterThan($futureTolerance)) {
            return null;
        }

        return max(0, (int) $observedAt->diffInSeconds(now()));
    }

    private function integer(mixed $value): ?int
    {
        return is_numeric($value) ? max(0, (int) $value) : null;
    }

    /** @param array<string, mixed> $context */
    private function pitrTargetMatches(array $context): bool
    {
        foreach ([
            'provider' => 'provider',
            'dataset_id' => 'dataset_id',
            'primary_region' => 'primary_region',
        ] as $contextKey => $targetKey) {
            $actual = is_string($context[$contextKey] ?? null)
                ? strtolower(trim($context[$contextKey]))
                : '';
            $expected = strtolower(trim((string) config(
                'disaster_recovery.target.'.$targetKey,
                '',
            )));
            if ($actual === '' || $expected === '' || ! hash_equals($expected, $actual)) {
                return false;
            }
        }

        return true;
    }
}
