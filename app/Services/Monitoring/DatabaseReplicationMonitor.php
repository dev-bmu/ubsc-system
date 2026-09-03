<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\DatabaseReplicationEvent;
use App\Models\MonitoringHeartbeat;
use App\Services\Production\DatabaseReplicationControlPlane;
use App\Services\Production\ProductionTopologyResolver;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Throwable;

final class DatabaseReplicationMonitor
{
    public function __construct(
        private readonly DatabaseReplicationControlPlane $controlPlane,
        private readonly ProductionTopologyResolver $topology,
    ) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        if ($this->topology->isSingleNode()) {
            return $this->standbySummary();
        }

        $configured = (bool) config('database_replication.enforce', false)
            || (bool) config('database_replication.enabled', false);
        $verification = $this->controlPlane->verifyCurrentState();
        $state = $verification['state'];
        $effectiveStatus = is_string($verification['effective_status'] ?? null)
            ? $verification['effective_status']
            : ($state === null ? null : (string) $state->status);
        $effectiveChecks = is_array($verification['effective_checks'] ?? null)
            ? $verification['effective_checks']
            : [];
        $topology = $this->topologySignal(
            $configured,
            (bool) $verification['valid'],
            $verification['code'],
            $state,
            $effectiveStatus,
        );
        $ledger = $this->ledgerSignal($configured);
        $signals = [
            'topology' => $topology,
            'fencing' => $this->fencingSignal(
                $configured,
                $state,
                $topology,
                $effectiveChecks,
            ),
            'lag' => $this->lagSignal($configured, $state, $topology),
            'ledger' => $ledger,
        ];
        $status = $configured
            ? MonitoringStatus::worst(array_map(
                static fn (array $signal): MonitoringStatus => MonitoringStatus::tryFrom(
                    (string) ($signal['status'] ?? ''),
                ) ?? MonitoringStatus::Unknown,
                $signals,
            ))
            : MonitoringStatus::Unknown;

        return [
            'configured' => $configured,
            'status' => $status->value,
            'target' => [
                'provider' => (string) config('database_replication.target.provider', ''),
                'cluster_id' => (string) config('database_replication.target.cluster_id', ''),
                'dataset_id' => (string) config('database_replication.target.dataset_id', ''),
                'environment' => (string) config('database_replication.target.environment', ''),
                'primary_region' => (string) config(
                    'database_replication.target.primary_region',
                    '',
                ),
                'writer_endpoint_id' => (string) config(
                    'database_replication.target.writer_endpoint_id',
                    '',
                ),
                'reader_endpoint_id' => (string) config(
                    'database_replication.target.reader_endpoint_id',
                    '',
                ),
                'independent_observer' => (string) config(
                    'database_replication.target.independent_observer',
                    '',
                ),
            ],
            'policy' => [
                'mode' => (string) config('database_replication.topology.mode', ''),
                'minimum_availability_zones' => (int) config(
                    'database_replication.topology.minimum_availability_zones',
                    1,
                ),
                'minimum_replicas' => (int) config(
                    'database_replication.topology.minimum_replicas',
                    0,
                ),
                'minimum_synchronous_replicas' => (int) config(
                    'database_replication.topology.minimum_synchronous_replicas',
                    0,
                ),
                'failover_rto_seconds' => (int) config(
                    'database_replication.topology.failover_rto_seconds',
                    0,
                ),
                'automatic_failback' => (bool) config(
                    'database_replication.topology.automatic_failback',
                    false,
                ),
                'application_replica_reads' => (bool) config(
                    'database_replication.application_reads.enabled',
                    false,
                ),
                'read_after_write_seconds' => (int) config(
                    'database_replication.application_reads.read_after_write_seconds',
                    30,
                ),
            ],
            'current' => $state === null ? null : [
                'status' => $effectiveStatus,
                'recorded_status' => (string) $state->status,
                'topology_epoch' => (int) $state->topology_epoch,
                'writer_fingerprint' => $this->fingerprint((string) $state->writer_instance_id),
                'conflicting_writer_fingerprint' => $state->conflicting_writer_instance_id === null
                    ? null
                    : $this->fingerprint((string) $state->conflicting_writer_instance_id),
                'replica_count' => (int) $state->replica_count,
                'healthy_replica_count' => (int) $state->healthy_replica_count,
                'synchronous_replica_count' => (int) $state->synchronous_replica_count,
                'maximum_replica_lag_ms' => (int) $state->maximum_replica_lag_ms,
                'data_loss_bytes' => (int) $state->data_loss_bytes,
                'control_failure_code' => $state->control_failure_code,
                'observed_at' => $this->formatTimestamp($state->observed_at),
                'last_healthy_at' => $this->formatTimestamp($state->last_healthy_at),
                'last_failure_at' => $this->formatTimestamp($state->last_failure_at),
                'checks' => $effectiveChecks,
                'attested' => (bool) $verification['valid'],
            ],
            'signals' => $signals,
            'ledger' => $this->ledgerSummary(),
            'message' => match ($status) {
                MonitoringStatus::Operational => 'Single-writer topology, synchronous standby, fencing, lag, and signed evidence are inside their safety boundaries.',
                MonitoringStatus::Degraded => 'Database replication is available, but lag, replica coverage, or evidence freshness needs attention.',
                MonitoringStatus::Outage => 'A replication safety invariant is unavailable or outside its permitted boundary.',
                default => 'Database replication is not configured or cannot be proven.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function standbySummary(): array
    {
        $message = 'Database replication is safely dormant while the production topology is single_node.';
        $signal = static fn (string $detail): array => [
            'configured' => false,
            'status' => MonitoringStatus::Unknown->value,
            'observed_at' => null,
            'age_seconds' => null,
            'message' => $detail,
        ];

        return [
            'configured' => false,
            'mode' => 'standby',
            'activation_topology' => 'multi_node',
            'status' => MonitoringStatus::Unknown->value,
            'target' => [
                'provider' => '',
                'cluster_id' => '',
                'dataset_id' => '',
                'environment' => 'production',
                'primary_region' => '',
                'writer_endpoint_id' => '',
                'reader_endpoint_id' => '',
                'independent_observer' => '',
            ],
            'policy' => [
                'mode' => 'standby',
                'minimum_availability_zones' => 1,
                'minimum_replicas' => 0,
                'minimum_synchronous_replicas' => 0,
                'failover_rto_seconds' => 0,
                'automatic_failback' => false,
                'application_replica_reads' => false,
                'read_after_write_seconds' => 0,
            ],
            'current' => null,
            'signals' => [
                'topology' => [
                    ...$signal('Signed replication topology is not required on one application node.'),
                    'warning_after_seconds' => null,
                    'outage_after_seconds' => null,
                    'topology_epoch' => null,
                ],
                'fencing' => [
                    ...$signal('Replica quorum and stale-writer fencing activate with multi_node.'),
                    'single_writer' => null,
                    'quorum_healthy' => null,
                    'stale_writers_fenced' => null,
                    'promotion_caught_up' => null,
                    'zero_data_loss' => null,
                ],
                'lag' => [
                    ...$signal('Replica lag monitoring activates with multi_node.'),
                    'lag_ms' => null,
                    'warning_ms' => null,
                    'outage_ms' => null,
                ],
                'ledger' => [
                    ...$signal('The signed replication ledger activates with multi_node.'),
                    'warning_after_seconds' => null,
                    'outage_after_seconds' => null,
                ],
            ],
            'ledger' => [
                'available' => false,
                'head_consistent' => null,
                'event_count' => 0,
                'head_sequence' => null,
                'head_fingerprint' => null,
                'items' => [],
                'message' => 'No replication ledger is expected in single_node mode.',
            ],
            'message' => $message,
        ];
    }

    /** @return array<string, mixed> */
    private function topologySignal(
        bool $configured,
        bool $valid,
        ?string $failureCode,
        mixed $state,
        ?string $effectiveStatus,
    ): array {
        $warning = (int) config(
            'database_replication.observation.warning_after_seconds',
            120,
        );
        $outage = (int) config(
            'database_replication.observation.outage_after_seconds',
            300,
        );
        $age = $state === null ? null : $this->age($state->observed_at);
        $sourceStatus = $state === null
            ? MonitoringStatus::Unknown
            : (MonitoringStatus::tryFrom((string) $effectiveStatus)
                ?? MonitoringStatus::Unknown);
        $status = match (true) {
            ! $configured => MonitoringStatus::Unknown,
            ! $valid || $state === null || $age === null => MonitoringStatus::Outage,
            $age >= $outage => MonitoringStatus::Outage,
            $age >= $warning => MonitoringStatus::Degraded,
            default => $sourceStatus,
        };

        return [
            'configured' => $configured,
            'status' => $status->value,
            'observed_at' => $state === null ? null : $this->formatTimestamp($state->observed_at),
            'age_seconds' => $age,
            'warning_after_seconds' => $warning,
            'outage_after_seconds' => $outage,
            'topology_epoch' => $state === null ? null : (int) $state->topology_epoch,
            'message' => match (true) {
                ! $configured => 'Signed database replication telemetry is not configured.',
                $state === null => 'No signed replication topology has been accepted.',
                ! $valid => 'The current signed replication state failed verification: '.($failureCode ?? 'unknown').'.',
                $age !== null && $age >= $outage => 'Replication topology evidence is stale.',
                $age !== null && $age >= $warning => 'Replication topology evidence is approaching its outage boundary.',
                default => 'Signed provider topology is current and internally consistent.',
            },
        ];
    }

    /** @param array<string, mixed> $topology @return array<string, mixed> */
    private function fencingSignal(
        bool $configured,
        mixed $state,
        array $topology,
        array $checks,
    ): array {
        $safe = $state !== null
            && $state->control_failure_code === null
            && ($checks['single_writer'] ?? false) === true
            && ($checks['quorum_healthy'] ?? false) === true
            && ($checks['stale_writers_fenced'] ?? false) === true
            && ($checks['promotion_caught_up'] ?? false) === true
            && ($checks['zero_data_loss'] ?? false) === true;
        $topologyStatus = MonitoringStatus::tryFrom((string) ($topology['status'] ?? ''))
            ?? MonitoringStatus::Unknown;
        $status = ! $configured
            ? MonitoringStatus::Unknown
            : ($topologyStatus === MonitoringStatus::Outage || ! $safe
                ? MonitoringStatus::Outage
                : $topologyStatus);

        return [
            'configured' => $configured,
            'status' => $status->value,
            'observed_at' => $topology['observed_at'] ?? null,
            'age_seconds' => $topology['age_seconds'] ?? null,
            'single_writer' => $checks['single_writer'] ?? null,
            'quorum_healthy' => $checks['quorum_healthy'] ?? null,
            'stale_writers_fenced' => $checks['stale_writers_fenced'] ?? null,
            'promotion_caught_up' => $checks['promotion_caught_up'] ?? null,
            'zero_data_loss' => $checks['zero_data_loss'] ?? null,
            'message' => $safe
                ? 'Quorum and stale-writer fencing prove one writable primary.'
                : 'Single-writer, quorum, fencing, caught-up promotion, or zero-loss proof is missing.',
        ];
    }

    /** @param array<string, mixed> $topology @return array<string, mixed> */
    private function lagSignal(bool $configured, mixed $state, array $topology): array
    {
        $lag = $state === null ? null : (int) $state->maximum_replica_lag_ms;
        $warning = (int) config('database_replication.lag.warning_ms', 2_000);
        $outage = (int) config('database_replication.lag.outage_ms', 10_000);
        $topologyStatus = MonitoringStatus::tryFrom((string) ($topology['status'] ?? ''))
            ?? MonitoringStatus::Unknown;
        $status = match (true) {
            ! $configured => MonitoringStatus::Unknown,
            $topologyStatus === MonitoringStatus::Outage || $lag === null => MonitoringStatus::Outage,
            $lag >= $outage => MonitoringStatus::Outage,
            $lag >= $warning => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return [
            'configured' => $configured,
            'status' => $status->value,
            'observed_at' => $topology['observed_at'] ?? null,
            'age_seconds' => $topology['age_seconds'] ?? null,
            'lag_ms' => $lag,
            'warning_ms' => $warning,
            'outage_ms' => $outage,
            'message' => match ($status) {
                MonitoringStatus::Operational => 'Maximum replica lag is inside the safe boundary.',
                MonitoringStatus::Degraded => 'Replica lag is approaching the outage boundary.',
                MonitoringStatus::Outage => 'Replica lag is unsafe or unavailable.',
                default => 'Replica lag is not configured.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function ledgerSignal(bool $configured): array
    {
        $warning = (int) config(
            'database_replication.ledger.verification_warning_after_seconds',
            7_200,
        );
        $outage = (int) config(
            'database_replication.ledger.verification_outage_after_seconds',
            14_400,
        );
        try {
            $heartbeat = MonitoringHeartbeat::query()->find((string) config(
                'database_replication.ledger.verification_heartbeat_key',
                'database-replication-ledger',
            ));
        } catch (Throwable) {
            $heartbeat = null;
        }
        $age = $heartbeat === null ? null : $this->age($heartbeat->observed_at);
        $recorded = $heartbeat === null
            ? MonitoringStatus::Unknown
            : (MonitoringStatus::tryFrom((string) $heartbeat->status) ?? MonitoringStatus::Unknown);
        $status = match (true) {
            ! $configured => MonitoringStatus::Unknown,
            $heartbeat === null || $age === null => MonitoringStatus::Outage,
            $recorded === MonitoringStatus::Outage || $age >= $outage => MonitoringStatus::Outage,
            $recorded === MonitoringStatus::Degraded || $age >= $warning => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return [
            'configured' => $configured,
            'status' => $status->value,
            'observed_at' => $heartbeat === null ? null : $this->formatTimestamp($heartbeat->observed_at),
            'age_seconds' => $age,
            'warning_after_seconds' => $warning,
            'outage_after_seconds' => $outage,
            'message' => match ($status) {
                MonitoringStatus::Operational => 'Replication event ledger was recently verified.',
                MonitoringStatus::Degraded => 'Replication ledger verification is approaching its deadline.',
                MonitoringStatus::Outage => 'Replication ledger verification is missing, stale, or failed.',
                default => 'Replication ledger verification is not configured.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function ledgerSummary(): array
    {
        try {
            $limit = (int) config('database_replication.ledger.event_limit', 30);
            $head = DB::table('database_replication_event_chain_heads')
                ->where('key', 'primary')
                ->first();
            $items = DatabaseReplicationEvent::query()
                ->orderByDesc('sequence')
                ->limit($limit)
                ->get()
                ->map(fn (DatabaseReplicationEvent $event): array => [
                    'public_id' => (string) $event->public_id,
                    'sequence' => (int) $event->sequence,
                    'event_type' => (string) $event->event_type,
                    'status' => (string) $event->status,
                    'topology_epoch' => (int) $event->topology_epoch,
                    'writer_fingerprint' => $this->fingerprint(
                        (string) $event->writer_instance_id,
                    ),
                    'previous_writer_fingerprint' => $event->previous_writer_instance_id === null
                        ? null
                        : $this->fingerprint((string) $event->previous_writer_instance_id),
                    'observed_at' => $this->formatTimestamp($event->observed_at),
                    'recorded_at' => $this->formatTimestamp($event->recorded_at),
                    'attested' => $this->controlPlane->verifyEventIntegrity($event),
                ])
                ->all();
            $latest = DatabaseReplicationEvent::query()
                ->orderByDesc('sequence')
                ->first(['sequence', 'record_hash']);
            $expectedSequence = $latest === null ? 0 : (int) $latest->sequence;
            $expectedHash = $latest === null ? null : (string) $latest->record_hash;
            $headHash = $head?->last_hash === null ? null : (string) $head->last_hash;
            $headConsistent = $head !== null
                && (int) $head->sequence === $expectedSequence
                && (($headHash === null && $expectedHash === null)
                    || (is_string($headHash)
                        && is_string($expectedHash)
                        && hash_equals($expectedHash, $headHash)));

            return [
                'available' => $headConsistent,
                'head_consistent' => $headConsistent,
                'event_count' => $head === null ? null : (int) $head->sequence,
                'head_sequence' => $head === null ? null : (int) $head->sequence,
                'head_fingerprint' => $head?->last_hash === null
                    ? null
                    : substr((string) $head->last_hash, 0, 16),
                'items' => $items,
                'message' => match (true) {
                    $head === null => 'Replication event chain head is unavailable.',
                    ! $headConsistent => 'Replication event chain head does not match its immutable tail.',
                    $items === [] => 'No replication topology transition has been recorded yet.',
                    default => 'Signed topology transitions are preserved append-only.',
                },
            ];
        } catch (Throwable) {
            return [
                'available' => false,
                'head_consistent' => false,
                'event_count' => null,
                'head_sequence' => null,
                'head_fingerprint' => null,
                'items' => [],
                'message' => 'Replication event storage is unavailable.',
            ];
        }
    }

    private function age(mixed $value): ?int
    {
        if (! $value instanceof CarbonInterface) {
            return null;
        }

        return max(0, (int) CarbonImmutable::instance($value)
            ->utc()
            ->diffInSeconds(now('UTC')));
    }

    private function formatTimestamp(mixed $value): ?string
    {
        return $value instanceof CarbonInterface
            ? CarbonImmutable::instance($value)->utc()->toIso8601String()
            : null;
    }

    private function fingerprint(string $value): string
    {
        return substr(hash('sha256', $value), 0, 16);
    }
}
