<?php

namespace App\Services\Production;

use App\Enums\MonitoringStatus;
use App\Models\DatabaseReplicationEvent;
use App\Models\DatabaseReplicationState;
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
use Throwable;

final class DatabaseReplicationControlPlane
{
    private const STATE_KEY = 'primary';

    /**
     * These invariants describe whether accepting another application write
     * is safe right now. Redundancy and recovery signals such as replica lag,
     * replica count, GTID, or automatic failover remain incident signals: a
     * healthy writer must keep serving when only standby capacity is degraded.
     */
    private const WRITE_SAFETY_CHECKS = [
        'single_writer',
        'writer_writable',
        'quorum_healthy',
        'stale_writers_fenced',
        'replicas_read_only',
    ];

    private const PAYLOAD_KEYS = [
        'schema_version',
        'event_type',
        'operation_id',
        'provider',
        'observer',
        'cluster_id',
        'dataset_id',
        'environment',
        'primary_region',
        'writer_endpoint_id',
        'reader_endpoint_id',
        'writer_instance_id',
        'previous_writer_instance_id',
        'topology_epoch',
        'observed_at',
        'replica_count',
        'healthy_replica_count',
        'synchronous_replica_count',
        'maximum_replica_lag_ms',
        'single_writer',
        'writer_writable',
        'quorum_healthy',
        'stale_writers_fenced',
        'replicas_read_only',
        'gtid_enabled',
        'row_binlog',
        'automatic_failover',
        'cross_az',
        'reader_endpoint_healthy',
        'promotion_caught_up',
        'data_loss_bytes',
        'change_reference',
    ];

    private const SOURCE_EVENT_TYPES = [
        'topology_observation',
        'failover_completed',
        'failover_failed',
        'failback_completed',
        'drill_completed',
    ];

    public function __construct(
        private readonly DatabaseReplicationAttestationVerifier $attestations,
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    /**
     * Verify a fresh provider envelope without requiring control-plane tables.
     * This is reserved for the first migration that introduces those tables.
     *
     * @param  array<string, mixed>  $envelope
     * @return array{status:string,topology_epoch:int,observed_at:string,checks:array<string,bool>}
     */
    public function inspectEnvelope(array $envelope): array
    {
        $this->assertRuntimeSafety();
        $source = $this->verifiedEnvelope($envelope);
        $payload = $source['payload'];
        $checks = $this->checks($payload);

        return [
            'status' => $this->status($payload, $checks)->value,
            'topology_epoch' => (int) $payload['topology_epoch'],
            'observed_at' => $this->timestamp(
                $payload['observed_at'],
                'observed_at',
            )->toIso8601String(),
            'checks' => $checks,
        ];
    }

    /**
     * Identify only a never-initialized control plane. This supports recovery
     * from a process dying after table creation but before Laravel records the
     * first migration/import; any state, event, extra head, or advanced head
     * makes bootstrap permanently ineligible.
     */
    public function isPristine(): bool
    {
        try {
            $head = DB::table('database_replication_event_chain_heads')
                ->where('key', self::STATE_KEY)
                ->first();

            return DatabaseReplicationState::query()->count() === 0
                && DB::table('database_replication_events')->count() === 0
                && DB::table('database_replication_event_chain_heads')->count() === 1
                && $head !== null
                && (int) $head->sequence === 0
                && $head->last_hash === null;
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * @param  array<string, mixed>  $envelope
     * @return array{state:DatabaseReplicationState,event:?DatabaseReplicationEvent,accepted:bool}
     */
    public function recordEnvelope(array $envelope): array
    {
        $this->assertRuntimeSafety();
        $source = $this->verifiedEnvelope($envelope);
        $payload = $source['payload'];
        $observedAt = $this->timestamp($payload['observed_at'], 'observed_at');

        /** @var array{state:DatabaseReplicationState,event:?DatabaseReplicationEvent,accepted:bool} $result */
        $result = $this->database()->transaction(function () use (
            $source,
            $payload,
            $observedAt,
        ): array {
            // Laravel may retry this closure after a deadlock. Keep every
            // attempt self-contained so an event object created by a rolled
            // back attempt can never leak into the successful result/log.
            $event = null;

            $head = DB::table('database_replication_event_chain_heads')
                ->where('key', self::STATE_KEY)
                ->lockForUpdate()
                ->first();
            if ($head === null) {
                throw new RuntimeException('Database replication event chain head is unavailable.');
            }
            $this->assertLedgerHead($head);

            /** @var DatabaseReplicationState|null $current */
            $current = DatabaseReplicationState::query()
                ->whereKey(self::STATE_KEY)
                ->lockForUpdate()
                ->first();

            if ($current === null) {
                if ((int) $head->sequence !== 0
                    || $head->last_hash !== null
                    || DatabaseReplicationState::query()->exists()) {
                    throw new RuntimeException(
                        'Database replication state is missing from an initialized control plane.',
                    );
                }
            } elseif (! $this->verifyCurrentState()['valid']) {
                // A fresh signed observation must not silently overwrite a
                // tampered or internally inconsistent mutable state. Preserve
                // the ledger and require an explicit incident investigation.
                throw new RuntimeException(
                    'Existing database replication state failed integrity verification.',
                );
            }

            $currentAt = null;
            if ($current !== null) {
                $currentAt = CarbonImmutable::instance($current->observed_at)
                    ->utc()
                    ->setMicrosecond(0);
            }

            $epoch = (int) $payload['topology_epoch'];
            $writer = (string) $payload['writer_instance_id'];
            $controlFailure = null;
            $conflictingWriter = null;
            if ($current !== null && $epoch < (int) $current->topology_epoch) {
                $controlFailure = 'topology_epoch_regression';
            } elseif ($current !== null
                && $epoch === (int) $current->topology_epoch
                && ! hash_equals((string) $current->writer_instance_id, $writer)) {
                $controlFailure = 'split_brain_writer_conflict';
                $conflictingWriter = $writer;
            }

            if ($current !== null && $currentAt instanceof CarbonImmutable) {
                // A delayed normal observation cannot regress current state.
                // A second writer in the same epoch is different: even an
                // older signed observation proves a historical split brain and
                // must be fenced until a newer epoch resolves authority.
                if ($observedAt->lessThan($currentAt)
                    && $controlFailure !== 'split_brain_writer_conflict') {
                    return ['state' => $current, 'event' => null, 'accepted' => false];
                }
                if ($observedAt->equalTo($currentAt)) {
                    if (hash_equals(
                        (string) $current->source_payload_hash,
                        $source['payload_hash'],
                    )) {
                        return ['state' => $current, 'event' => null, 'accepted' => false];
                    }
                    if ($controlFailure === null) {
                        throw new InvalidArgumentException(
                            'A replication observation timestamp cannot identify two payloads.',
                        );
                    }
                }
            }

            if ($current !== null
                && $current->control_failure_code !== null
                && $epoch <= (int) $current->topology_epoch) {
                if ($controlFailure === null
                    || $this->repeatsCurrentControlFailure(
                        $current,
                        $head,
                        $payload,
                        $controlFailure,
                    )) {
                    // Split-brain and epoch-regression markers may be cleared
                    // only by a newer provider epoch. Repeated evidence is
                    // deliberately coalesced so a prolonged incident cannot
                    // turn the sparse transition ledger into telemetry spam.
                    return ['state' => $current, 'event' => null, 'accepted' => false];
                }
            }

            if ($controlFailure !== null) {
                $event = $this->appendEvent(
                    $head,
                    $source,
                    $payload,
                    $controlFailure === 'topology_epoch_regression'
                        ? 'topology_epoch_regression'
                        : 'split_brain_detected',
                    MonitoringStatus::Outage,
                    $this->checks($payload),
                    $observedAt,
                );
                DB::table('database_replication_states')
                    ->where('key', self::STATE_KEY)
                    ->update([
                        'status' => MonitoringStatus::Outage->value,
                        'control_failure_code' => $controlFailure,
                        'conflicting_writer_instance_id' => $conflictingWriter,
                        'last_failure_at' => $observedAt->format('Y-m-d H:i:s'),
                        'updated_at' => now(),
                    ]);

                return [
                    'state' => DatabaseReplicationState::query()->findOrFail(self::STATE_KEY),
                    'event' => $event,
                    'accepted' => false,
                ];
            }

            $this->assertWriterTransition($current, $payload);
            $checks = $this->checks($payload);
            $status = $this->status($payload, $checks);
            $derivedEventType = $this->derivedEventType($current, $payload, $status);
            if ($derivedEventType !== null) {
                $event = $this->appendEvent(
                    $head,
                    $source,
                    $payload,
                    $derivedEventType,
                    $status,
                    $checks,
                    $observedAt,
                );
            }

            $stateAttributes = $this->stateAttributes(
                $source,
                $payload,
                $checks,
                $status,
                $observedAt,
                $current,
            );
            if ($current === null) {
                DB::table('database_replication_states')->insert([
                    'key' => self::STATE_KEY,
                    ...$stateAttributes,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('database_replication_states')
                    ->where('key', self::STATE_KEY)
                    ->update([...$stateAttributes, 'updated_at' => now()]);
            }

            return [
                'state' => DatabaseReplicationState::query()->findOrFail(self::STATE_KEY),
                'event' => $event,
                'accepted' => true,
            ];
        }, 5);

        $this->recordHeartbeat($result['state']);
        if ($result['event'] !== null) {
            Log::notice('database_replication.event_anchor', [
                'public_id' => (string) $result['event']->public_id,
                'sequence' => (int) $result['event']->sequence,
                'event_type' => (string) $result['event']->event_type,
                'status' => (string) $result['event']->status,
                'topology_epoch' => (int) $result['event']->topology_epoch,
                'record_hash' => (string) $result['event']->record_hash,
                'recorded_at' => $this->formatTimestamp($result['event']->recorded_at),
            ]);
        }

        return $result;
    }

    /** @return array{valid:bool,event_count:int,head_sequence:int,head_hash:?string,failures:list<array{sequence:int,code:string}>} */
    public function verifyLedger(): array
    {
        // A transition may be appended while the hourly verifier is walking
        // the chain. Verify an optimistic, immutable head snapshot and retry
        // if that head moved; never emit a false tamper alert from two
        // different points in time, and never hold the ingestion lock for the
        // duration of a lifetime-ledger scan.
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $headBefore = DB::table('database_replication_event_chain_heads')
                ->where('key', self::STATE_KEY)
                ->first();
            $snapshotSequence = $headBefore === null ? -1 : (int) $headBefore->sequence;
            $snapshotHash = $headBefore?->last_hash === null
                ? null
                : (string) $headBefore->last_hash;
            $report = $this->verifyLedgerSnapshot($snapshotSequence, $snapshotHash);

            $headAfter = DB::table('database_replication_event_chain_heads')
                ->where('key', self::STATE_KEY)
                ->first();
            $latestSequence = DB::table('database_replication_events')->max('sequence');
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
            'event_count' => 0,
            'head_sequence' => 0,
            'head_hash' => null,
            'failures' => [[
                'sequence' => 0,
                'code' => 'chain_changed_during_verification',
            ]],
        ];
    }

    /**
     * Verify one historical event for read-model presentation without
     * trusting the append-only database trigger or a previous heartbeat.
     * Chain continuity remains the responsibility of verifyLedger().
     */
    public function verifyEventIntegrity(DatabaseReplicationEvent $event): bool
    {
        try {
            $sourcePayload = is_array($event->source_payload)
                ? $event->source_payload
                : [];
            if (! hash_equals(
                (string) $event->source_payload_hash,
                $this->attestations->hash($sourcePayload),
            ) || ! $this->attestations->verify(
                $sourcePayload,
                (string) $event->source_key_id,
                (string) $event->source_signature,
            ) || ! $this->eventSourceMatches($event, $sourcePayload)) {
                return false;
            }

            $canonical = $this->canonicalEvent($event->getAttributes(), $event->checks);
            $canonicalJson = $this->canonicalJson($canonical);
            $key = $this->ledgerKey((string) $event->signing_key_id, false);

            return hash_equals(
                (string) $event->record_hash,
                hash('sha256', $canonicalJson),
            ) && $key !== null && hash_equals(
                (string) $event->signature,
                hash_hmac('sha256', $canonicalJson, $key),
            );
        } catch (Throwable) {
            return false;
        }
    }

    /** @return array{valid:bool,event_count:int,head_sequence:int,head_hash:?string,failures:list<array{sequence:int,code:string}>} */
    private function verifyLedgerSnapshot(int $headSequence, ?string $headHash): array
    {
        $failures = [];
        $expectedSequence = 1;
        $previousHash = null;
        $count = 0;

        DatabaseReplicationEvent::query()
            ->where('sequence', '<=', max(0, $headSequence))
            ->chunkById(250, function ($events) use (
                &$failures,
                &$expectedSequence,
                &$previousHash,
                &$count,
            ): void {
                foreach ($events as $event) {
                    $count++;
                    $sequence = (int) $event->sequence;
                    if ($sequence !== $expectedSequence) {
                        $this->failure($failures, $sequence, 'sequence_gap');
                    }
                    if (($event->previous_hash === null ? null : (string) $event->previous_hash)
                        !== $previousHash) {
                        $this->failure($failures, $sequence, 'previous_hash_mismatch');
                    }

                    $canonical = $this->canonicalEvent($event->getAttributes(), $event->checks);
                    $recordHash = hash('sha256', $this->canonicalJson($canonical));
                    if (! hash_equals((string) $event->record_hash, $recordHash)) {
                        $this->failure($failures, $sequence, 'record_hash_mismatch');
                    }
                    $key = $this->ledgerKey((string) $event->signing_key_id, false);
                    if ($key === null || ! hash_equals(
                        (string) $event->signature,
                        hash_hmac('sha256', $this->canonicalJson($canonical), $key),
                    )) {
                        $this->failure($failures, $sequence, 'ledger_signature_invalid');
                    }
                    $sourcePayload = is_array($event->source_payload)
                        ? $event->source_payload
                        : [];
                    if (! hash_equals(
                        (string) $event->source_payload_hash,
                        $this->attestations->hash($sourcePayload),
                    ) || ! $this->attestations->verify(
                        $sourcePayload,
                        (string) $event->source_key_id,
                        (string) $event->source_signature,
                    )) {
                        $this->failure($failures, $sequence, 'source_attestation_invalid');
                    } elseif (! $this->eventSourceMatches($event, $sourcePayload)) {
                        $this->failure($failures, $sequence, 'source_business_mismatch');
                    }

                    $previousHash = (string) $event->record_hash;
                    $expectedSequence = $sequence + 1;
                }
            }, 'sequence');

        if ($headSequence < 0
            || $headSequence !== $count
            || $headHash !== $previousHash) {
            $this->failure($failures, max(0, $headSequence), 'chain_head_mismatch');
        }

        return [
            'valid' => $failures === [],
            'event_count' => $count,
            'head_sequence' => max(0, $headSequence),
            'head_hash' => $headHash,
            'failures' => $failures,
        ];
    }

    /**
     * @return array{
     *     valid:bool,
     *     code:?string,
     *     state:?DatabaseReplicationState,
     *     effective_status?:string,
     *     effective_checks?:array<string,bool>
     * }
     */
    public function verifyCurrentState(): array
    {
        try {
            $state = DatabaseReplicationState::query()->find(self::STATE_KEY);
            if ($state === null) {
                return ['valid' => false, 'code' => 'state_missing', 'state' => null];
            }
            $payload = is_array($state->source_payload) ? $state->source_payload : [];
            if (! hash_equals(
                (string) $state->source_payload_hash,
                $this->attestations->hash($payload),
            ) || ! $this->attestations->verify(
                $payload,
                (string) $state->source_key_id,
                (string) $state->source_signature,
            )) {
                return ['valid' => false, 'code' => 'source_attestation_invalid', 'state' => $state];
            }
            $this->assertExactKeys($payload, self::PAYLOAD_KEYS, 'replication payload');
            // Revalidate every structural and semantic boundary from the
            // signed source. Freshness is intentionally handled by monitoring
            // rather than write readiness, so observer downtime cannot turn a
            // healthy managed writer into a self-inflicted outage.
            $this->validatePayload($payload, false);
            foreach ([
                'provider' => 'provider',
                'cluster_id' => 'cluster_id',
                'dataset_id' => 'dataset_id',
                'environment' => 'environment',
                'primary_region' => 'primary_region',
                'writer_endpoint_id' => 'writer_endpoint_id',
                'reader_endpoint_id' => 'reader_endpoint_id',
                'writer_instance_id' => 'writer_instance_id',
                'topology_epoch' => 'topology_epoch',
                'replica_count' => 'replica_count',
                'healthy_replica_count' => 'healthy_replica_count',
                'synchronous_replica_count' => 'synchronous_replica_count',
                'maximum_replica_lag_ms' => 'maximum_replica_lag_ms',
                'data_loss_bytes' => 'data_loss_bytes',
            ] as $payloadKey => $stateKey) {
                if ((string) $payload[$payloadKey] !== (string) $state->{$stateKey}) {
                    return ['valid' => false, 'code' => 'state_payload_mismatch', 'state' => $state];
                }
            }

            $payloadObservedAt = $this->timestamp($payload['observed_at'], 'observed_at');
            $stateObservedAt = CarbonImmutable::instance($state->observed_at)
                ->utc()
                ->setMicrosecond(0);
            if (! $payloadObservedAt->equalTo($stateObservedAt)
                || ! hash_equals(
                    (string) $payload['operation_id'],
                    (string) $state->last_operation_id,
                )) {
                return ['valid' => false, 'code' => 'state_payload_mismatch', 'state' => $state];
            }

            $checks = $this->checks($payload);
            $storedChecks = is_array($state->checks) ? $state->checks : [];
            if (! $this->historicalChecksMatchSource($storedChecks, $payload)) {
                return ['valid' => false, 'code' => 'state_checks_mismatch', 'state' => $state];
            }

            $latest = $this->verifyLatestEvent();
            if (! $latest['valid'] || ! $latest['event'] instanceof DatabaseReplicationEvent) {
                return ['valid' => false, 'code' => 'latest_event_invalid', 'state' => $state];
            }
            $latestEvent = $latest['event'];
            $latestObservedAt = CarbonImmutable::instance($latestEvent->observed_at)
                ->utc()
                ->setMicrosecond(0);
            $controlFailure = $state->control_failure_code === null
                ? null
                : (string) $state->control_failure_code;
            $hasCurrentControlFailure = $controlFailure !== null;

            if ($hasCurrentControlFailure) {
                if (! $this->controlFailureMatchesLatestEvent(
                    $state,
                    $latestEvent,
                    $controlFailure,
                )) {
                    return ['valid' => false, 'code' => 'control_failure_mismatch', 'state' => $state];
                }
            } elseif (in_array((string) $latestEvent->event_type, [
                'split_brain_detected',
                'topology_epoch_regression',
            ], true)) {
                return ['valid' => false, 'code' => 'control_failure_mismatch', 'state' => $state];
            } elseif ($state->conflicting_writer_instance_id !== null
                || MonitoringStatus::tryFrom((string) $state->status) === null
                || ! hash_equals(
                    (string) $latestEvent->status,
                    (string) $state->status,
                )) {
                return ['valid' => false, 'code' => 'state_status_mismatch', 'state' => $state];
            } elseif ($latestObservedAt->greaterThan($stateObservedAt)
                || (int) $latestEvent->topology_epoch !== (int) $state->topology_epoch
                || ! hash_equals(
                    (string) $latestEvent->writer_instance_id,
                    (string) $state->writer_instance_id,
                )
                || ((string) $payload['event_type'] !== 'topology_observation'
                    && ! hash_equals(
                        (string) $latestEvent->source_payload_hash,
                        (string) $state->source_payload_hash,
                    ))) {
                return ['valid' => false, 'code' => 'state_lineage_mismatch', 'state' => $state];
            }

            $effectiveStatus = $hasCurrentControlFailure
                ? MonitoringStatus::Outage
                : $this->status($payload, $checks);

            return [
                'valid' => true,
                'code' => null,
                'state' => $state,
                'effective_status' => $effectiveStatus->value,
                'effective_checks' => $checks,
            ];
        } catch (Throwable) {
            return ['valid' => false, 'code' => 'state_verification_failed', 'state' => null];
        }
    }

    /**
     * Fail closed only when the currently attested topology cannot prove that
     * another write is safe. This method deliberately ignores stale evidence,
     * lag, and lost standby capacity: those conditions page operations but do
     * not manufacture a total application outage while the writer is healthy.
     */
    public function assertCurrentWriterSafety(): void
    {
        $verification = $this->verifyCurrentState();
        $state = $verification['state'];

        if (! $verification['valid'] || ! $state instanceof DatabaseReplicationState) {
            throw new RuntimeException('Database replication write-safety proof is invalid.');
        }

        $checks = is_array($verification['effective_checks'] ?? null)
            ? $verification['effective_checks']
            : [];
        $unsafe = $state->control_failure_code !== null
            || collect(self::WRITE_SAFETY_CHECKS)->contains(
                static fn (string $check): bool => ($checks[$check] ?? false) !== true,
            );

        if ($unsafe) {
            throw new RuntimeException('Database replication write-safety invariant failed.');
        }
    }

    /** @return array{valid:bool,event:?DatabaseReplicationEvent} */
    private function verifyLatestEvent(): array
    {
        $head = DB::table('database_replication_event_chain_heads')
            ->where('key', self::STATE_KEY)
            ->first();
        $event = DatabaseReplicationEvent::query()->orderByDesc('sequence')->first();
        if ($head === null || $event === null
            || (int) $head->sequence !== (int) $event->sequence
            || ! hash_equals((string) $head->last_hash, (string) $event->record_hash)) {
            return ['valid' => false, 'event' => $event];
        }

        $expectedPreviousHash = null;
        if ((int) $event->sequence > 1) {
            $previous = DatabaseReplicationEvent::query()
                ->where('sequence', (int) $event->sequence - 1)
                ->first();
            if ($previous === null) {
                return ['valid' => false, 'event' => $event];
            }
            $expectedPreviousHash = (string) $previous->record_hash;
        }
        if (($event->previous_hash === null ? null : (string) $event->previous_hash)
            !== $expectedPreviousHash) {
            return ['valid' => false, 'event' => $event];
        }

        return [
            'valid' => $this->verifyEventIntegrity($event),
            'event' => $event,
        ];
    }

    private function controlFailureMatchesLatestEvent(
        DatabaseReplicationState $state,
        DatabaseReplicationEvent $event,
        ?string $controlFailure,
    ): bool {
        if (! hash_equals((string) $state->status, MonitoringStatus::Outage->value)) {
            return false;
        }
        if ($controlFailure === 'split_brain_writer_conflict') {
            return $event->event_type === 'split_brain_detected'
                && (int) $event->topology_epoch === (int) $state->topology_epoch
                && is_string($state->conflicting_writer_instance_id)
                && hash_equals(
                    (string) $state->conflicting_writer_instance_id,
                    (string) $event->writer_instance_id,
                )
                && ! hash_equals(
                    (string) $state->writer_instance_id,
                    (string) $event->writer_instance_id,
                );
        }
        if ($controlFailure === 'topology_epoch_regression') {
            return $event->event_type === 'topology_epoch_regression'
                && (int) $event->topology_epoch < (int) $state->topology_epoch
                && $state->conflicting_writer_instance_id === null;
        }

        return false;
    }

    /** @param array<string, mixed> $payload */
    private function repeatsCurrentControlFailure(
        DatabaseReplicationState $state,
        object $head,
        array $payload,
        string $controlFailure,
    ): bool {
        if (! hash_equals(
            (string) $state->control_failure_code,
            $controlFailure,
        )) {
            return false;
        }

        $event = DatabaseReplicationEvent::query()
            ->where('sequence', (int) $head->sequence)
            ->first();
        if (! $event instanceof DatabaseReplicationEvent) {
            return false;
        }

        $eventType = $controlFailure === 'topology_epoch_regression'
            ? 'topology_epoch_regression'
            : 'split_brain_detected';

        return hash_equals((string) $event->event_type, $eventType)
            && (int) $event->topology_epoch === (int) $payload['topology_epoch']
            && hash_equals(
                (string) $event->writer_instance_id,
                (string) $payload['writer_instance_id'],
            );
    }

    /** @return array{valid:bool,event_count:int,head_sequence:int,head_hash:?string,failures:list<array{sequence:int,code:string}>} */
    public function verifyAndRecordHeartbeat(): array
    {
        $report = $this->verifyLedger();
        $this->heartbeats->record(
            key: (string) config(
                'database_replication.ledger.verification_heartbeat_key',
                'database-replication-ledger',
            ),
            category: 'replication',
            status: $report['valid'] ? MonitoringStatus::Operational : MonitoringStatus::Outage,
            message: $report['valid']
                ? 'Database replication event ledger is intact.'
                : 'Database replication event ledger failed verification.',
            context: [
                'event_count' => $report['event_count'],
                'head_sequence' => $report['head_sequence'],
                'head_fingerprint' => $report['head_hash'] === null
                    ? null
                    : substr($report['head_hash'], 0, 16),
                'failure_count' => count($report['failures']),
            ],
        );

        return $report;
    }

    /**
     * @param  array<string, mixed>  $envelope
     * @return array{key_id:string,payload:array<string,mixed>,payload_hash:string,signature:string}
     */
    private function verifiedEnvelope(array $envelope): array
    {
        $this->assertExactKeys(
            $envelope,
            ['schema_version', 'key_id', 'payload', 'signature'],
            'replication envelope',
        );
        if (($envelope['schema_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Unsupported database replication envelope version.');
        }
        $keyId = $this->identifier($envelope['key_id'] ?? null, 'key_id', 32);
        $payload = $envelope['payload'] ?? null;
        $signature = $envelope['signature'] ?? null;
        if (! is_array($payload) || array_is_list($payload) || ! is_string($signature)) {
            throw new InvalidArgumentException('Database replication envelope is malformed.');
        }
        $this->assertExactKeys($payload, self::PAYLOAD_KEYS, 'replication payload');
        if (strlen($this->attestations->canonicalJson($payload)) > (int) config(
            'database_replication.attestation.maximum_payload_bytes',
            65_536,
        )) {
            throw new InvalidArgumentException('Database replication payload exceeds the safety limit.');
        }
        if (! $this->attestations->isActiveKey($keyId)
            || ! $this->attestations->verify($payload, $keyId, $signature)) {
            throw new InvalidArgumentException('Database replication attestation is invalid or inactive.');
        }

        $this->validatePayload($payload);

        return [
            'key_id' => $keyId,
            'payload' => $payload,
            'payload_hash' => $this->attestations->hash($payload),
            'signature' => $signature,
        ];
    }

    /** @param array<string, mixed> $payload */
    private function validatePayload(array $payload, bool $requireFresh = true): void
    {
        if (($payload['schema_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Unsupported replication payload version.');
        }
        $eventType = $this->identifier($payload['event_type'], 'event_type', 40);
        if (! in_array($eventType, self::SOURCE_EVENT_TYPES, true)) {
            throw new InvalidArgumentException('Replication event type is unsupported.');
        }
        $this->identifier($payload['operation_id'], 'operation_id', 100);
        foreach ([
            'provider',
            'observer',
            'cluster_id',
            'dataset_id',
            'environment',
            'primary_region',
            'writer_endpoint_id',
            'reader_endpoint_id',
            'writer_instance_id',
        ] as $field) {
            $this->identifier($payload[$field], $field, 100);
        }
        $previousWriter = $payload['previous_writer_instance_id'];
        if ($previousWriter !== null) {
            $this->identifier($previousWriter, 'previous_writer_instance_id', 100);
        }
        $changeReference = $payload['change_reference'];
        if (! is_string($changeReference) || strlen($changeReference) > 100) {
            throw new InvalidArgumentException('change_reference is invalid.');
        }
        if ($eventType !== 'topology_observation'
            && $this->identifier($changeReference, 'change_reference', 100) === '') {
            throw new InvalidArgumentException('A controlled event requires change_reference.');
        }
        if (in_array($eventType, ['failover_completed', 'failback_completed'], true)
            && (! is_string($previousWriter)
                || hash_equals(
                    (string) $payload['writer_instance_id'],
                    $previousWriter,
                ))) {
            throw new InvalidArgumentException(
                'A completed writer transition requires a distinct previous writer.',
            );
        }

        $observedAt = $this->timestamp($payload['observed_at'], 'observed_at');
        $clockSkew = (int) config(
            'database_replication.attestation.maximum_clock_skew_seconds',
            120,
        );
        $maximumAge = (int) config(
            'database_replication.attestation.maximum_age_seconds',
            900,
        );
        if ($requireFresh
            && ($observedAt->greaterThan(now('UTC')->addSeconds($clockSkew))
                || $observedAt->lessThan(now('UTC')->subSeconds($maximumAge)))) {
            throw new InvalidArgumentException(
                'Database replication observation is outside the accepted time window.',
            );
        }

        $epoch = $this->boundedInteger($payload['topology_epoch'], 'topology_epoch', 1, PHP_INT_MAX);
        $replicas = $this->boundedInteger($payload['replica_count'], 'replica_count', 0, 1_000);
        $healthy = $this->boundedInteger(
            $payload['healthy_replica_count'],
            'healthy_replica_count',
            0,
            $replicas,
        );
        $sync = $this->boundedInteger(
            $payload['synchronous_replica_count'],
            'synchronous_replica_count',
            0,
            $healthy,
        );
        $this->boundedInteger(
            $payload['maximum_replica_lag_ms'],
            'maximum_replica_lag_ms',
            0,
            86_400_000,
        );
        $this->boundedInteger(
            $payload['data_loss_bytes'],
            'data_loss_bytes',
            0,
            PHP_INT_MAX,
        );
        foreach ([
            'single_writer',
            'writer_writable',
            'quorum_healthy',
            'stale_writers_fenced',
            'replicas_read_only',
            'gtid_enabled',
            'row_binlog',
            'automatic_failover',
            'cross_az',
            'reader_endpoint_healthy',
            'promotion_caught_up',
        ] as $field) {
            if (! is_bool($payload[$field])) {
                throw new InvalidArgumentException("{$field} must be boolean.");
            }
        }
        if ($epoch < 1) {
            throw new InvalidArgumentException('topology_epoch must be positive.');
        }

        $this->assertTargetIdentity($payload);
    }

    /** @param array<string, mixed> $payload */
    private function assertTargetIdentity(array $payload): void
    {
        foreach ([
            'provider' => 'provider',
            'observer' => 'independent_observer',
            'cluster_id' => 'cluster_id',
            'dataset_id' => 'dataset_id',
            'environment' => 'environment',
            'primary_region' => 'primary_region',
            'writer_endpoint_id' => 'writer_endpoint_id',
            'reader_endpoint_id' => 'reader_endpoint_id',
        ] as $payloadKey => $targetKey) {
            $actual = strtolower((string) $payload[$payloadKey]);
            $expected = strtolower(trim((string) config(
                'database_replication.target.'.$targetKey,
                '',
            )));
            if ($expected === '' || ! hash_equals($expected, $actual)) {
                throw new InvalidArgumentException(
                    "Replication {$payloadKey} does not match the configured target.",
                );
            }
        }
    }

    /** @param array<string, mixed> $payload @return array<string, bool> */
    private function checks(array $payload): array
    {
        $minimumReplicas = (int) config(
            'database_replication.topology.minimum_replicas',
            1,
        );
        $minimumSync = (int) config(
            'database_replication.topology.minimum_synchronous_replicas',
            1,
        );

        return [
            'automatic_failover' => $payload['automatic_failover'] === true,
            'cross_az' => $payload['cross_az'] === true,
            'gtid_enabled' => $payload['gtid_enabled'] === true,
            'healthy_replica_floor' => (int) $payload['healthy_replica_count'] >= $minimumReplicas,
            'promotion_caught_up' => $payload['promotion_caught_up'] === true,
            'quorum_healthy' => $payload['quorum_healthy'] === true,
            'reader_endpoint_healthy' => ! (bool) config(
                'database_replication.application_reads.enabled',
                false,
            ) || $payload['reader_endpoint_healthy'] === true,
            'replicas_read_only' => $payload['replicas_read_only'] === true,
            'row_binlog' => $payload['row_binlog'] === true,
            'single_writer' => $payload['single_writer'] === true,
            'stale_writers_fenced' => $payload['stale_writers_fenced'] === true,
            'synchronous_replica_floor' => (int) $payload['synchronous_replica_count'] >= $minimumSync,
            'writer_writable' => $payload['writer_writable'] === true,
            'zero_data_loss' => (int) $payload['data_loss_bytes'] <= (int) config(
                'database_replication.topology.maximum_data_loss_bytes',
                0,
            ),
        ];
    }

    /** @param array<string, mixed> $payload @param array<string, bool> $checks */
    private function status(array $payload, array $checks): MonitoringStatus
    {
        if (in_array(false, $checks, true)
            || (int) $payload['maximum_replica_lag_ms'] >= (int) config(
                'database_replication.lag.outage_ms',
                10_000,
            )
            || $payload['event_type'] === 'failover_failed') {
            return MonitoringStatus::Outage;
        }
        if ((int) $payload['maximum_replica_lag_ms'] >= (int) config(
            'database_replication.lag.warning_ms',
            2_000,
        ) || (int) $payload['healthy_replica_count'] < (int) $payload['replica_count']) {
            return MonitoringStatus::Degraded;
        }

        return MonitoringStatus::Operational;
    }

    /** @param array<string, mixed> $payload */
    private function assertWriterTransition(
        ?DatabaseReplicationState $current,
        array $payload,
    ): void {
        if ($current === null) {
            if ((string) $payload['event_type'] !== 'topology_observation') {
                throw new InvalidArgumentException(
                    'Replication state must be initialized by a topology observation.',
                );
            }

            return;
        }
        $writerChanged = ! hash_equals(
            (string) $current->writer_instance_id,
            (string) $payload['writer_instance_id'],
        );
        if (! $writerChanged) {
            if (in_array((string) $payload['event_type'], [
                'failover_completed',
                'failback_completed',
            ], true)) {
                throw new InvalidArgumentException(
                    'A completed writer transition did not change the writer.',
                );
            }

            return;
        }
        $eventType = (string) $payload['event_type'];
        $allowed = in_array($eventType, ['failover_completed', 'failback_completed'], true)
            && (int) $payload['topology_epoch'] > (int) $current->topology_epoch
            && is_string($payload['previous_writer_instance_id'])
            && hash_equals(
                (string) $current->writer_instance_id,
                (string) $payload['previous_writer_instance_id'],
            )
            && $payload['stale_writers_fenced'] === true
            && $payload['promotion_caught_up'] === true
            && (int) $payload['data_loss_bytes'] === 0;
        if (! $allowed) {
            throw new InvalidArgumentException(
                'Writer promotion lacks a newer epoch, fencing, catch-up, or zero-loss proof.',
            );
        }
    }

    private function derivedEventType(
        ?DatabaseReplicationState $current,
        array $payload,
        MonitoringStatus $status,
    ): ?string {
        if ($current === null) {
            return 'topology_initialized';
        }
        if ((string) $payload['event_type'] !== 'topology_observation') {
            return (string) $payload['event_type'];
        }
        if ((int) $payload['topology_epoch'] > (int) $current->topology_epoch) {
            return 'topology_reconfigured';
        }
        $previousStatus = MonitoringStatus::tryFrom((string) $current->status)
            ?? MonitoringStatus::Unknown;
        if ($status !== $previousStatus) {
            return $status === MonitoringStatus::Operational
                ? 'replication_recovered'
                : ($status === MonitoringStatus::Outage
                    ? 'replication_outage'
                    : 'replication_degraded');
        }

        return null;
    }

    /**
     * @param  array{key_id:string,payload:array<string,mixed>,payload_hash:string,signature:string}  $source
     * @param  array<string, mixed>  $payload
     * @param  array<string, bool>  $checks
     */
    private function appendEvent(
        object $head,
        array $source,
        array $payload,
        string $eventType,
        MonitoringStatus $status,
        array $checks,
        CarbonImmutable $observedAt,
    ): DatabaseReplicationEvent {
        $existing = DatabaseReplicationEvent::query()
            ->where('operation_id', (string) $payload['operation_id'])
            ->first();
        if ($existing !== null) {
            if (! hash_equals((string) $existing->source_payload_hash, $source['payload_hash'])) {
                throw new InvalidArgumentException(
                    'Replication operation_id cannot be reused for another payload.',
                );
            }

            return $existing;
        }

        $sequence = (int) $head->sequence + 1;
        $recordedAt = CarbonImmutable::now('UTC')->setMicrosecond(0);
        $attributes = [
            'public_id' => (string) Str::uuid(),
            'sequence' => $sequence,
            'schema_version' => 1,
            'event_type' => $eventType,
            'status' => $status->value,
            'operation_id' => (string) $payload['operation_id'],
            'provider' => (string) $payload['provider'],
            'cluster_id' => (string) $payload['cluster_id'],
            'topology_epoch' => (int) $payload['topology_epoch'],
            'writer_instance_id' => (string) $payload['writer_instance_id'],
            'previous_writer_instance_id' => $payload['previous_writer_instance_id'],
            'checks' => $checks,
            'source_key_id' => $source['key_id'],
            'source_payload' => $source['payload'],
            'source_payload_hash' => $source['payload_hash'],
            'source_signature' => $source['signature'],
            'signing_key_id' => $this->activeLedgerKeyId(),
            'previous_hash' => $head->last_hash === null ? null : (string) $head->last_hash,
            'observed_at' => $observedAt,
            'recorded_at' => $recordedAt,
        ];
        $canonical = $this->canonicalEvent($attributes, $checks);
        $json = $this->canonicalJson($canonical);
        $attributes['record_hash'] = hash('sha256', $json);
        $attributes['signature'] = hash_hmac(
            'sha256',
            $json,
            $this->ledgerKey($attributes['signing_key_id'], true)
                ?? throw new RuntimeException('Replication ledger signing key is unavailable.'),
        );

        $id = DB::table('database_replication_events')->insertGetId(
            $this->databaseEventAttributes($attributes),
        );
        $advanced = DB::table('database_replication_event_chain_heads')
            ->where('key', self::STATE_KEY)
            ->where('sequence', $sequence - 1)
            ->update([
                'sequence' => $sequence,
                'last_hash' => $attributes['record_hash'],
                'updated_at' => now(),
            ]);
        if ($advanced !== 1) {
            throw new RuntimeException('Database replication event chain head could not be advanced.');
        }

        return DatabaseReplicationEvent::query()->findOrFail($id);
    }

    /**
     * @param  array{key_id:string,payload:array<string,mixed>,payload_hash:string,signature:string}  $source
     * @param  array<string, mixed>  $payload
     * @param  array<string, bool>  $checks
     * @return array<string, mixed>
     */
    private function stateAttributes(
        array $source,
        array $payload,
        array $checks,
        MonitoringStatus $status,
        CarbonImmutable $observedAt,
        ?DatabaseReplicationState $current,
    ): array {
        return [
            'status' => $status->value,
            'provider' => (string) $payload['provider'],
            'cluster_id' => (string) $payload['cluster_id'],
            'dataset_id' => (string) $payload['dataset_id'],
            'environment' => (string) $payload['environment'],
            'primary_region' => (string) $payload['primary_region'],
            'writer_endpoint_id' => (string) $payload['writer_endpoint_id'],
            'reader_endpoint_id' => (string) $payload['reader_endpoint_id'],
            'writer_instance_id' => (string) $payload['writer_instance_id'],
            'conflicting_writer_instance_id' => null,
            'control_failure_code' => null,
            'topology_epoch' => (int) $payload['topology_epoch'],
            'replica_count' => (int) $payload['replica_count'],
            'healthy_replica_count' => (int) $payload['healthy_replica_count'],
            'synchronous_replica_count' => (int) $payload['synchronous_replica_count'],
            'maximum_replica_lag_ms' => (int) $payload['maximum_replica_lag_ms'],
            'data_loss_bytes' => (int) $payload['data_loss_bytes'],
            'checks' => json_encode($checks, JSON_THROW_ON_ERROR),
            'last_operation_id' => (string) $payload['operation_id'],
            'source_key_id' => $source['key_id'],
            'source_payload_hash' => $source['payload_hash'],
            'source_payload' => json_encode(
                $source['payload'],
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            ),
            'source_signature' => $source['signature'],
            'observed_at' => $observedAt->format('Y-m-d H:i:s'),
            'last_healthy_at' => $status === MonitoringStatus::Operational
                ? $observedAt->format('Y-m-d H:i:s')
                : $this->databaseTimestamp($current?->last_healthy_at),
            'last_failure_at' => in_array(
                $status,
                [MonitoringStatus::Degraded, MonitoringStatus::Outage],
                true,
            )
                ? $observedAt->format('Y-m-d H:i:s')
                : $this->databaseTimestamp($current?->last_failure_at),
        ];
    }

    private function recordHeartbeat(DatabaseReplicationState $state): void
    {
        $status = MonitoringStatus::tryFrom((string) $state->status)
            ?? MonitoringStatus::Unknown;
        $this->heartbeats->record(
            key: (string) config(
                'database_replication.observation.heartbeat_key',
                'database-replication-topology',
            ),
            category: 'replication',
            status: $status,
            latencyMs: (int) $state->maximum_replica_lag_ms,
            message: match ($status) {
                MonitoringStatus::Operational => 'Single-writer replication topology is healthy.',
                MonitoringStatus::Degraded => 'Replication lag or replica coverage is approaching its boundary.',
                MonitoringStatus::Outage => 'Database replication safety controls are outside their boundary.',
                default => 'Database replication state is unknown.',
            },
            context: [
                'provider' => (string) $state->provider,
                'cluster_id' => (string) $state->cluster_id,
                'topology_epoch' => (int) $state->topology_epoch,
                'writer_fingerprint' => substr(hash(
                    'sha256',
                    (string) $state->writer_instance_id,
                ), 0, 16),
                'replica_count' => (int) $state->replica_count,
                'healthy_replicas' => (int) $state->healthy_replica_count,
                'synchronous_replicas' => (int) $state->synchronous_replica_count,
                'maximum_lag_ms' => (int) $state->maximum_replica_lag_ms,
                'data_loss_bytes' => (int) $state->data_loss_bytes,
                'failure_code' => $state->control_failure_code,
            ],
            observedAt: $state->observed_at,
        );
    }

    private function assertRuntimeSafety(): void
    {
        if (! (bool) config('database_replication.enabled', false)
            || ! (bool) config('database_replication.observation.enabled', false)) {
            throw new RuntimeException('Database replication observation ingestion is disabled.');
        }
        if ((bool) config('database_replication.attestation.required', false)
            && ! $this->attestations->hasValidActiveKeyConfiguration()) {
            throw new RuntimeException(
                'Independent database replication attestation is not configured.',
            );
        }
        $this->activeLedgerKeyId();
    }

    private function activeLedgerKeyId(): string
    {
        $keyId = trim((string) config('database_replication.ledger.active_key_id', ''));
        if ($this->ledgerKey($keyId, true) === null) {
            throw new RuntimeException('Database replication ledger key ring is invalid.');
        }

        return $keyId;
    }

    private function ledgerKey(string $keyId, bool $active): ?string
    {
        if (preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $keyId) !== 1) {
            return null;
        }
        if ($active && ! hash_equals(
            trim((string) config('database_replication.ledger.active_key_id', '')),
            $keyId,
        )) {
            return null;
        }
        $keys = config('database_replication.ledger.signing_keys', []);
        $configured = is_array($keys) ? ($keys[$keyId] ?? null) : null;
        if (! is_string($configured)) {
            return null;
        }
        $decoded = str_starts_with($configured, 'base64:')
            ? base64_decode(substr($configured, 7), true)
            : $configured;
        $minimum = (int) config('database_replication.ledger.minimum_key_bytes', 32);

        return is_string($decoded)
            && strlen($decoded) >= $minimum
            && strlen($decoded) <= 128
            && preg_match('/replace|example|placeholder|secret-manager/i', $decoded) !== 1
            && count(array_unique(unpack('C*', $decoded) ?: [])) >= 8
                ? $decoded
                : null;
    }

    private function assertLedgerHead(object $head): void
    {
        $latest = DatabaseReplicationEvent::query()->orderByDesc('sequence')->first();
        $expectedSequence = $latest === null ? 0 : (int) $latest->sequence;
        $expectedHash = $latest?->record_hash === null ? null : (string) $latest->record_hash;
        if ((int) $head->sequence !== $expectedSequence
            || ($head->last_hash === null ? null : (string) $head->last_hash) !== $expectedHash) {
            throw new RuntimeException('Database replication event chain head is inconsistent.');
        }

        // Do not rescan an append-only lifetime ledger for every 30-60 second
        // observation. The locked head plus verifyCurrentState() validate the
        // current tail in constant time; the scheduled/release command still
        // verifies the complete chain in bounded chunks.
    }

    /** @param array<string, mixed> $payload */
    private function eventSourceMatches(
        DatabaseReplicationEvent $event,
        array $payload,
    ): bool {
        try {
            $this->assertExactKeys($payload, self::PAYLOAD_KEYS, 'historical replication payload');
            if (($payload['schema_version'] ?? null) !== 1
                || ! in_array($payload['event_type'] ?? null, self::SOURCE_EVENT_TYPES, true)) {
                return false;
            }
            foreach ([
                'event_type',
                'operation_id',
                'provider',
                'observer',
                'cluster_id',
                'dataset_id',
                'environment',
                'primary_region',
                'writer_endpoint_id',
                'reader_endpoint_id',
                'writer_instance_id',
                'observed_at',
                'change_reference',
            ] as $field) {
                if (! is_string($payload[$field] ?? null)) {
                    return false;
                }
            }
            if (($payload['previous_writer_instance_id'] ?? null) !== null
                && ! is_string($payload['previous_writer_instance_id'])) {
                return false;
            }
            foreach ([
                'replica_count',
                'healthy_replica_count',
                'synchronous_replica_count',
                'maximum_replica_lag_ms',
                'topology_epoch',
                'data_loss_bytes',
            ] as $field) {
                if (! is_int($payload[$field] ?? null)) {
                    return false;
                }
            }
            foreach ([
                'single_writer',
                'writer_writable',
                'quorum_healthy',
                'stale_writers_fenced',
                'replicas_read_only',
                'gtid_enabled',
                'row_binlog',
                'automatic_failover',
                'cross_az',
                'reader_endpoint_healthy',
                'promotion_caught_up',
            ] as $field) {
                if (! is_bool($payload[$field] ?? null)) {
                    return false;
                }
            }
            foreach ([
                'operation_id' => 'operation_id',
                'provider' => 'provider',
                'cluster_id' => 'cluster_id',
                'topology_epoch' => 'topology_epoch',
                'writer_instance_id' => 'writer_instance_id',
                'previous_writer_instance_id' => 'previous_writer_instance_id',
            ] as $payloadKey => $eventKey) {
                if ((string) ($payload[$payloadKey] ?? '') !== (string) $event->{$eventKey}) {
                    return false;
                }
            }
            if (! $this->timestamp($payload['observed_at'] ?? null, 'observed_at')->equalTo(
                CarbonImmutable::instance($event->observed_at)->utc()->setMicrosecond(0),
            )) {
                return false;
            }

            $storedChecks = is_array($event->checks) ? $event->checks : [];
            if (! $this->historicalChecksMatchSource($storedChecks, $payload)) {
                return false;
            }
            $storedStatus = MonitoringStatus::tryFrom((string) $event->status);
            if ($storedStatus === null) {
                return false;
            }
            if (in_array(false, $storedChecks, true)
                && $storedStatus !== MonitoringStatus::Outage) {
                return false;
            }
            if (in_array((string) $event->event_type, [
                'split_brain_detected',
                'topology_epoch_regression',
            ], true) && $storedStatus !== MonitoringStatus::Outage) {
                return false;
            }
            if (($payload['event_type'] ?? null) === 'failover_failed'
                && $storedStatus !== MonitoringStatus::Outage) {
                return false;
            }

            $sourceType = (string) $payload['event_type'];
            $storedType = (string) $event->event_type;
            if ($sourceType !== 'topology_observation') {
                return hash_equals($sourceType, $storedType)
                    || in_array($storedType, [
                        'split_brain_detected',
                        'topology_epoch_regression',
                    ], true);
            }

            return in_array($storedType, [
                'topology_initialized',
                'topology_reconfigured',
                'replication_recovered',
                'replication_outage',
                'replication_degraded',
                'split_brain_detected',
                'topology_epoch_regression',
            ], true);
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * Historical evidence must remain verifiable when today’s replica floors,
     * lag thresholds, or optional reader policy changes. Bind every check
     * that is a direct provider fact and validate the policy-derived fields as
     * booleans; their exact historical values remain protected by the local
     * HMAC ledger. Current health is always recomputed separately.
     *
     * @param  array<string, mixed>  $stored
     * @param  array<string, mixed>  $payload
     */
    private function historicalChecksMatchSource(array $stored, array $payload): bool
    {
        $expectedKeys = [
            'automatic_failover',
            'cross_az',
            'gtid_enabled',
            'healthy_replica_floor',
            'promotion_caught_up',
            'quorum_healthy',
            'reader_endpoint_healthy',
            'replicas_read_only',
            'row_binlog',
            'single_writer',
            'stale_writers_fenced',
            'synchronous_replica_floor',
            'writer_writable',
            'zero_data_loss',
        ];
        $actualKeys = array_keys($stored);
        sort($actualKeys, SORT_STRING);
        sort($expectedKeys, SORT_STRING);
        if ($actualKeys !== $expectedKeys) {
            return false;
        }
        foreach ($stored as $value) {
            if (! is_bool($value)) {
                return false;
            }
        }

        foreach ([
            'automatic_failover' => 'automatic_failover',
            'cross_az' => 'cross_az',
            'gtid_enabled' => 'gtid_enabled',
            'promotion_caught_up' => 'promotion_caught_up',
            'quorum_healthy' => 'quorum_healthy',
            'replicas_read_only' => 'replicas_read_only',
            'row_binlog' => 'row_binlog',
            'single_writer' => 'single_writer',
            'stale_writers_fenced' => 'stale_writers_fenced',
            'writer_writable' => 'writer_writable',
        ] as $check => $source) {
            if (($stored[$check] ?? null) !== ($payload[$source] ?? null)) {
                return false;
            }
        }

        // A healthy source endpoint must never be stored as unhealthy. A
        // source-side failure may historically have been ignored only while
        // application replica reads were disabled.
        if (($payload['reader_endpoint_healthy'] ?? null) === true
            && ($stored['reader_endpoint_healthy'] ?? null) !== true) {
            return false;
        }

        return true;
    }

    /** @param array<string, mixed> $attributes @param mixed $checks @return array<string, mixed> */
    private function canonicalEvent(array $attributes, mixed $checks): array
    {
        $sourcePayload = $attributes['source_payload'] ?? null;
        if (is_string($sourcePayload)) {
            $sourcePayload = json_decode($sourcePayload, true, 32, JSON_THROW_ON_ERROR);
        }

        return [
            'schema_version' => (int) ($attributes['schema_version'] ?? 0),
            'public_id' => (string) ($attributes['public_id'] ?? ''),
            'sequence' => (int) ($attributes['sequence'] ?? 0),
            'event_type' => (string) ($attributes['event_type'] ?? ''),
            'status' => (string) ($attributes['status'] ?? ''),
            'operation_id' => (string) ($attributes['operation_id'] ?? ''),
            'provider' => (string) ($attributes['provider'] ?? ''),
            'cluster_id' => (string) ($attributes['cluster_id'] ?? ''),
            'topology_epoch' => (int) ($attributes['topology_epoch'] ?? 0),
            'writer_instance_id' => (string) ($attributes['writer_instance_id'] ?? ''),
            'previous_writer_instance_id' => $attributes['previous_writer_instance_id'] ?? null,
            'checks' => $this->sortChecks(is_array($checks) ? $checks : []),
            'source_key_id' => (string) ($attributes['source_key_id'] ?? ''),
            'source_payload' => is_array($sourcePayload) ? $sourcePayload : null,
            'source_payload_hash' => (string) ($attributes['source_payload_hash'] ?? ''),
            'source_signature' => (string) ($attributes['source_signature'] ?? ''),
            'signing_key_id' => (string) ($attributes['signing_key_id'] ?? ''),
            'previous_hash' => $attributes['previous_hash'] ?? null,
            'observed_at' => $this->formatTimestamp($attributes['observed_at'] ?? null),
            'recorded_at' => $this->formatTimestamp($attributes['recorded_at'] ?? null),
        ];
    }

    /** @param array<string, mixed> $attributes @return array<string, mixed> */
    private function databaseEventAttributes(array $attributes): array
    {
        $attributes['checks'] = json_encode(
            $attributes['checks'],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
        );
        $attributes['source_payload'] = json_encode(
            $attributes['source_payload'],
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
        $attributes['observed_at'] = CarbonImmutable::instance($attributes['observed_at'])
            ->utc()
            ->format('Y-m-d H:i:s');
        $attributes['recorded_at'] = CarbonImmutable::instance($attributes['recorded_at'])
            ->utc()
            ->format('Y-m-d H:i:s');

        return $attributes;
    }

    /** @param array<string, bool> $checks @return array<string, bool> */
    private function sortChecks(array $checks): array
    {
        ksort($checks, SORT_STRING);

        return $checks;
    }

    /** @param array<string, mixed> $value @param list<string> $expected */
    private function assertExactKeys(array $value, array $expected, string $label): void
    {
        $actual = array_keys($value);
        sort($actual, SORT_STRING);
        sort($expected, SORT_STRING);
        if ($actual !== $expected) {
            throw new InvalidArgumentException("{$label} has missing or unexpected fields.");
        }
    }

    private function timestamp(mixed $value, string $field): CarbonImmutable
    {
        if ($value instanceof CarbonInterface) {
            return CarbonImmutable::instance($value)->utc()->setMicrosecond(0);
        }
        $timestamp = StrictRfc3339Timestamp::parse($value);
        if ($timestamp === null) {
            throw new InvalidArgumentException(
                "{$field} must be a real RFC3339 timestamp with an explicit offset.",
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
            throw new InvalidArgumentException('Replication event contains an invalid timestamp.');
        }

        return $timestamp->utc()->setMicrosecond(0)->format('Y-m-d\TH:i:s\Z');
    }

    private function databaseTimestamp(mixed $value): ?string
    {
        return $value instanceof CarbonInterface
            ? CarbonImmutable::instance($value)->utc()->format('Y-m-d H:i:s')
            : null;
    }

    private function identifier(mixed $value, string $field, int $maximum): string
    {
        $value = is_string($value) ? trim($value) : '';
        if ($value === ''
            || strlen($value) > $maximum
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]*\z/', $value) !== 1) {
            throw new InvalidArgumentException("{$field} is invalid.");
        }

        return $value;
    }

    private function boundedInteger(
        mixed $value,
        string $field,
        int $minimum,
        int $maximum,
    ): int {
        if (! is_int($value) || $value < $minimum || $value > $maximum) {
            throw new InvalidArgumentException("{$field} is outside its accepted boundary.");
        }

        return $value;
    }

    private function canonicalJson(array $payload): string
    {
        return json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
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
