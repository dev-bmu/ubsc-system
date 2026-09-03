<?php

namespace Tests\Integration;

use App\Enums\MonitoringStatus;
use App\Services\Production\DatabaseReplicationAttestationVerifier;
use App\Services\Production\DatabaseReplicationControlPlane;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class MariaDbReplicationControlPlaneConcurrencyTest extends TestCase
{
    private static ?\OpenSSLAsymmetricKey $privateKey = null;

    /** @var array<string, mixed> */
    private array $raceConfiguration = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertIsolatedMariaDb();

        if (self::$privateKey === null) {
            $options = [
                'private_key_bits' => 2_048,
                'private_key_type' => OPENSSL_KEYTYPE_RSA,
            ];
            $windowsConfig = 'C:/xampp/php/extras/ssl/openssl.cnf';
            if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsConfig)) {
                $options['config'] = $windowsConfig;
            }
            $key = openssl_pkey_new($options);
            self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $key);
            self::$privateKey = $key;
        }

        $details = openssl_pkey_get_details(self::$privateKey);
        self::assertIsArray($details);
        $this->raceConfiguration = [
            'database_replication.enabled' => true,
            'database_replication.target.provider' => 'ci-managed-db',
            'database_replication.target.cluster_id' => 'ubsc-race-cluster-v1',
            'database_replication.target.dataset_id' => 'ubsc-race-dataset-v1',
            'database_replication.target.environment' => 'production',
            'database_replication.target.primary_region' => 'ci-primary-1',
            'database_replication.target.writer_endpoint_id' => 'ci-writer-endpoint',
            'database_replication.target.reader_endpoint_id' => 'ci-reader-endpoint',
            'database_replication.target.independent_observer' => 'ci-replication-observer-v1',
            'database_replication.topology.minimum_replicas' => 2,
            'database_replication.topology.minimum_synchronous_replicas' => 1,
            'database_replication.topology.maximum_data_loss_bytes' => 0,
            'database_replication.lag.warning_ms' => 2_000,
            'database_replication.lag.outage_ms' => 10_000,
            'database_replication.observation.enabled' => true,
            'database_replication.observation.heartbeat_key' => 'database-replication-topology',
            'database_replication.attestation.required' => true,
            'database_replication.attestation.maximum_clock_skew_seconds' => 120,
            'database_replication.attestation.maximum_age_seconds' => 900,
            'database_replication.attestation.active_key_ids' => ['ci-observer-v1'],
            'database_replication.attestation.verification_keys' => [
                'ci-observer-v1' => 'base64:'.base64_encode((string) $details['key']),
            ],
            'database_replication.ledger.active_key_id' => 'ci-ledger-v1',
            'database_replication.ledger.signing_keys' => [
                'ci-ledger-v1' => 'base64:'.base64_encode(random_bytes(32)),
            ],
            'database_replication.ledger.minimum_key_bytes' => 32,
        ];
        foreach ($this->raceConfiguration as $key => $value) {
            config()->set($key, $value);
        }
    }

    protected function tearDown(): void
    {
        DB::disconnect();
        parent::tearDown();
    }

    public function test_writer_election_and_split_brain_fencing_remain_serialized_under_race(): void
    {
        self::assertSame(0, DB::table('database_replication_states')->count());
        self::assertSame(0, DB::table('database_replication_events')->count());
        $observedAt = CarbonImmutable::now('UTC')->setMicrosecond(0);

        $initial = $this->envelope($this->payload(
            'initialize-'.Str::uuid(),
            $observedAt,
        ));
        $initialResults = $this->runRace([$initial, $initial, $initial]);

        self::assertSame(3, $initialResults->where('result', 'recorded')->count());
        self::assertSame(1, $initialResults->where('accepted', true)->count());
        self::assertSame(1, DB::table('database_replication_states')->count());
        self::assertSame(1, DB::table('database_replication_events')->count());
        self::assertSame('writer-a', DB::table('database_replication_states')
            ->where('key', 'primary')->value('writer_instance_id'));

        $sharedFailoverOperation = 'failover-race-'.Str::uuid();
        $failovers = [
            $this->envelope($this->payload(
                $sharedFailoverOperation,
                $observedAt->addSecond(),
                [
                    'event_type' => 'failover_completed',
                    'writer_instance_id' => 'writer-b',
                    'previous_writer_instance_id' => 'writer-a',
                    'topology_epoch' => 2,
                    'change_reference' => 'CI-FAILOVER-B',
                ],
            )),
            $this->envelope($this->payload(
                $sharedFailoverOperation,
                $observedAt->addSeconds(2),
                [
                    'event_type' => 'failover_completed',
                    'writer_instance_id' => 'writer-c',
                    'previous_writer_instance_id' => 'writer-a',
                    'topology_epoch' => 2,
                    'change_reference' => 'CI-FAILOVER-C',
                ],
            )),
        ];
        $failoverResults = $this->runRace($failovers, true);

        self::assertSame(1, $failoverResults->where('accepted', true)->count());
        self::assertSame(1, $failoverResults->where('result', 'failed')->count());
        self::assertSame(1, DB::table('database_replication_events')
            ->where('event_type', 'failover_completed')->count());
        self::assertSame(1, DB::table('database_replication_events')
            ->where('operation_id', $sharedFailoverOperation)->count());
        $acceptedWriter = (string) DB::table('database_replication_states')
            ->where('key', 'primary')->value('writer_instance_id');
        self::assertContains($acceptedWriter, ['writer-b', 'writer-c']);
        self::assertSame(2, (int) DB::table('database_replication_states')
            ->where('key', 'primary')->value('topology_epoch'));

        $conflict = $this->envelope($this->payload(
            'conflict-'.Str::uuid(),
            $observedAt->addSeconds(3),
            [
                'writer_instance_id' => 'writer-d',
                'topology_epoch' => 2,
            ],
        ));
        $conflictResults = $this->runRace([$conflict, $conflict, $conflict]);

        self::assertSame(0, $conflictResults->where('accepted', true)->count());
        self::assertSame(1, DB::table('database_replication_events')
            ->where('operation_id', $conflict['payload']['operation_id'])
            ->where('event_type', 'split_brain_detected')
            ->count());
        self::assertSame($acceptedWriter, DB::table('database_replication_states')
            ->where('key', 'primary')->value('writer_instance_id'));
        self::assertSame('writer-d', DB::table('database_replication_states')
            ->where('key', 'primary')->value('conflicting_writer_instance_id'));
        self::assertSame(MonitoringStatus::Outage->value, DB::table('database_replication_states')
            ->where('key', 'primary')->value('status'));
        self::assertTrue(app(DatabaseReplicationControlPlane::class)->verifyLedger()['valid']);
    }

    /**
     * @param  list<array<string, mixed>>  $envelopes
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function runRace(array $envelopes, bool $allowFailures = false)
    {
        $barrier = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-replication-race-'.Str::uuid();
        $configuration = base64_encode(json_encode(
            $this->raceConfiguration,
            JSON_THROW_ON_ERROR,
        ));
        $processes = [];
        $readyPaths = [];

        try {
            foreach ($envelopes as $index => $envelope) {
                $readyPath = $barrier.'.'.$index.'.ready';
                $process = new Process([
                    PHP_BINARY,
                    base_path('tests/Support/run-replication-control-plane-race.php'),
                    $barrier,
                    $readyPath,
                    $configuration,
                    base64_encode(json_encode($envelope, JSON_THROW_ON_ERROR)),
                ], base_path(), null, null, 60);
                $process->start();
                $processes[] = $process;
                $readyPaths[] = $readyPath;
            }

            $this->releaseBarrierWhenEveryProcessIsReady($barrier, $readyPaths, $processes);

            return collect($processes)->map(function (Process $process) use ($allowFailures): array {
                $process->wait();
                if (! $allowFailures) {
                    $this->assertTrue(
                        $process->isSuccessful(),
                        trim($process->getErrorOutput() ?: $process->getOutput()),
                    );
                }

                $output = $process->isSuccessful()
                    ? $process->getOutput()
                    : $process->getErrorOutput();

                return json_decode(trim($output), true, flags: JSON_THROW_ON_ERROR);
            });
        } finally {
            if (is_file($barrier)) {
                unlink($barrier);
            }
            foreach ($readyPaths as $readyPath) {
                if (is_file($readyPath)) {
                    unlink($readyPath);
                }
            }
            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop(1);
                }
            }
        }
    }

    /** @param list<string> $readyPaths @param list<Process> $processes */
    private function releaseBarrierWhenEveryProcessIsReady(
        string $barrier,
        array $readyPaths,
        array $processes,
    ): void {
        $deadline = microtime(true) + 20;
        while (collect($readyPaths)->contains(
            static fn (string $path): bool => ! is_file($path),
        )) {
            $failed = collect($processes)->first(
                static fn (Process $process): bool => $process->isTerminated()
                    && ! $process->isSuccessful(),
            );
            if ($failed instanceof Process) {
                self::fail(trim($failed->getErrorOutput() ?: $failed->getOutput()));
            }
            if (microtime(true) >= $deadline) {
                self::fail('Replication race children did not all reach the ready barrier.');
            }
            usleep(10_000);
        }

        self::assertTrue(touch($barrier), 'Replication race barrier could not be released.');
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function envelope(array $payload): array
    {
        $signature = '';
        self::assertTrue(openssl_sign(
            app(DatabaseReplicationAttestationVerifier::class)->canonicalJson($payload),
            $signature,
            self::$privateKey,
            OPENSSL_ALGO_SHA256,
        ));

        return [
            'schema_version' => 1,
            'key_id' => 'ci-observer-v1',
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function payload(
        string $operationId,
        CarbonImmutable $observedAt,
        array $overrides = [],
    ): array {
        return [
            'schema_version' => 1,
            'event_type' => 'topology_observation',
            'operation_id' => strtolower($operationId),
            'provider' => 'ci-managed-db',
            'observer' => 'ci-replication-observer-v1',
            'cluster_id' => 'ubsc-race-cluster-v1',
            'dataset_id' => 'ubsc-race-dataset-v1',
            'environment' => 'production',
            'primary_region' => 'ci-primary-1',
            'writer_endpoint_id' => 'ci-writer-endpoint',
            'reader_endpoint_id' => 'ci-reader-endpoint',
            'writer_instance_id' => 'writer-a',
            'previous_writer_instance_id' => null,
            'topology_epoch' => 1,
            'observed_at' => $observedAt->toIso8601String(),
            'replica_count' => 2,
            'healthy_replica_count' => 2,
            'synchronous_replica_count' => 1,
            'maximum_replica_lag_ms' => 80,
            'single_writer' => true,
            'writer_writable' => true,
            'quorum_healthy' => true,
            'stale_writers_fenced' => true,
            'replicas_read_only' => true,
            'gtid_enabled' => true,
            'row_binlog' => true,
            'automatic_failover' => true,
            'cross_az' => true,
            'reader_endpoint_healthy' => true,
            'promotion_caught_up' => true,
            'data_loss_bytes' => 0,
            'change_reference' => '',
            ...$overrides,
        ];
    }

    private function assertIsolatedMariaDb(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            self::fail('Replication concurrency requires an isolated MariaDB connection.');
        }
        $databaseName = (string) DB::connection()->getDatabaseName();
        if (preg_match('/\Aubsc_race_[a-z0-9_]+\z/', $databaseName) !== 1) {
            self::fail('Replication race refused: database must use the ubsc_race_ prefix.');
        }
        $version = strtolower((string) DB::selectOne('select version() as version')->version);
        self::assertStringContainsString('mariadb', $version);
    }
}
