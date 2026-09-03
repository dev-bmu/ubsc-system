<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use Carbon\CarbonImmutable;
use Throwable;

class MonitoringBackupMonitor
{
    public function __construct(private readonly RecoveryEvidenceReadModel $evidence) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $enabled = (bool) config('monitoring.backup.enabled', false);
        $warningAfter = (int) config('monitoring.backup.warning_after_seconds', 108_000);
        $outageAfter = (int) config('monitoring.backup.outage_after_seconds', 172_800);

        if (! $enabled) {
            return [
                'configured' => false,
                'status' => MonitoringStatus::Unknown->value,
                'storage_available' => null,
                'last_verified_at' => null,
                'last_attempt_at' => null,
                'age_seconds' => null,
                'warning_after_seconds' => $warningAfter,
                'outage_after_seconds' => $outageAfter,
                'backup_id' => null,
                'size_bytes' => null,
                'immutable_until' => null,
                'object_lock_mode' => null,
                'failure_code' => null,
                'next_due_at' => null,
                'outage_at' => null,
                'message' => 'Verified backup heartbeat is not enabled for this environment.',
            ];
        }

        $ledger = $this->evidence->summary(1);
        if (! (bool) ($ledger['available'] ?? false)) {
            return [
                'configured' => true,
                'status' => MonitoringStatus::Outage->value,
                'storage_available' => false,
                'last_verified_at' => null,
                'last_attempt_at' => null,
                'age_seconds' => null,
                'warning_after_seconds' => $warningAfter,
                'outage_after_seconds' => $outageAfter,
                'backup_id' => null,
                'size_bytes' => null,
                'immutable_until' => null,
                'object_lock_mode' => null,
                'failure_code' => null,
                'next_due_at' => null,
                'outage_at' => null,
                'message' => 'Recovery evidence storage could not be read.',
            ];
        }
        $attempt = is_array($ledger['latest_backup_attempt'] ?? null)
            ? $ledger['latest_backup_attempt']
            : null;
        $verified = is_array($ledger['latest_verified_backup'] ?? null)
            ? $ledger['latest_verified_backup']
            : null;
        if ($attempt === null) {
            return [
                'configured' => true,
                'status' => MonitoringStatus::Outage->value,
                'storage_available' => true,
                'last_verified_at' => null,
                'last_attempt_at' => null,
                'age_seconds' => null,
                'warning_after_seconds' => $warningAfter,
                'outage_after_seconds' => $outageAfter,
                'backup_id' => null,
                'size_bytes' => null,
                'immutable_until' => null,
                'object_lock_mode' => null,
                'failure_code' => null,
                'next_due_at' => null,
                'outage_at' => null,
                'message' => 'No append-only backup evidence has been recorded.',
            ];
        }
        $attemptAt = $this->parseTimestamp((string) ($attempt['completed_at'] ?? ''));
        $verifiedAt = $this->parseTimestamp((string) ($verified['completed_at'] ?? ''));
        if ($attemptAt === null || $attemptAt->greaterThan(now()->addMinutes(5))) {
            return [
                'configured' => true,
                'status' => MonitoringStatus::Outage->value,
                'storage_available' => true,
                'last_verified_at' => $verifiedAt?->toIso8601String(),
                'last_attempt_at' => $attemptAt?->toIso8601String(),
                'age_seconds' => null,
                'warning_after_seconds' => $warningAfter,
                'outage_after_seconds' => $outageAfter,
                'backup_id' => $verified['backup_id'] ?? null,
                'size_bytes' => $verified['size_bytes'] ?? null,
                'immutable_until' => $verified['immutable_until'] ?? null,
                'object_lock_mode' => $verified['object_lock_mode'] ?? null,
                'failure_code' => $attempt['failure_code'] ?? null,
                'next_due_at' => null,
                'outage_at' => null,
                'message' => 'Latest backup evidence has an invalid or future-dated timestamp.',
            ];
        }

        $verifiedAge = $verifiedAt === null
            ? null
            : max(0, (int) $verifiedAt->diffInSeconds(now()));
        $attemptAge = max(0, (int) $attemptAt->diffInSeconds(now()));
        $recorded = MonitoringStatus::tryFrom((string) ($attempt['status'] ?? ''))
            ?? MonitoringStatus::Outage;
        $freshness = match (true) {
            $verifiedAge === null => MonitoringStatus::Outage,
            $verifiedAge >= $outageAfter => MonitoringStatus::Outage,
            $verifiedAge >= $warningAfter => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $immutableUntil = is_string($verified['immutable_until'] ?? null)
            ? $this->parseTimestamp($verified['immutable_until'])
            : null;
        $immutability = ! (bool) config('disaster_recovery.backup.enabled', false)
            ? MonitoringStatus::Operational
            : match (true) {
                $verified === null => MonitoringStatus::Outage,
                $immutableUntil === null => MonitoringStatus::Unknown,
                $immutableUntil->lessThanOrEqualTo(now()) => MonitoringStatus::Outage,
                ! in_array(
                    strtolower((string) ($verified['object_lock_mode'] ?? '')),
                    (array) config(
                        'disaster_recovery.backup.allowed_object_lock_modes',
                        ['compliance'],
                    ),
                    true,
                ) => MonitoringStatus::Outage,
                default => MonitoringStatus::Operational,
            };
        $attestation = ! (bool) config('disaster_recovery.attestation.required', false)
            ? MonitoringStatus::Operational
            : (($verified['attested'] ?? false) === true
                && ($attempt['attested'] ?? false) === true
                && ($verified['target_matches_current'] ?? false) === true
                && ($attempt['target_matches_current'] ?? false) === true
                    ? MonitoringStatus::Operational
                    : MonitoringStatus::Outage);
        $observedRpo = is_numeric($verified['observed_rpo_seconds'] ?? null)
            ? max(0, (int) $verified['observed_rpo_seconds'])
            : null;
        $currentRpo = max(1, (int) config(
            'disaster_recovery.objectives.rpo_seconds',
            300,
        ));
        $objective = $observedRpo !== null && $observedRpo <= $currentRpo
            ? MonitoringStatus::Operational
            : MonitoringStatus::Outage;
        $status = MonitoringStatus::worst([
            $recorded,
            $freshness,
            $immutability,
            $attestation,
            $objective,
        ]);
        $expectedInterval = (int) config(
            'disaster_recovery.backup.expected_interval_seconds',
            86_400,
        );

        return [
            'configured' => true,
            'status' => $status->value,
            'storage_available' => true,
            'last_verified_at' => $verifiedAt?->toIso8601String(),
            'last_attempt_at' => $attemptAt->toIso8601String(),
            // Preserve the age of the failed attempt when no successful backup exists.
            // This lets operators distinguish a fresh explicit failure from absent telemetry.
            'age_seconds' => $verifiedAge ?? $attemptAge,
            'warning_after_seconds' => $warningAfter,
            'outage_after_seconds' => $outageAfter,
            'backup_id' => is_string($verified['backup_id'] ?? null)
                ? $verified['backup_id']
                : null,
            'size_bytes' => is_int($verified['size_bytes'] ?? null)
                ? $verified['size_bytes']
                : (is_numeric($verified['size_bytes'] ?? null) ? (int) $verified['size_bytes'] : null),
            'immutable_until' => $immutableUntil?->toIso8601String(),
            'object_lock_mode' => is_string($verified['object_lock_mode'] ?? null)
                ? $verified['object_lock_mode']
                : null,
            'observed_rpo_seconds' => $observedRpo,
            'rpo_seconds' => $currentRpo,
            'failure_code' => is_string($attempt['failure_code'] ?? null)
                ? $attempt['failure_code']
                : null,
            'next_due_at' => $verifiedAt?->addSeconds($expectedInterval)->toIso8601String(),
            'outage_at' => $verifiedAt?->addSeconds($outageAfter)->toIso8601String(),
            'message' => match ($status) {
                MonitoringStatus::Operational => 'The latest independently attested backup is inside its freshness window.',
                MonitoringStatus::Degraded => 'The verified backup is approaching its maximum age.',
                MonitoringStatus::Outage => ($attempt['evidence_type'] ?? null) === 'backup_failed'
                    ? 'The latest backup attempt failed external verification.'
                    : ($attestation === MonitoringStatus::Outage
                        ? 'The latest backup evidence lacks a current target-bound independent attestation.'
                        : ($objective === MonitoringStatus::Outage
                            ? 'The verified backup does not meet the current recovery-point objective.'
                            : 'The verified backup is stale, expired, or outside its safety boundary.')),
                default => 'Verified backup state cannot be proven.',
            },
        ];
    }

    private function parseTimestamp(string $value): ?CarbonImmutable
    {
        try {
            return CarbonImmutable::parse($value);
        } catch (Throwable) {
            return null;
        }
    }
}
