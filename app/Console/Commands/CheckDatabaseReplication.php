<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\DatabaseReplicationMonitor;
use App\Services\Production\DatabaseReplicationContract;
use App\Services\Production\DatabaseReplicationControlPlane;
use App\Services\Production\DatabaseReplicationEnvelopeReader;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class CheckDatabaseReplication extends Command
{
    protected $signature = 'production:replication-check
        {--strict : Treat recommendations as deployment blockers}
        {--live : Require fresh signed topology and an intact event ledger}';

    protected $description = 'Validate database replication topology, fencing, lag, and failover evidence';

    public function handle(
        DatabaseReplicationContract $contract,
        DatabaseReplicationMonitor $monitor,
        DatabaseReplicationControlPlane $controlPlane,
        DatabaseReplicationEnvelopeReader $reader,
    ): int {
        $report = $contract->report();
        $strict = (bool) $this->option('strict');

        $this->components->info('UBSC database-replication contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        $liveFailed = false;
        if ((bool) $this->option('live')) {
            try {
                $tables = [
                    'database_replication_states',
                    'database_replication_event_chain_heads',
                    'database_replication_events',
                ];
                $tableCount = count(array_filter(
                    $tables,
                    static fn (string $table): bool => Schema::hasTable($table),
                ));
                if ($tableCount === 0
                    || ($tableCount === count($tables) && $controlPlane->isPristine())) {
                    $inspection = $controlPlane->inspectEnvelope($reader->read(
                        (string) config(
                            'database_replication.bootstrap.attestation_file',
                            '',
                        ),
                    ));
                    $live = [
                        'status' => $inspection['status'],
                        'signals' => [
                            'bootstrap_attestation' => [
                                'status' => $inspection['status'],
                                'message' => sprintf(
                                    'Fresh signed topology epoch %d is valid for the initial control-plane migration.',
                                    $inspection['topology_epoch'],
                                ),
                            ],
                        ],
                    ];
                } elseif ($tableCount !== count($tables)) {
                    $live = [
                        'status' => MonitoringStatus::Outage->value,
                        'signals' => [
                            'control_plane_schema' => [
                                'status' => MonitoringStatus::Outage->value,
                                'message' => 'Replication control-plane schema is incomplete; bootstrap is forbidden.',
                            ],
                        ],
                    ];
                } else {
                    $ledger = $controlPlane->verifyAndRecordHeartbeat();
                    $live = $monitor->summary();
                    if (! $ledger['valid']) {
                        $live['status'] = MonitoringStatus::Outage->value;
                    }
                }
            } catch (Throwable $exception) {
                $live = [
                    'status' => MonitoringStatus::Outage->value,
                    'signals' => [
                        'live_verification' => [
                            'status' => MonitoringStatus::Outage->value,
                            'message' => $exception->getMessage(),
                        ],
                    ],
                ];
            }
            $this->newLine();
            $this->components->info('Live signed replication posture');
            $this->table(
                ['Status', 'Signal', 'Result'],
                collect((array) ($live['signals'] ?? []))
                    ->map(static fn (array $signal, string $key): array => [
                        strtoupper((string) ($signal['status'] ?? 'unknown')),
                        $key,
                        (string) ($signal['message'] ?? 'No result.'),
                    ])
                    ->values()
                    ->all(),
            );
            $liveFailed = ($live['status'] ?? null) !== MonitoringStatus::Operational->value;
        }

        $failed = $liveFailed || ($strict ? ! $report['strict_valid'] : ! $report['valid']);
        if ($failed) {
            $this->components->error(sprintf(
                'Database-replication contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('Database-replication contract passed.');

        return self::SUCCESS;
    }
}
