<?php

namespace App\Services\Production;

use App\Enums\MonitoringStatus;
use App\Models\RecoveryEvidence;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Support\StrictRfc3339Timestamp;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

final class RecoveryEvidenceLedger
{
    private const HEAD_KEY = 'primary';

    private const PITR_PAYLOAD_KEYS = [
        'backup_destination_id',
        'checked_at',
        'continuous',
        'dataset_id',
        'evidence_type',
        'latest_recovery_point_at',
        'operation_id',
        'primary_region',
        'provider',
        'recovery_region',
        'restorable',
        'schema_version',
        'verifier',
    ];

    private const BACKUP_PAYLOAD_KEYS = [
        'archive_readable',
        'backup_destination_id',
        'backup_id',
        'checksum_sha256',
        'checksum_verified',
        'completed_at',
        'cross_account',
        'cross_region',
        'dataset_id',
        'encrypted',
        'evidence_type',
        'immutable_until',
        'object_lock_mode',
        'offsite',
        'operation_id',
        'provider',
        'primary_region',
        'recovery_point_at',
        'recovery_region',
        'schema_version',
        'size_bytes',
        'source_snapshot_at',
        'verifier',
    ];

    private const BACKUP_FAILURE_PAYLOAD_KEYS = [
        'backup_id',
        'backup_destination_id',
        'checked_at',
        'dataset_id',
        'evidence_type',
        'failure_code',
        'operation_id',
        'provider',
        'primary_region',
        'recovery_region',
        'schema_version',
        'verifier',
    ];

    private const RESTORE_PAYLOAD_KEYS = [
        'application_smoke_verified',
        'audit_ledger_verified',
        'authorization_integrity_verified',
        'backup_destination_id',
        'backup_id',
        'booking_integrity_verified',
        'checksum_sha256',
        'completed_at',
        'content_integrity_verified',
        'database_constraints_verified',
        'dataset_id',
        'evidence_type',
        'isolation_verified',
        'membership_integrity_verified',
        'migration_state_verified',
        'operation_id',
        'payment_integrity_verified',
        'pitr_replay_verified',
        'production_access_blocked',
        'provider',
        'primary_region',
        'recovery_point_at',
        'recovery_region',
        'row_counts_verified',
        'schema_verified',
        'schema_version',
        'started_at',
        'target_environment',
        'users_integrity_verified',
        'verifier',
    ];

    public function __construct(
        private readonly RecoveryAttestationVerifier $attestations,
        private readonly RecoveryEvidenceKeyring $keyring,
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    /**
     * Import independently signed provider/verifier evidence. Direct evidence
     * methods remain available only when the attestation boundary is disabled
     * (for local development and isolated tests).
     *
     * @param  array<string, mixed>  $envelope
     */
    public function recordEnvelope(array $envelope): RecoveryEvidence
    {
        $this->assertExactKeys(
            $envelope,
            ['key_id', 'payload', 'schema_version', 'signature'],
            'recovery attestation envelope',
        );
        if (strlen($this->attestations->canonicalJson($envelope)) > min(
            262_144,
            max(16_384, (int) config(
                'disaster_recovery.attestation.maximum_envelope_bytes',
                98_304,
            )),
        )) {
            throw new InvalidArgumentException('Recovery attestation envelope exceeds the safety limit.');
        }
        if (($envelope['schema_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Unsupported recovery attestation envelope version.');
        }

        $keyId = $this->identifier($envelope['key_id'] ?? null, 'key_id', 32);
        if (! $this->attestations->isActiveKey($keyId)) {
            throw new InvalidArgumentException(
                'Recovery attestation key is not authorized for new imports.',
            );
        }
        $payload = $envelope['payload'] ?? null;
        if (! is_array($payload) || array_is_list($payload)) {
            throw new InvalidArgumentException('Recovery attestation payload must be one JSON object.');
        }
        $signature = is_string($envelope['signature'] ?? null)
            ? trim((string) $envelope['signature'])
            : '';
        $canonical = $this->attestations->canonicalJson($payload);
        if (strlen($canonical) > min(131_072, max(8_192, (int) config(
            'disaster_recovery.attestation.maximum_payload_bytes',
            65_536,
        )))) {
            throw new InvalidArgumentException('Recovery attestation payload exceeds the safety limit.');
        }
        if (! $this->attestations->verify($payload, $keyId, $signature)) {
            throw new InvalidArgumentException('Recovery attestation signature is invalid.');
        }
        if (($payload['schema_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Unsupported recovery attestation payload version.');
        }

        $type = $payload['evidence_type'] ?? null;
        if (! is_string($type)) {
            throw new InvalidArgumentException('Recovery attestation evidence_type is required.');
        }
        $this->assertAttestationIdentity($payload);
        $source = [
            'key_id' => $keyId,
            'payload' => $payload,
            'payload_hash' => hash('sha256', $canonical),
            'signature' => $signature,
        ];

        return match ($type) {
            'pitr_observation' => $this->recordPitrObservation($payload, $source),
            'backup_verified' => $this->recordBackup($payload, $source),
            'backup_failed' => $this->recordBackupFailure($payload, $source),
            'restore_drill' => $this->recordRestoreDrill($payload, $source),
            default => throw new InvalidArgumentException(
                'Unsupported recovery attestation evidence_type.',
            ),
        };
    }

    /** @param array<string, mixed> $input */
    public function recordPitrObservation(array $input, ?array $source = null): RecoveryEvidence
    {
        $this->assertRuntimeSafety('pitr', $source);
        if ($source !== null) {
            $this->assertExactKeys($input, self::PITR_PAYLOAD_KEYS, 'PITR attestation payload');
        }

        $checkedAt = $this->timestamp($input['checked_at'] ?? null, 'checked_at');
        $latestRecoveryPoint = $this->timestamp(
            $input['latest_recovery_point_at'] ?? null,
            'latest_recovery_point_at',
        );
        if ($latestRecoveryPoint->greaterThan($checkedAt)
            || $checkedAt->greaterThan(now('UTC')->addSeconds($this->clockSkew()))) {
            throw new InvalidArgumentException('PITR observation timestamps are inconsistent.');
        }

        $provider = $this->provider($input['provider'] ?? null);
        $this->targetIdentity($input['dataset_id'] ?? null, 'dataset_id', 'dataset_id');
        $this->targetIdentity(
            $input['primary_region'] ?? null,
            'primary_region',
            'primary_region',
        );
        $continuous = $this->boolean($input['continuous'] ?? null, 'continuous');
        $restorable = $this->boolean($input['restorable'] ?? null, 'restorable');
        $lag = max(0, (int) $latestRecoveryPoint->diffInSeconds($checkedAt));
        $rpo = max(1, (int) config('disaster_recovery.objectives.rpo_seconds', 300));
        $status = match (true) {
            ! $continuous || ! $restorable => MonitoringStatus::Outage,
            $lag > $rpo * 2 => MonitoringStatus::Outage,
            $lag > $rpo => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return $this->append([
            'evidence_type' => 'pitr_observation',
            'status' => $status->value,
            'operation_id' => $this->identifier(
                $input['operation_id'] ?? null,
                'operation_id',
            ),
            'backup_id' => $this->identifier(
                $input['operation_id'] ?? null,
                'operation_id',
            ),
            'provider' => $provider,
            'target_environment' => null,
            'source_snapshot_at' => null,
            'recovery_point_at' => $latestRecoveryPoint,
            'started_at' => null,
            'completed_at' => $checkedAt,
            'immutable_until' => null,
            'size_bytes' => null,
            'checksum_sha256' => str_repeat('0', 64),
            'object_lock_mode' => null,
            'observed_rpo_seconds' => $lag,
            'observed_rto_seconds' => null,
            'checks' => [
                'continuous' => $continuous,
                'restorable' => $restorable,
                'rpo_met' => $lag <= $rpo,
                'outage_boundary_met' => $lag <= $rpo * 2,
            ],
        ], $source);
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public function recordBackup(array $input, ?array $source = null): RecoveryEvidence
    {
        $this->assertRuntimeSafety('backup', $source);
        if ($source !== null) {
            $this->assertExactKeys($input, self::BACKUP_PAYLOAD_KEYS, 'backup attestation payload');
            if (! is_int($input['size_bytes'] ?? null)) {
                throw new InvalidArgumentException('size_bytes must be a JSON integer.');
            }
        }
        $completedAt = $this->timestamp($input['completed_at'] ?? null, 'completed_at');
        $recoveryPointAt = $this->timestamp(
            $input['recovery_point_at'] ?? null,
            'recovery_point_at',
        );
        $sourceSnapshotAt = $this->timestamp(
            $input['source_snapshot_at'] ?? null,
            'source_snapshot_at',
        );
        $immutableUntil = $this->timestamp(
            $input['immutable_until'] ?? null,
            'immutable_until',
        );
        $minimumRetention = max(1, (int) config(
            'disaster_recovery.backup.minimum_retention_days',
            35,
        ));
        $lockMode = strtolower(trim((string) ($input['object_lock_mode'] ?? '')));
        $allowedModes = (array) config(
            'disaster_recovery.backup.allowed_object_lock_modes',
            ['compliance'],
        );
        $rpo = max(0, (int) $recoveryPointAt->diffInSeconds($completedAt));
        $rpoTarget = max(1, (int) config(
            'disaster_recovery.objectives.rpo_seconds',
            300,
        ));
        $checks = [
            'archive_readable' => $this->boolean($input['archive_readable'] ?? null, 'archive_readable'),
            'checksum_verified' => $this->boolean($input['checksum_verified'] ?? null, 'checksum_verified'),
            'encrypted' => $this->boolean($input['encrypted'] ?? null, 'encrypted'),
            'offsite' => $this->boolean($input['offsite'] ?? null, 'offsite'),
            'cross_account_verified' => $this->boolean($input['cross_account'] ?? null, 'cross_account'),
            'cross_region_verified' => $this->boolean($input['cross_region'] ?? null, 'cross_region'),
            'object_lock_verified' => in_array($lockMode, $allowedModes, true),
            'retention_verified' => $immutableUntil->greaterThanOrEqualTo(
                $completedAt->addDays($minimumRetention),
            ),
            'rpo_met' => $rpo <= $rpoTarget,
        ];

        $artifactChecks = array_diff_key($checks, ['rpo_met' => true]);
        if (in_array(false, $artifactChecks, true)) {
            throw new InvalidArgumentException(
                'Backup evidence requires readability, checksum, encryption, cross-account off-site storage, a verified cross-region copy, and configured immutable retention.',
            );
        }
        if ($sourceSnapshotAt->greaterThan($recoveryPointAt)
            || $sourceSnapshotAt->greaterThan($completedAt)
            || $recoveryPointAt->greaterThan($completedAt)
            || $completedAt->greaterThan(now('UTC')->addSeconds($this->clockSkew()))) {
            throw new InvalidArgumentException('Backup evidence timestamps are inconsistent.');
        }

        return $this->append([
            'evidence_type' => 'backup_verified',
            'status' => $checks['rpo_met']
                ? MonitoringStatus::Operational->value
                : MonitoringStatus::Outage->value,
            'operation_id' => $this->identifier($input['operation_id'] ?? null, 'operation_id'),
            'backup_id' => $this->identifier($input['backup_id'] ?? null, 'backup_id'),
            'provider' => $this->provider($input['provider'] ?? null),
            'target_environment' => null,
            'source_snapshot_at' => $sourceSnapshotAt,
            'recovery_point_at' => $recoveryPointAt,
            'started_at' => null,
            'completed_at' => $completedAt,
            'immutable_until' => $immutableUntil,
            'size_bytes' => $this->positiveInteger($input['size_bytes'] ?? null, 'size_bytes'),
            'checksum_sha256' => $this->checksum($input['checksum_sha256'] ?? null),
            'object_lock_mode' => $lockMode,
            'observed_rpo_seconds' => $rpo,
            'observed_rto_seconds' => null,
            'checks' => $checks,
        ], $source);
    }

    /** @param array<string, mixed> $input */
    public function recordBackupFailure(array $input, ?array $source = null): RecoveryEvidence
    {
        $this->assertRuntimeSafety('backup', $source);
        if ($source !== null) {
            $this->assertExactKeys(
                $input,
                self::BACKUP_FAILURE_PAYLOAD_KEYS,
                'backup failure attestation payload',
            );
        }

        $operationId = $this->identifier($input['operation_id'] ?? null, 'operation_id');
        $backupId = trim((string) ($input['backup_id'] ?? '')) === ''
            ? $operationId
            : $this->identifier($input['backup_id'], 'backup_id');
        $checkedAt = $this->timestamp($input['checked_at'] ?? null, 'checked_at');
        if ($checkedAt->greaterThan(now('UTC')->addSeconds($this->clockSkew()))) {
            throw new InvalidArgumentException('Backup failure observation is future-dated.');
        }
        $failureCode = strtolower(trim((string) ($input['failure_code'] ?? '')));
        if (! in_array($failureCode, self::backupFailureCodes(), true)) {
            throw new InvalidArgumentException('Unsupported backup failure code.');
        }

        return $this->append([
            'evidence_type' => 'backup_failed',
            'status' => MonitoringStatus::Outage->value,
            'operation_id' => $operationId,
            'backup_id' => $backupId,
            'provider' => $this->provider($input['provider'] ?? null),
            'target_environment' => null,
            'source_snapshot_at' => null,
            'recovery_point_at' => null,
            'started_at' => null,
            'completed_at' => $checkedAt,
            'immutable_until' => null,
            'size_bytes' => null,
            // No archive exists to hash. A reserved all-zero value is explicit
            // and remains covered by the signed ledger record.
            'checksum_sha256' => str_repeat('0', 64),
            'object_lock_mode' => null,
            'observed_rpo_seconds' => null,
            'observed_rto_seconds' => null,
            'checks' => [
                'backup_succeeded' => false,
                'failure.'.$failureCode => true,
            ],
        ], $source);
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public function recordRestoreDrill(array $input, ?array $source = null): RecoveryEvidence
    {
        $this->assertRuntimeSafety('restore', $source);
        if ($source !== null) {
            $this->assertExactKeys($input, self::RESTORE_PAYLOAD_KEYS, 'restore drill attestation payload');
        }
        $startedAt = $this->timestamp($input['started_at'] ?? null, 'started_at');
        $completedAt = $this->timestamp($input['completed_at'] ?? null, 'completed_at');
        $recoveryPointAt = $this->timestamp(
            $input['recovery_point_at'] ?? null,
            'recovery_point_at',
        );
        $target = strtolower($this->identifier(
            $input['target_environment'] ?? null,
            'target_environment',
            64,
        ));
        $productionNames = ['prod', 'production', 'live', strtolower((string) config('app.env'))];

        if (in_array($target, array_unique($productionNames), true)
            || preg_match('/(?:^|[_.:-])(?:prd|prod\d*|production\w*|live\d*)(?:$|[_.:-])/i', $target) === 1) {
            throw new InvalidArgumentException('Restore evidence cannot target a production environment.');
        }
        if ($startedAt->greaterThan($completedAt)
            || $recoveryPointAt->greaterThan($startedAt)
            || $completedAt->greaterThan(now('UTC')->addSeconds($this->clockSkew()))) {
            throw new InvalidArgumentException('Restore drill timestamps are inconsistent.');
        }

        $chain = $this->verifyAndRecordHeartbeat();
        if (! $chain['valid']) {
            throw new RuntimeException(
                'Restore drill refused because the recovery evidence chain is invalid.',
            );
        }

        $backupId = $this->identifier($input['backup_id'] ?? null, 'backup_id');
        $checksum = $this->checksum($input['checksum_sha256'] ?? null);
        $backup = RecoveryEvidence::query()
            ->where('evidence_type', 'backup_verified')
            ->where('backup_id', $backupId)
            ->where('checksum_sha256', $checksum)
            ->where('status', MonitoringStatus::Operational->value)
            ->latest('sequence')
            ->first();

        if ($backup === null) {
            throw new InvalidArgumentException(
                'Restore drill must reference an existing verified immutable backup.',
            );
        }
        if ((bool) config('disaster_recovery.attestation.required', false)) {
            if ((int) ($backup->schema_version ?? 1) < 2
                || ! is_array($backup->source_payload)) {
                throw new InvalidArgumentException(
                    'Restore drill requires an independently attested source backup.',
                );
            }
            $this->assertAttestationIdentity($backup->source_payload);
        }
        if (! hash_equals((string) $backup->provider, $this->provider($input['provider'] ?? null))) {
            throw new InvalidArgumentException(
                'Restore drill provider must match the verified source backup.',
            );
        }
        $backupRecoveryPoint = CarbonImmutable::instance($backup->recovery_point_at);
        if ($recoveryPointAt->lessThan($backupRecoveryPoint)) {
            throw new InvalidArgumentException(
                'Restore recovery point cannot predate the signed source-backup evidence.',
            );
        }

        $checks = [];
        foreach ([
            'isolation_verified',
            'production_access_blocked',
            'pitr_replay_verified',
            'schema_verified',
            'row_counts_verified',
            'migration_state_verified',
            'database_constraints_verified',
            'booking_integrity_verified',
            'membership_integrity_verified',
            'payment_integrity_verified',
            'users_integrity_verified',
            'authorization_integrity_verified',
            'content_integrity_verified',
            'audit_ledger_verified',
            'application_smoke_verified',
        ] as $check) {
            $checks[$check] = $this->boolean($input[$check] ?? null, $check);
        }
        $checks['source_backup_immutable_at_start'] = $backup->immutable_until !== null
            && CarbonImmutable::instance($backup->immutable_until)->greaterThan($startedAt);

        $rpo = max(0, (int) $recoveryPointAt->diffInSeconds($startedAt));
        $rto = max(0, (int) $startedAt->diffInSeconds($completedAt));
        $rpoTarget = max(1, (int) config('disaster_recovery.objectives.rpo_seconds', 300));
        $rtoTarget = max(60, (int) config('disaster_recovery.objectives.rto_seconds', 3_600));
        $checks['rpo_met'] = $rpo <= $rpoTarget;
        $checks['rto_met'] = $rto <= $rtoTarget;
        $successful = ! in_array(false, $checks, true);

        return $this->append([
            'evidence_type' => 'restore_drill',
            'status' => $successful
                ? MonitoringStatus::Operational->value
                : MonitoringStatus::Outage->value,
            'operation_id' => $this->identifier($input['operation_id'] ?? null, 'operation_id'),
            'backup_id' => $backupId,
            'provider' => $this->provider($input['provider'] ?? null),
            'target_environment' => $target,
            'source_snapshot_at' => $backup->source_snapshot_at,
            'recovery_point_at' => $recoveryPointAt,
            'started_at' => $startedAt,
            'completed_at' => $completedAt,
            'immutable_until' => $backup->immutable_until,
            'size_bytes' => $backup->size_bytes,
            'checksum_sha256' => $checksum,
            'object_lock_mode' => $backup->object_lock_mode,
            'observed_rpo_seconds' => $rpo,
            'observed_rto_seconds' => $rto,
            'checks' => $checks,
        ], $source);
    }

    /** @return list<string> */
    public static function backupFailureCodes(): array
    {
        return [
            'archive_unreadable',
            'backup_job_failed',
            'checksum_mismatch',
            'encryption_unverified',
            'object_lock_unverified',
            'offsite_copy_failed',
            'cross_account_copy_failed',
            'cross_region_copy_failed',
            'provider_unavailable',
            'retention_unverified',
            'rpo_missed',
        ];
    }

    /**
     * Verify every record against its predecessor, content hash, signature,
     * sequence, and the independently locked chain head.
     *
     * @return array{valid:bool,total:int,last_sequence:int,failures:list<array{sequence:int,code:string}>}
     */
    public function verify(): array
    {
        // Verification must not hold the append lock while walking a ledger
        // that can live for years. Read an immutable head snapshot, verify only
        // through that sequence, then prove the head did not move. A concurrent
        // append causes a bounded retry instead of a false tamper alarm.
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $headBefore = $this->database()->table('recovery_evidence_chain_heads')
                ->where('key', self::HEAD_KEY)
                ->first();
            $snapshotSequence = $headBefore === null ? -1 : (int) $headBefore->sequence;
            $snapshotHash = $headBefore?->last_hash === null
                ? null
                : (string) $headBefore->last_hash;
            $report = $this->verifySnapshot($snapshotSequence, $snapshotHash);

            $headAfter = $this->database()->table('recovery_evidence_chain_heads')
                ->where('key', self::HEAD_KEY)
                ->first();
            $latestSequence = RecoveryEvidence::query()->max('sequence');
            $latestSequence = $latestSequence === null ? 0 : (int) $latestSequence;
            $stable = $headBefore !== null
                && $headAfter !== null
                && (int) $headAfter->sequence === $snapshotSequence
                && ($headAfter->last_hash === null ? null : (string) $headAfter->last_hash)
                    === $snapshotHash
                && $latestSequence === $snapshotSequence;

            if ($stable) {
                return $report;
            }
        }

        return [
            'valid' => false,
            'total' => 0,
            'last_sequence' => 0,
            'failures' => [[
                'sequence' => 0,
                'code' => 'chain_changed_during_verification',
            ]],
        ];
    }

    /**
     * Verify one independently attested row for monitoring presentation.
     * Full predecessor continuity and truncation detection remain the job of
     * verify(); this method proves the row's local HMAC, external signature,
     * and semantic binding without trusting a stale verification heartbeat.
     */
    public function verifyEvidenceIntegrity(RecoveryEvidence $evidence): bool
    {
        if ((int) ($evidence->schema_version ?? 1) < 2) {
            return false;
        }

        $previousHash = $evidence->previous_hash === null
            ? null
            : (string) $evidence->previous_hash;

        return $this->evidenceFailureCodes(
            $evidence,
            (int) $evidence->sequence,
            $previousHash,
        ) === [];
    }

    /** @return array{valid:bool,total:int,last_sequence:int,failures:list<array{sequence:int,code:string}>} */
    private function verifySnapshot(int $headSequence, ?string $headHash): array
    {
        $previousHash = null;
        $expectedSequence = 1;
        $total = 0;
        $failures = [];

        RecoveryEvidence::query()
            ->where('sequence', '<=', max(0, $headSequence))
            ->chunkById(250, function ($items) use (
                &$previousHash,
                &$expectedSequence,
                &$total,
                &$failures,
            ): void {
                foreach ($items as $evidence) {
                    $total++;
                    $sequence = (int) $evidence->sequence;
                    foreach ($this->evidenceFailureCodes(
                        $evidence,
                        $expectedSequence,
                        $previousHash,
                    ) as $code) {
                        $this->failure($failures, $sequence, $code);
                    }
                    $previousHash = (string) $evidence->record_hash;
                    $expectedSequence = $sequence + 1;
                }
            }, 'sequence');

        if ($headSequence < 0
            || $headSequence !== $total
            || $headHash !== $previousHash) {
            $this->failure($failures, max(0, $headSequence), 'chain_head_mismatch');
        }

        return [
            'valid' => $failures === [],
            'total' => $total,
            'last_sequence' => max(0, $headSequence),
            'failures' => $failures,
        ];
    }

    /** @return array{valid:bool,total:int,last_sequence:int,failures:list<array{sequence:int,code:string}>} */
    public function verifyAndRecordHeartbeat(): array
    {
        $report = $this->verify();
        $status = $report['valid'] ? MonitoringStatus::Operational : MonitoringStatus::Outage;

        $this->heartbeats->record(
            key: (string) config(
                'disaster_recovery.evidence.verification_heartbeat_key',
                'recovery-evidence-chain',
            ),
            category: 'recovery',
            status: $status,
            message: $report['valid']
                ? 'Recovery evidence chain verified.'
                : 'Recovery evidence chain verification failed.',
            context: [
                'total_evidence' => $report['total'],
                'last_sequence' => $report['last_sequence'],
                'failure_count' => count($report['failures']),
            ],
        );

        return $report;
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array{key_id:string,payload:array<string,mixed>,payload_hash:string,signature:string}|null  $source
     */
    private function append(array $attributes, ?array $source = null): RecoveryEvidence
    {
        $active = $this->keyring->active();
        if ($active === null) {
            throw new RuntimeException('A valid recovery evidence signing key is required.');
        }

        try {
            /** @var array{evidence:RecoveryEvidence,appended:bool} $result */
            $result = $this->database()->transaction(function () use (
                $attributes,
                $active,
                $source,
            ): array {
                $head = $this->database()->table('recovery_evidence_chain_heads')
                    ->where('key', self::HEAD_KEY)
                    ->lockForUpdate()
                    ->first();
                if ($head === null) {
                    throw new RuntimeException('Recovery evidence chain head is missing.');
                }
                $this->assertLedgerHead($head);

                $existing = RecoveryEvidence::query()
                    ->where('operation_id', (string) $attributes['operation_id'])
                    ->lockForUpdate()
                    ->first();
                if ($existing !== null) {
                    $candidateAttributes = [
                        ...$attributes,
                        'schema_version' => $source === null ? 1 : 2,
                        'source_key_id' => $source['key_id'] ?? null,
                        'source_payload' => $source['payload'] ?? null,
                        'source_payload_hash' => $source['payload_hash'] ?? null,
                        'source_signature' => $source['signature'] ?? null,
                    ];
                    $candidate = $this->canonicalBusinessPayload(
                        $candidateAttributes,
                        $attributes['checks'],
                    );
                    $stored = $this->canonicalBusinessPayload(
                        $existing->getAttributes(),
                        $existing->checks,
                    );
                    if (! hash_equals($this->canonicalJson($stored), $this->canonicalJson($candidate))) {
                        throw new InvalidArgumentException(
                            'The recovery operation ID was already used with different evidence.',
                        );
                    }

                    return ['evidence' => $existing, 'appended' => false];
                }

                $sequence = (int) $head->sequence + 1;
                $previousHash = is_string($head->last_hash) && $head->last_hash !== ''
                    ? $head->last_hash
                    : null;
                $recordedAt = CarbonImmutable::now((string) config('app.timezone', 'UTC'))
                    ->utc()
                    ->setMicrosecond(0);
                $attributes = [
                    'public_id' => (string) Str::uuid(),
                    'sequence' => $sequence,
                    'schema_version' => $source === null ? 1 : 2,
                    ...$attributes,
                    'checks' => $this->sortMap((array) $attributes['checks']),
                    'source_key_id' => $source['key_id'] ?? null,
                    'source_payload' => $source['payload'] ?? null,
                    'source_payload_hash' => $source['payload_hash'] ?? null,
                    'source_signature' => $source['signature'] ?? null,
                    'signing_key_id' => $active['id'],
                    'previous_hash' => $previousHash,
                    'recorded_at' => $recordedAt,
                ];
                $recordHash = hash(
                    'sha256',
                    ($previousHash ?? str_repeat('0', 64))."\0".$this->canonicalJson(
                        $this->canonicalPayload($attributes, $attributes['checks']),
                    ),
                );
                $attributes['record_hash'] = $recordHash;
                $attributes['signature'] = hash_hmac('sha256', $recordHash, $active['key']);

                $inserted = $this->database()->table('recovery_evidence')->insert(
                    $this->databaseAttributes($attributes),
                );
                if (! $inserted) {
                    throw new RuntimeException('Recovery evidence row could not be appended.');
                }
                $evidence = RecoveryEvidence::query()
                    ->where('sequence', $sequence)
                    ->first();
                if ($evidence === null) {
                    throw new RuntimeException('Appended recovery evidence could not be reloaded.');
                }
                $updated = $this->database()->table('recovery_evidence_chain_heads')
                    ->where('key', self::HEAD_KEY)
                    ->where('sequence', $sequence - 1)
                    ->update([
                        'sequence' => $sequence,
                        'last_hash' => $recordHash,
                        'updated_at' => now(),
                    ]);
                if ($updated !== 1) {
                    throw new RuntimeException('Recovery evidence chain head could not be advanced.');
                }

                return ['evidence' => $evidence, 'appended' => true];
            }, 3);
        } catch (InvalidArgumentException $exception) {
            throw $exception;
        } catch (\Throwable $exception) {
            $this->recordIntegrityOutage();

            throw $exception;
        }

        $evidence = $result['evidence'];

        // Bootstrap the full-chain heartbeat once. Subsequent appends validate
        // the locked tail in constant time and leave lifetime verification to
        // the hourly/release command, preventing O(n) work on every import.
        if ($result['appended'] && (int) $evidence->sequence === 1) {
            $verification = $this->verifyAndRecordHeartbeat();
            if (! $verification['valid']) {
                throw new RuntimeException('Recovery evidence chain failed bootstrap verification.');
            }
        }

        $this->recordEvidenceHeartbeat($evidence);

        // The signed head is exported through the sanitized structured log
        // path as an independent off-host truncation anchor. A logging failure
        // intentionally makes the caller retry the idempotent operation; the
        // committed evidence itself is never duplicated.
        Log::notice('recovery.evidence_anchor', [
            'public_id' => (string) $evidence->public_id,
            'sequence' => (int) $evidence->sequence,
            'evidence_type' => (string) $evidence->evidence_type,
            'status' => (string) $evidence->status,
            'record_hash' => (string) $evidence->record_hash,
            'signing_key_id' => (string) $evidence->signing_key_id,
            'recorded_at' => $this->formatTimestamp($evidence->recorded_at),
        ]);

        return $evidence;
    }

    /** @return list<string> */
    private function evidenceFailureCodes(
        RecoveryEvidence $evidence,
        int $expectedSequence,
        ?string $expectedPreviousHash,
    ): array {
        $failures = [];
        $sequence = (int) $evidence->sequence;
        $schemaVersion = (int) ($evidence->schema_version ?? 1);

        if ($sequence !== $expectedSequence) {
            $failures[] = 'sequence_gap';
        }
        if (($evidence->previous_hash ?: null) !== $expectedPreviousHash) {
            $failures[] = 'previous_hash_mismatch';
        }

        try {
            $computed = hash(
                'sha256',
                ($expectedPreviousHash ?? str_repeat('0', 64))."\0".$this->canonicalJson(
                    $this->canonicalPayload($evidence->getAttributes(), $evidence->checks),
                ),
            );
            $key = $this->keyring->key((string) $evidence->signing_key_id);
            if (! hash_equals((string) $evidence->record_hash, $computed)) {
                $failures[] = 'record_hash_mismatch';
            }
            if ($key === null || ! hash_equals(
                (string) $evidence->signature,
                hash_hmac('sha256', $computed, $key),
            )) {
                $failures[] = 'signature_mismatch';
            }
        } catch (\Throwable) {
            $failures[] = 'record_encoding_invalid';
        }

        if (! in_array($schemaVersion, [1, 2], true)) {
            $failures[] = 'unsupported_schema_version';
        } elseif ($schemaVersion === 1) {
            if ($evidence->source_key_id !== null
                || $evidence->source_payload !== null
                || $evidence->source_payload_hash !== null
                || $evidence->source_signature !== null) {
                $failures[] = 'legacy_source_fields_present';
            }
        } else {
            $sourcePayload = $evidence->source_payload;
            $sourceKeyId = (string) ($evidence->source_key_id ?? '');
            $sourceHash = (string) ($evidence->source_payload_hash ?? '');
            $sourceSignature = (string) ($evidence->source_signature ?? '');
            try {
                $sourceHashValid = is_array($sourcePayload)
                    && ! array_is_list($sourcePayload)
                    && preg_match('/\A[a-f0-9]{64}\z/', $sourceHash) === 1
                    && hash_equals($sourceHash, $this->attestations->hash($sourcePayload));
            } catch (\Throwable) {
                $sourceHashValid = false;
            }
            if (! $sourceHashValid) {
                $failures[] = 'source_payload_mismatch';
            } elseif (! $this->attestations->verify(
                $sourcePayload,
                $sourceKeyId,
                $sourceSignature,
            )) {
                $failures[] = 'source_signature_mismatch';
            } elseif (! $this->sourcePayloadMatchesEvidence($sourcePayload, $evidence)) {
                $failures[] = 'source_business_mismatch';
            }
        }

        return array_values(array_unique($failures));
    }

    private function assertLedgerHead(object $head): void
    {
        $latest = RecoveryEvidence::query()->orderByDesc('sequence')->first();
        $expectedSequence = $latest === null ? 0 : (int) $latest->sequence;
        $expectedHash = $latest?->record_hash === null ? null : (string) $latest->record_hash;
        if ((int) $head->sequence !== $expectedSequence
            || ($head->last_hash === null ? null : (string) $head->last_hash) !== $expectedHash) {
            throw new RuntimeException('Recovery evidence chain head is inconsistent.');
        }
        if ($latest === null) {
            return;
        }

        $previousHash = null;
        if ($expectedSequence > 1) {
            $previous = RecoveryEvidence::query()
                ->where('sequence', $expectedSequence - 1)
                ->first();
            if ($previous === null) {
                throw new RuntimeException('Recovery evidence chain tail is incomplete.');
            }
            $previousHash = (string) $previous->record_hash;
        }
        if ($this->evidenceFailureCodes($latest, $expectedSequence, $previousHash) !== []) {
            throw new RuntimeException('Recovery evidence chain tail failed integrity verification.');
        }
    }

    private function recordIntegrityOutage(): void
    {
        try {
            $this->heartbeats->record(
                key: (string) config(
                    'disaster_recovery.evidence.verification_heartbeat_key',
                    'recovery-evidence-chain',
                ),
                category: 'recovery',
                status: MonitoringStatus::Outage,
                message: 'Recovery evidence append was refused by an integrity or availability guard.',
            );
        } catch (\Throwable) {
            // The database may be the failed dependency. The caller and the
            // sanitized command log remain the off-host failure signals.
        }
    }

    /** @param array<string, mixed> $payload */
    private function sourcePayloadMatchesEvidence(
        array $payload,
        RecoveryEvidence $evidence,
    ): bool {
        try {
            $type = (string) $evidence->evidence_type;
            $keys = match ($type) {
                'pitr_observation' => self::PITR_PAYLOAD_KEYS,
                'backup_verified' => self::BACKUP_PAYLOAD_KEYS,
                'backup_failed' => self::BACKUP_FAILURE_PAYLOAD_KEYS,
                'restore_drill' => self::RESTORE_PAYLOAD_KEYS,
                default => null,
            };
            if ($keys === null
                || ($payload['schema_version'] ?? null) !== 1
                || ($payload['evidence_type'] ?? null) !== $type) {
                return false;
            }
            $this->assertExactKeys($payload, $keys, 'historical recovery attestation payload');
            if (! hash_equals(
                (string) $evidence->operation_id,
                $this->identifier($payload['operation_id'] ?? null, 'operation_id'),
            ) || ! hash_equals(
                (string) $evidence->provider,
                strtolower($this->identifier($payload['provider'] ?? null, 'provider', 64)),
            )) {
                return false;
            }

            return match ($type) {
                'pitr_observation' => $this->pitrSourceMatches($payload, $evidence),
                'backup_verified' => $this->backupSourceMatches($payload, $evidence),
                'backup_failed' => $this->backupFailureSourceMatches($payload, $evidence),
                'restore_drill' => $this->restoreSourceMatches($payload, $evidence),
                default => false,
            };
        } catch (\Throwable) {
            return false;
        }
    }

    /** @param array<string, mixed> $payload */
    private function pitrSourceMatches(array $payload, RecoveryEvidence $evidence): bool
    {
        $continuous = $this->boolean($payload['continuous'] ?? null, 'continuous');
        $restorable = $this->boolean($payload['restorable'] ?? null, 'restorable');
        $checkedAt = $this->timestamp($payload['checked_at'] ?? null, 'checked_at');
        $recoveryPoint = $this->timestamp(
            $payload['latest_recovery_point_at'] ?? null,
            'latest_recovery_point_at',
        );
        $lag = max(0, (int) $recoveryPoint->diffInSeconds($checkedAt));
        $checks = is_array($evidence->checks) ? $this->sortMap($evidence->checks) : [];
        $status = match (true) {
            ! $continuous || ! $restorable => MonitoringStatus::Outage,
            ($checks['outage_boundary_met'] ?? false) !== true => MonitoringStatus::Outage,
            ($checks['rpo_met'] ?? false) !== true => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return hash_equals((string) $evidence->backup_id, (string) $evidence->operation_id)
            && $this->sameTimestamp($checkedAt, $evidence->completed_at)
            && $this->sameTimestamp($recoveryPoint, $evidence->recovery_point_at)
            && $evidence->source_snapshot_at === null
            && $evidence->started_at === null
            && $evidence->immutable_until === null
            && $evidence->size_bytes === null
            && $evidence->object_lock_mode === null
            && $evidence->observed_rto_seconds === null
            && (int) $evidence->observed_rpo_seconds === $lag
            && hash_equals((string) $evidence->checksum_sha256, str_repeat('0', 64))
            && ($checks['continuous'] ?? null) === $continuous
            && ($checks['restorable'] ?? null) === $restorable
            && array_keys($checks) === [
                'continuous',
                'outage_boundary_met',
                'restorable',
                'rpo_met',
            ]
            && hash_equals((string) $evidence->status, $status->value);
    }

    /** @param array<string, mixed> $payload */
    private function backupSourceMatches(array $payload, RecoveryEvidence $evidence): bool
    {
        if (! is_int($payload['size_bytes'] ?? null)) {
            return false;
        }
        $checks = is_array($evidence->checks) ? $this->sortMap($evidence->checks) : [];
        $completedAt = $this->timestamp($payload['completed_at'] ?? null, 'completed_at');
        $recoveryPoint = $this->timestamp(
            $payload['recovery_point_at'] ?? null,
            'recovery_point_at',
        );
        $observedRpo = max(0, (int) $recoveryPoint->diffInSeconds($completedAt));
        $directChecks = [
            'archive_readable' => $this->boolean($payload['archive_readable'] ?? null, 'archive_readable'),
            'checksum_verified' => $this->boolean($payload['checksum_verified'] ?? null, 'checksum_verified'),
            'cross_account_verified' => $this->boolean($payload['cross_account'] ?? null, 'cross_account'),
            'cross_region_verified' => $this->boolean($payload['cross_region'] ?? null, 'cross_region'),
            'encrypted' => $this->boolean($payload['encrypted'] ?? null, 'encrypted'),
            'offsite' => $this->boolean($payload['offsite'] ?? null, 'offsite'),
        ];
        foreach ($directChecks as $key => $value) {
            if (($checks[$key] ?? null) !== $value) {
                return false;
            }
        }
        foreach (['object_lock_verified', 'retention_verified'] as $key) {
            if (($checks[$key] ?? false) !== true) {
                return false;
            }
        }

        return hash_equals(
            (string) $evidence->backup_id,
            $this->identifier($payload['backup_id'] ?? null, 'backup_id'),
        )
            && $this->sameTimestamp($payload['source_snapshot_at'] ?? null, $evidence->source_snapshot_at)
            && $this->sameTimestamp($recoveryPoint, $evidence->recovery_point_at)
            && $this->sameTimestamp($completedAt, $evidence->completed_at)
            && $this->sameTimestamp($payload['immutable_until'] ?? null, $evidence->immutable_until)
            && $evidence->started_at === null
            && $evidence->target_environment === null
            && (int) $evidence->size_bytes === $payload['size_bytes']
            && (int) $evidence->observed_rpo_seconds === $observedRpo
            && $evidence->observed_rto_seconds === null
            && hash_equals(
                (string) $evidence->checksum_sha256,
                $this->checksum($payload['checksum_sha256'] ?? null),
            )
            && hash_equals(
                (string) $evidence->object_lock_mode,
                strtolower(trim((string) ($payload['object_lock_mode'] ?? ''))),
            )
            && array_keys($checks) === [
                'archive_readable',
                'checksum_verified',
                'cross_account_verified',
                'cross_region_verified',
                'encrypted',
                'object_lock_verified',
                'offsite',
                'retention_verified',
                'rpo_met',
            ]
            && hash_equals(
                (string) $evidence->status,
                ($checks['rpo_met'] ?? false) === true
                    ? MonitoringStatus::Operational->value
                    : MonitoringStatus::Outage->value,
            );
    }

    /** @param array<string, mixed> $payload */
    private function backupFailureSourceMatches(array $payload, RecoveryEvidence $evidence): bool
    {
        $operationId = $this->identifier($payload['operation_id'] ?? null, 'operation_id');
        $backupId = trim((string) ($payload['backup_id'] ?? '')) === ''
            ? $operationId
            : $this->identifier($payload['backup_id'], 'backup_id');
        $failureCode = strtolower(trim((string) ($payload['failure_code'] ?? '')));
        $checks = is_array($evidence->checks) ? $this->sortMap($evidence->checks) : [];

        return in_array($failureCode, self::backupFailureCodes(), true)
            && hash_equals((string) $evidence->backup_id, $backupId)
            && $this->sameTimestamp($payload['checked_at'] ?? null, $evidence->completed_at)
            && $evidence->source_snapshot_at === null
            && $evidence->recovery_point_at === null
            && $evidence->started_at === null
            && $evidence->immutable_until === null
            && $evidence->size_bytes === null
            && $evidence->object_lock_mode === null
            && $evidence->observed_rpo_seconds === null
            && $evidence->observed_rto_seconds === null
            && hash_equals((string) $evidence->checksum_sha256, str_repeat('0', 64))
            && $checks === [
                'backup_succeeded' => false,
                'failure.'.$failureCode => true,
            ]
            && hash_equals((string) $evidence->status, MonitoringStatus::Outage->value);
    }

    /** @param array<string, mixed> $payload */
    private function restoreSourceMatches(array $payload, RecoveryEvidence $evidence): bool
    {
        $checks = is_array($evidence->checks) ? $this->sortMap($evidence->checks) : [];
        foreach ([
            'application_smoke_verified',
            'audit_ledger_verified',
            'authorization_integrity_verified',
            'booking_integrity_verified',
            'content_integrity_verified',
            'database_constraints_verified',
            'isolation_verified',
            'membership_integrity_verified',
            'migration_state_verified',
            'payment_integrity_verified',
            'pitr_replay_verified',
            'production_access_blocked',
            'row_counts_verified',
            'schema_verified',
            'users_integrity_verified',
        ] as $key) {
            if (($checks[$key] ?? null) !== $this->boolean($payload[$key] ?? null, $key)) {
                return false;
            }
        }
        $startedAt = $this->timestamp($payload['started_at'] ?? null, 'started_at');
        $completedAt = $this->timestamp($payload['completed_at'] ?? null, 'completed_at');
        $recoveryPoint = $this->timestamp(
            $payload['recovery_point_at'] ?? null,
            'recovery_point_at',
        );
        $backupId = $this->identifier($payload['backup_id'] ?? null, 'backup_id');
        $checksum = $this->checksum($payload['checksum_sha256'] ?? null);
        $backup = RecoveryEvidence::query()
            ->where('sequence', '<', (int) $evidence->sequence)
            ->where('evidence_type', 'backup_verified')
            ->where('backup_id', $backupId)
            ->where('checksum_sha256', $checksum)
            ->where('status', MonitoringStatus::Operational->value)
            ->orderByDesc('sequence')
            ->first();
        if ($backup === null) {
            return false;
        }
        $sourceImmutable = $backup->immutable_until !== null
            && CarbonImmutable::instance($backup->immutable_until)->greaterThan($startedAt);
        $observedRpo = max(0, (int) $recoveryPoint->diffInSeconds($startedAt));
        $observedRto = max(0, (int) $startedAt->diffInSeconds($completedAt));

        return hash_equals((string) $evidence->backup_id, $backupId)
            && hash_equals(
                (string) $evidence->target_environment,
                strtolower($this->identifier(
                    $payload['target_environment'] ?? null,
                    'target_environment',
                    64,
                )),
            )
            && $this->sameTimestamp($recoveryPoint, $evidence->recovery_point_at)
            && $this->sameTimestamp($startedAt, $evidence->started_at)
            && $this->sameTimestamp($completedAt, $evidence->completed_at)
            && $this->sameTimestamp($backup->source_snapshot_at, $evidence->source_snapshot_at)
            && $this->sameTimestamp($backup->immutable_until, $evidence->immutable_until)
            && (int) $evidence->size_bytes === (int) $backup->size_bytes
            && hash_equals((string) $evidence->object_lock_mode, (string) $backup->object_lock_mode)
            && hash_equals((string) $evidence->checksum_sha256, $checksum)
            && (int) $evidence->observed_rpo_seconds === $observedRpo
            && (int) $evidence->observed_rto_seconds === $observedRto
            && ($checks['source_backup_immutable_at_start'] ?? null) === $sourceImmutable
            && in_array('rpo_met', array_keys($checks), true)
            && in_array('rto_met', array_keys($checks), true)
            && count($checks) === 18
            && hash_equals(
                (string) $evidence->status,
                in_array(false, $checks, true)
                    ? MonitoringStatus::Outage->value
                    : MonitoringStatus::Operational->value,
            );
    }

    private function sameTimestamp(mixed $source, mixed $stored): bool
    {
        if ($source === null || $stored === null) {
            return $source === null && $stored === null;
        }

        $sourceAt = $source instanceof CarbonInterface
            ? CarbonImmutable::instance($source)->utc()->setMicrosecond(0)
            : $this->timestamp($source, 'source_timestamp');
        $storedAt = $stored instanceof CarbonInterface
            ? CarbonImmutable::instance($stored)->utc()->setMicrosecond(0)
            : CarbonImmutable::parse((string) $stored)->utc()->setMicrosecond(0);

        return $sourceAt->equalTo($storedAt);
    }

    private function recordEvidenceHeartbeat(RecoveryEvidence $evidence): void
    {
        $type = (string) $evidence->evidence_type;
        $isBackup = in_array(
            $type,
            ['backup_verified', 'backup_failed'],
            true,
        );
        $isPitr = $type === 'pitr_observation';
        $sourcePayload = is_array($evidence->source_payload)
            ? $evidence->source_payload
            : [];
        $context = match ($type) {
            'pitr_observation' => [
                'provider' => (string) $evidence->provider,
                'dataset_id' => $sourcePayload['dataset_id']
                    ?? config('disaster_recovery.target.dataset_id'),
                'primary_region' => $sourcePayload['primary_region']
                    ?? config('disaster_recovery.target.primary_region'),
                'evidence_sequence' => (int) $evidence->sequence,
                'latest_recovery_point_at' => $this->formatTimestamp(
                    $evidence->recovery_point_at,
                ),
                'provider_checked_at' => $this->formatTimestamp($evidence->completed_at),
                'lag_seconds' => $evidence->observed_rpo_seconds,
                'rpo_seconds' => (int) config(
                    'disaster_recovery.objectives.rpo_seconds',
                    300,
                ),
                'continuous' => (bool) data_get(
                    $evidence->checks,
                    'continuous',
                    false,
                ),
                'restorable' => (bool) data_get(
                    $evidence->checks,
                    'restorable',
                    false,
                ),
                'attested' => (int) ($evidence->schema_version ?? 1) >= 2,
            ],
            'backup_verified', 'backup_failed' => [
                'provider' => (string) $evidence->provider,
                'backup_id' => (string) $evidence->backup_id,
                'evidence_sequence' => (int) $evidence->sequence,
                'size_bytes' => $evidence->size_bytes,
                'checksum_fingerprint' => substr(
                    (string) $evidence->checksum_sha256,
                    0,
                    16,
                ),
                'recovery_point_at' => $this->formatTimestamp(
                    $evidence->recovery_point_at,
                ),
                'immutable_until' => $this->formatTimestamp($evidence->immutable_until),
                'object_lock_mode' => $evidence->object_lock_mode,
                'cross_account_verified' => (bool) data_get(
                    $evidence->checks,
                    'cross_account_verified',
                    false,
                ),
                'cross_region_verified' => (bool) data_get(
                    $evidence->checks,
                    'cross_region_verified',
                    false,
                ),
                'observed_rpo_seconds' => $evidence->observed_rpo_seconds,
                'evidence_type' => $type,
                'failure_code' => $this->failureCode($evidence->checks),
                'attested' => (int) ($evidence->schema_version ?? 1) >= 2,
            ],
            default => [
                'provider' => (string) $evidence->provider,
                'backup_id' => (string) $evidence->backup_id,
                'evidence_sequence' => (int) $evidence->sequence,
                'checksum_fingerprint' => substr(
                    (string) $evidence->checksum_sha256,
                    0,
                    16,
                ),
                'recovery_point_at' => $this->formatTimestamp(
                    $evidence->recovery_point_at,
                ),
                'isolation_verified' => (bool) data_get(
                    $evidence->checks,
                    'isolation_verified',
                    false,
                ),
                'production_access_blocked' => (bool) data_get(
                    $evidence->checks,
                    'production_access_blocked',
                    false,
                ),
                'observed_rpo_seconds' => $evidence->observed_rpo_seconds,
                'observed_rto_seconds' => $evidence->observed_rto_seconds,
                'target_environment' => $evidence->target_environment,
                'evidence_type' => $type,
                'attested' => (int) ($evidence->schema_version ?? 1) >= 2,
            ],
        };
        $this->heartbeats->record(
            key: match (true) {
                $isBackup => (string) config(
                    'monitoring.backup.heartbeat_key',
                    'verified-backup',
                ),
                $isPitr => (string) config(
                    'disaster_recovery.pitr.heartbeat_key',
                    'pitr-capability',
                ),
                default => (string) config(
                    'disaster_recovery.restore_drill.heartbeat_key',
                    'restore-drill',
                ),
            },
            category: $isBackup ? 'backup' : 'recovery',
            status: MonitoringStatus::tryFrom((string) $evidence->status)
                ?? MonitoringStatus::Unknown,
            message: match ((string) $evidence->evidence_type) {
                'pitr_observation' => $evidence->status === MonitoringStatus::Operational->value
                    ? 'Provider PITR recovery point is inside the RPO.'
                    : 'Provider PITR recovery point is outside its safe boundary.',
                'backup_verified' => $evidence->status === MonitoringStatus::Operational->value
                    ? 'Immutable off-site backup verified inside the recovery objective.'
                    : 'Immutable off-site backup missed the recovery objective.',
                'backup_failed' => 'Immutable off-site backup verification failed.',
                default => $evidence->status === MonitoringStatus::Operational->value
                    ? 'Isolated database restore drill passed.'
                    : 'Isolated database restore drill failed.',
            },
            context: $context,
            observedAt: $evidence->completed_at,
        );
    }

    /** @param array<string, mixed> $attributes */
    private function canonicalPayload(array $attributes, mixed $checks): array
    {
        $payload = [
            'public_id' => (string) ($attributes['public_id'] ?? ''),
            'sequence' => (int) ($attributes['sequence'] ?? 0),
            'evidence_type' => (string) ($attributes['evidence_type'] ?? ''),
            'status' => (string) ($attributes['status'] ?? ''),
            'operation_id' => (string) ($attributes['operation_id'] ?? ''),
            'backup_id' => (string) ($attributes['backup_id'] ?? ''),
            'provider' => (string) ($attributes['provider'] ?? ''),
            'target_environment' => $attributes['target_environment'] ?? null,
            'source_snapshot_at' => $this->formatTimestamp($attributes['source_snapshot_at'] ?? null),
            'recovery_point_at' => $this->formatTimestamp($attributes['recovery_point_at'] ?? null),
            'started_at' => $this->formatTimestamp($attributes['started_at'] ?? null),
            'completed_at' => $this->formatTimestamp($attributes['completed_at'] ?? null),
            'immutable_until' => $this->formatTimestamp($attributes['immutable_until'] ?? null),
            'size_bytes' => isset($attributes['size_bytes']) ? (int) $attributes['size_bytes'] : null,
            'checksum_sha256' => (string) ($attributes['checksum_sha256'] ?? ''),
            'object_lock_mode' => $attributes['object_lock_mode'] ?? null,
            'observed_rpo_seconds' => isset($attributes['observed_rpo_seconds'])
                ? (int) $attributes['observed_rpo_seconds']
                : null,
            'observed_rto_seconds' => isset($attributes['observed_rto_seconds'])
                ? (int) $attributes['observed_rto_seconds']
                : null,
            'checks' => $this->sortMap(is_array($checks) ? $checks : []),
            'signing_key_id' => (string) ($attributes['signing_key_id'] ?? ''),
            'previous_hash' => $attributes['previous_hash'] ?? null,
            'recorded_at' => $this->formatTimestamp($attributes['recorded_at'] ?? null),
        ];

        if ((int) ($attributes['schema_version'] ?? 1) >= 2) {
            $sourcePayload = $attributes['source_payload'] ?? null;
            if (is_string($sourcePayload)) {
                try {
                    $sourcePayload = json_decode(
                        $sourcePayload,
                        true,
                        32,
                        JSON_THROW_ON_ERROR,
                    );
                } catch (\Throwable) {
                    $sourcePayload = null;
                }
            }
            $payload = [
                'schema_version' => (int) ($attributes['schema_version'] ?? 0),
                ...$payload,
                'source_key_id' => $attributes['source_key_id'] ?? null,
                'source_payload' => is_array($sourcePayload)
                    ? $sourcePayload
                    : null,
                'source_payload_hash' => $attributes['source_payload_hash'] ?? null,
                'source_signature' => $attributes['source_signature'] ?? null,
            ];
        }

        return $payload;
    }

    /** @param array<string, mixed> $attributes */
    private function canonicalBusinessPayload(array $attributes, mixed $checks): array
    {
        $payload = $this->canonicalPayload($attributes, $checks);

        foreach ([
            'public_id',
            'sequence',
            'schema_version',
            'signing_key_id',
            'previous_hash',
            'recorded_at',
            // ECDSA legitimately produces different bytes when the same key
            // signs the same payload again. The verified canonical payload
            // and source key define idempotency; the first valid signature
            // remains preserved in the append-only record.
            'source_signature',
        ] as $key) {
            unset($payload[$key]);
        }

        return $payload;
    }

    private function canonicalJson(array $payload): string
    {
        return json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
    }

    /** @param array<string, mixed> $attributes */
    private function databaseAttributes(array $attributes): array
    {
        foreach ([
            'source_snapshot_at',
            'recovery_point_at',
            'started_at',
            'completed_at',
            'immutable_until',
            'recorded_at',
        ] as $key) {
            $attributes[$key] = isset($attributes[$key]) && $attributes[$key] !== null
                ? CarbonImmutable::instance($attributes[$key])->utc()->format('Y-m-d H:i:s')
                : null;
        }
        $attributes['checks'] = json_encode(
            $attributes['checks'],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
        $attributes['source_payload'] = is_array($attributes['source_payload'] ?? null)
            ? json_encode(
                $attributes['source_payload'],
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            )
            : null;

        return $attributes;
    }

    /** @param array<string, mixed> $payload */
    private function assertAttestationIdentity(array $payload): void
    {
        $this->provider($payload['provider'] ?? null);
        foreach ([
            'dataset_id' => 'dataset_id',
            'verifier' => 'independent_verifier',
            'backup_destination_id' => 'backup_destination_id',
            'primary_region' => 'primary_region',
            'recovery_region' => 'recovery_region',
        ] as $payloadKey => $targetKey) {
            $this->targetIdentity($payload[$payloadKey] ?? null, $payloadKey, $targetKey);
        }
    }

    private function targetIdentity(mixed $value, string $field, string $targetKey): string
    {
        $actual = strtolower($this->identifier($value, $field, 64));
        $expected = strtolower(trim((string) config(
            'disaster_recovery.target.'.$targetKey,
            '',
        )));
        if ($expected === '' || ! hash_equals($expected, $actual)) {
            throw new InvalidArgumentException(
                "Recovery attestation {$field} does not match the configured recovery target.",
            );
        }

        return $actual;
    }

    /** @param list<string> $expected */
    private function assertExactKeys(array $value, array $expected, string $label): void
    {
        $actual = array_keys($value);
        sort($actual, SORT_STRING);
        sort($expected, SORT_STRING);
        if ($actual !== $expected) {
            throw new InvalidArgumentException("{$label} has missing or unexpected fields.");
        }
    }

    /**
     * @param  array{key_id:string,payload:array<string,mixed>,payload_hash:string,signature:string}|null  $source
     */
    private function assertRuntimeSafety(string $operation, ?array $source): void
    {
        if ($operation === 'backup'
            && (! (bool) config('disaster_recovery.backup.enabled', false)
                || ! (bool) config('monitoring.backup.enabled', false))) {
            throw new RuntimeException('Recovery backup evidence ingestion is disabled.');
        }
        if ($operation === 'pitr'
            && (! (bool) config('disaster_recovery.pitr.enabled', false)
                || ! (bool) config('disaster_recovery.pitr.observation_enabled', false))) {
            throw new RuntimeException('Recovery PITR evidence ingestion is disabled.');
        }
        if ($operation === 'restore'
            && ! (bool) config('disaster_recovery.restore_drill.enabled', false)) {
            throw new RuntimeException('Recovery restore-drill evidence ingestion is disabled.');
        }
        if ((bool) config('disaster_recovery.attestation.required', false) && $source === null) {
            throw new RuntimeException(
                'Independently signed recovery attestation is required in this environment.',
            );
        }
    }

    private function clockSkew(): int
    {
        return min(900, max(0, (int) config(
            'disaster_recovery.attestation.maximum_clock_skew_seconds',
            300,
        )));
    }

    private function failureCode(mixed $checks): ?string
    {
        if (! is_array($checks)) {
            return null;
        }
        foreach (array_keys($checks) as $key) {
            if (is_string($key) && str_starts_with($key, 'failure.')) {
                return substr($key, 8);
            }
        }

        return null;
    }

    /** @return array<string, bool> */
    private function sortMap(array $checks): array
    {
        $normalized = [];
        foreach ($checks as $key => $value) {
            if (is_string($key) && preg_match('/^[a-z0-9_.-]{1,64}$/', $key) === 1) {
                $normalized[$key] = $value === true;
            }
        }
        ksort($normalized);

        return $normalized;
    }

    private function timestamp(mixed $value, string $field): CarbonImmutable
    {
        if ($value instanceof CarbonInterface) {
            return CarbonImmutable::instance($value)
                ->utc()
                ->setMicrosecond(0);
        }
        $timestamp = StrictRfc3339Timestamp::parse($value);
        if ($timestamp === null) {
            throw new InvalidArgumentException(
                "{$field} must be a real RFC3339 timestamp with an explicit, valid offset.",
            );
        }

        return $timestamp;
    }

    private function formatTimestamp(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $timestamp = $value instanceof CarbonInterface
            ? CarbonImmutable::instance($value)
            : (preg_match('/\A\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\z/', (string) $value) === 1
                ? CarbonImmutable::createFromFormat('!Y-m-d H:i:s', (string) $value, 'UTC')
                : CarbonImmutable::parse((string) $value));
        if ($timestamp === false) {
            throw new InvalidArgumentException('Recovery evidence contains an invalid timestamp.');
        }

        return $timestamp->utc()->setMicrosecond(0)->format('Y-m-d\TH:i:s\Z');
    }

    private function identifier(mixed $value, string $field, int $maximum = 100): string
    {
        $value = is_string($value) ? trim($value) : '';
        if (strlen($value) > $maximum
            || preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/', $value) !== 1) {
            throw new InvalidArgumentException("{$field} is invalid.");
        }

        return $value;
    }

    private function provider(mixed $value): string
    {
        $provider = strtolower($this->identifier($value, 'provider', 64));
        $expected = strtolower(trim((string) config(
            'disaster_recovery.target.provider',
            '',
        )));
        if ($expected !== '' && ! hash_equals($expected, $provider)) {
            throw new InvalidArgumentException(
                'Recovery evidence provider does not match the configured recovery provider.',
            );
        }

        return $provider;
    }

    private function checksum(mixed $value): string
    {
        $value = strtolower(trim((string) $value));
        if (preg_match('/^[a-f0-9]{64}$/', $value) !== 1) {
            throw new InvalidArgumentException('checksum_sha256 must contain exactly 64 hexadecimal characters.');
        }

        return $value;
    }

    private function positiveInteger(mixed $value, string $field): int
    {
        $validated = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($validated === false) {
            throw new InvalidArgumentException("{$field} must be a positive integer.");
        }

        return (int) $validated;
    }

    private function boolean(mixed $value, string $field): bool
    {
        if (! is_bool($value)) {
            throw new InvalidArgumentException("{$field} must be boolean.");
        }

        return $value;
    }

    /** @param list<array{sequence:int,code:string}> $failures */
    private function failure(array &$failures, int $sequence, string $code): void
    {
        if (count($failures) < 20) {
            $failures[] = compact('sequence', 'code');
        }
    }

    private function database(): ConnectionInterface
    {
        return DB::connection();
    }
}
