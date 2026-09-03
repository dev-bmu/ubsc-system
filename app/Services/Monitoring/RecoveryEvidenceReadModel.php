<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\RecoveryEvidence;
use App\Services\Production\RecoveryEvidenceLedger;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Throwable;

final class RecoveryEvidenceReadModel
{
    public function __construct(private readonly RecoveryEvidenceLedger $ledger) {}

    /** @return array<string, mixed> */
    public function summary(int $limit = 12): array
    {
        $limit = min(24, max(1, $limit));

        try {
            $items = RecoveryEvidence::query()
                ->orderByDesc('sequence')
                ->limit($limit)
                ->get();
            $latestVerified = RecoveryEvidence::query()
                ->where('evidence_type', 'backup_verified')
                ->where('status', MonitoringStatus::Operational->value)
                ->orderByDesc('completed_at')
                ->orderByDesc('sequence')
                ->first();
            $latestBackupAttempt = RecoveryEvidence::query()
                ->whereIn('evidence_type', ['backup_verified', 'backup_failed'])
                ->orderByDesc('completed_at')
                // A failure wins an exact timestamp tie; ingestion order must
                // never let a replayed success hide a concurrent failure.
                ->orderByRaw(
                    'CASE WHEN evidence_type = ? THEN 1 ELSE 0 END DESC',
                    ['backup_failed'],
                )
                ->orderByDesc('sequence')
                ->first();
            $latestRestore = RecoveryEvidence::query()
                ->where('evidence_type', 'restore_drill')
                ->orderByDesc('completed_at')
                ->orderByRaw($this->statusSeveritySql())
                ->orderByDesc('sequence')
                ->first();
            $latestPitr = RecoveryEvidence::query()
                ->where('evidence_type', 'pitr_observation')
                ->orderByDesc('completed_at')
                ->orderByRaw($this->statusSeveritySql())
                ->orderByDesc('sequence')
                ->first();
            $head = DB::table('recovery_evidence_chain_heads')
                ->where('key', 'primary')
                ->first(['sequence', 'last_hash']);
            $latest = $items->first();
            $expectedSequence = $latest instanceof RecoveryEvidence
                ? (int) $latest->sequence
                : 0;
            $expectedHash = $latest instanceof RecoveryEvidence
                ? (string) $latest->record_hash
                : null;
            $headHash = $head?->last_hash === null
                ? null
                : (string) $head->last_hash;
            $headConsistent = $head !== null
                && (int) $head->sequence === $expectedSequence
                && (($headHash === null && $expectedHash === null)
                    || (is_string($headHash)
                        && is_string($expectedHash)
                        && hash_equals($expectedHash, $headHash)));

            return [
                'available' => $headConsistent,
                'head_consistent' => $headConsistent,
                'head_sequence' => $head !== null ? (int) $head->sequence : null,
                'head_fingerprint' => $head !== null && is_string($head->last_hash)
                    ? substr($head->last_hash, 0, 16)
                    : null,
                'latest_verified_backup' => $this->item($latestVerified),
                'latest_backup_attempt' => $this->item($latestBackupAttempt),
                'latest_restore_drill' => $this->item($latestRestore),
                'latest_pitr_observation' => $this->item($latestPitr),
                'items' => $items->map(fn (RecoveryEvidence $item): array => $this->item($item))
                    ->values()
                    ->all(),
                'message' => match (true) {
                    $head === null => 'Recovery evidence chain head is unavailable.',
                    ! $headConsistent => 'Recovery evidence chain head does not match its immutable tail.',
                    default => 'Recovery evidence storage is readable and its head matches the latest record.',
                },
            ];
        } catch (Throwable) {
            return [
                'available' => false,
                'head_consistent' => false,
                'head_sequence' => null,
                'head_fingerprint' => null,
                'latest_verified_backup' => null,
                'latest_backup_attempt' => null,
                'latest_restore_drill' => null,
                'latest_pitr_observation' => null,
                'items' => [],
                'message' => 'Recovery evidence storage could not be read.',
            ];
        }
    }

    /** @return array<string, mixed>|null */
    private function item(?RecoveryEvidence $evidence): ?array
    {
        if ($evidence === null) {
            return null;
        }
        $checks = is_array($evidence->checks) ? $evidence->checks : [];
        $attested = $this->attested($evidence);
        $failedChecks = [];
        $failureCode = null;
        foreach ($checks as $key => $passed) {
            if (! is_string($key)) {
                continue;
            }
            if (str_starts_with($key, 'failure.') && $passed === true) {
                $failureCode = substr($key, 8);
            } elseif ($passed !== true && count($failedChecks) < 16) {
                $failedChecks[] = $key;
            }
        }

        return [
            'public_id' => (string) $evidence->public_id,
            'sequence' => (int) $evidence->sequence,
            'schema_version' => (int) ($evidence->schema_version ?? 1),
            'evidence_type' => (string) $evidence->evidence_type,
            'status' => (string) $evidence->status,
            'operation_id' => (string) $evidence->operation_id,
            'backup_id' => (string) $evidence->backup_id,
            'provider' => (string) $evidence->provider,
            'target_environment' => $evidence->target_environment,
            'source_snapshot_at' => $this->timestamp($evidence->source_snapshot_at),
            'recovery_point_at' => $this->timestamp($evidence->recovery_point_at),
            'started_at' => $this->timestamp($evidence->started_at),
            'completed_at' => $this->timestamp($evidence->completed_at),
            'immutable_until' => $this->timestamp($evidence->immutable_until),
            'recorded_at' => $this->timestamp($evidence->recorded_at),
            'size_bytes' => $evidence->size_bytes !== null ? (int) $evidence->size_bytes : null,
            'object_lock_mode' => $evidence->object_lock_mode,
            'observed_rpo_seconds' => $evidence->observed_rpo_seconds !== null
                ? (int) $evidence->observed_rpo_seconds
                : null,
            'observed_rto_seconds' => $evidence->observed_rto_seconds !== null
                ? (int) $evidence->observed_rto_seconds
                : null,
            'attested' => $attested,
            'target_matches_current' => $attested && $this->targetMatches($evidence),
            'source_key_id' => $evidence->source_key_id,
            'checks_total' => count($checks),
            'checks_passed' => count(array_filter(
                $checks,
                static fn (mixed $passed): bool => $passed === true,
            )),
            'failed_checks' => $failedChecks,
            'failure_code' => $failureCode,
            'continuous' => ($checks['continuous'] ?? false) === true,
            'restorable' => ($checks['restorable'] ?? false) === true,
        ];
    }

    private function timestamp(mixed $value): ?string
    {
        return $value instanceof CarbonInterface
            ? $value->utc()->toIso8601String()
            : null;
    }

    private function targetMatches(RecoveryEvidence $evidence): bool
    {
        $payload = is_array($evidence->source_payload)
            ? $evidence->source_payload
            : null;
        if ((int) ($evidence->schema_version ?? 1) < 2 || $payload === null) {
            return false;
        }

        foreach ([
            'provider' => 'provider',
            'dataset_id' => 'dataset_id',
            'verifier' => 'independent_verifier',
            'backup_destination_id' => 'backup_destination_id',
            'primary_region' => 'primary_region',
            'recovery_region' => 'recovery_region',
        ] as $payloadKey => $targetKey) {
            $actual = is_string($payload[$payloadKey] ?? null)
                ? strtolower(trim($payload[$payloadKey]))
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

    private function attested(RecoveryEvidence $evidence): bool
    {
        try {
            return $this->ledger->verifyEvidenceIntegrity($evidence);
        } catch (Throwable) {
            return false;
        }
    }

    private function statusSeveritySql(): string
    {
        return "CASE status WHEN 'outage' THEN 3 WHEN 'degraded' THEN 2 WHEN 'unknown' THEN 1 ELSE 0 END DESC";
    }
}
