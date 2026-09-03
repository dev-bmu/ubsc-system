<?php

namespace Tests\Integration;

use App\Services\Production\RecoveryAttestationVerifier;
use App\Services\Production\RecoveryEvidenceLedger;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class MariaDbRecoveryLedgerConcurrencyTest extends TestCase
{
    private static ?\OpenSSLAsymmetricKey $privateKey = null;

    private static ?string $ledgerKey = null;

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
            self::$ledgerKey = random_bytes(32);
        }

        $details = openssl_pkey_get_details(self::$privateKey);
        self::assertIsArray($details);
        self::assertIsString(self::$ledgerKey);
        $this->raceConfiguration = [
            'monitoring.backup.enabled' => true,
            'disaster_recovery.target.provider' => 'ci-managed-db',
            'disaster_recovery.target.dataset_id' => 'ubsc-race-dataset-v1',
            'disaster_recovery.target.backup_destination_id' => 'ubsc-race-vault-v1',
            'disaster_recovery.target.primary_region' => 'ci-primary-1',
            'disaster_recovery.target.recovery_region' => 'ci-recovery-2',
            'disaster_recovery.target.independent_verifier' => 'ci-recovery-verifier-v1',
            'disaster_recovery.objectives.rpo_seconds' => 300,
            'disaster_recovery.pitr.enabled' => true,
            'disaster_recovery.pitr.observation_enabled' => true,
            'disaster_recovery.backup.enabled' => true,
            'disaster_recovery.backup.minimum_retention_days' => 35,
            'disaster_recovery.backup.allowed_object_lock_modes' => ['compliance'],
            'disaster_recovery.attestation.required' => true,
            'disaster_recovery.attestation.maximum_clock_skew_seconds' => 300,
            'disaster_recovery.attestation.active_key_ids' => ['ci-verifier-v1'],
            'disaster_recovery.attestation.verification_keys' => [
                'ci-verifier-v1' => 'base64:'.base64_encode((string) $details['key']),
            ],
            'disaster_recovery.evidence.active_key_id' => 'ci-ledger-v1',
            'disaster_recovery.evidence.signing_keys' => [
                'ci-ledger-v1' => 'base64:'.base64_encode(self::$ledgerKey),
            ],
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

    public function test_distinct_attestations_form_one_contiguous_chain_under_race(): void
    {
        $baseline = $this->headSequence();
        $envelopes = collect(range(1, 3))->map(
            fn (): array => $this->envelope((string) Str::uuid()),
        )->all();

        $results = $this->runRace($envelopes);
        $operationIds = collect($envelopes)->pluck('payload.operation_id')->all();

        self::assertSame(3, $results->where('result', 'recorded')->count());
        self::assertCount(3, $results->pluck('sequence')->unique());
        self::assertSame(
            range($baseline + 1, $baseline + 3),
            $results->pluck('sequence')->sort()->values()->all(),
        );
        self::assertSame(3, DB::table('recovery_evidence')
            ->whereIn('operation_id', $operationIds)
            ->count());
        self::assertSame($baseline + 3, $this->headSequence());
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);
    }

    public function test_same_attestation_race_is_exactly_one_idempotent_append(): void
    {
        $baseline = $this->headSequence();
        $envelope = $this->envelope((string) Str::uuid());

        $results = $this->runRace([$envelope, $envelope, $envelope]);

        self::assertSame(3, $results->where('result', 'recorded')->count());
        self::assertCount(1, $results->pluck('sequence')->unique());
        self::assertCount(1, $results->pluck('record_hash')->unique());
        self::assertSame(1, DB::table('recovery_evidence')
            ->where('operation_id', $envelope['payload']['operation_id'])
            ->count());
        self::assertSame($baseline + 1, $this->headSequence());
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);
    }

    public function test_cross_type_operation_identity_race_can_append_only_one_fact(): void
    {
        $baseline = $this->headSequence();
        $operationId = strtolower((string) Str::uuid());
        $results = $this->runRace([
            $this->envelope($operationId),
            $this->signedEnvelope($this->pitrPayload($operationId)),
        ], true);

        self::assertSame(1, $results->where('result', 'recorded')->count());
        self::assertSame(1, $results->where('result', 'failed')->count());
        self::assertSame(1, DB::table('recovery_evidence')
            ->where('operation_id', $operationId)
            ->count());
        self::assertSame($baseline + 1, $this->headSequence());
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);
    }

    /**
     * @param  list<array<string, mixed>>  $envelopes
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function runRace(array $envelopes, bool $allowFailures = false)
    {
        $barrier = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-recovery-race-'.Str::uuid();
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
                    base_path('tests/Support/run-recovery-ledger-race.php'),
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
                self::fail('Recovery race children did not all reach the ready barrier.');
            }
            usleep(10_000);
        }

        self::assertTrue(touch($barrier), 'Recovery race barrier could not be released.');
    }

    /** @return array<string, mixed> */
    private function envelope(string $operationId): array
    {
        return $this->signedEnvelope($this->payload($operationId));
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function signedEnvelope(array $payload): array
    {
        $signature = '';
        self::assertTrue(openssl_sign(
            app(RecoveryAttestationVerifier::class)->canonicalJson($payload),
            $signature,
            self::$privateKey,
            OPENSSL_ALGO_SHA256,
        ));

        return [
            'schema_version' => 1,
            'key_id' => 'ci-verifier-v1',
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }

    /** @return array<string, mixed> */
    private function pitrPayload(string $operationId): array
    {
        $checkedAt = CarbonImmutable::now('UTC')->setMicrosecond(0);

        return [
            'schema_version' => 1,
            'evidence_type' => 'pitr_observation',
            'operation_id' => $operationId,
            'provider' => 'ci-managed-db',
            'verifier' => 'ci-recovery-verifier-v1',
            'dataset_id' => 'ubsc-race-dataset-v1',
            'backup_destination_id' => 'ubsc-race-vault-v1',
            'primary_region' => 'ci-primary-1',
            'recovery_region' => 'ci-recovery-2',
            'latest_recovery_point_at' => $checkedAt->subMinute()->toIso8601String(),
            'checked_at' => $checkedAt->toIso8601String(),
            'continuous' => true,
            'restorable' => true,
        ];
    }

    /** @return array<string, mixed> */
    private function payload(string $operationId): array
    {
        $completed = CarbonImmutable::now('UTC')->setMicrosecond(0);

        return [
            'schema_version' => 1,
            'evidence_type' => 'backup_verified',
            'operation_id' => strtolower($operationId),
            'backup_id' => 'backup-'.strtolower($operationId),
            'provider' => 'ci-managed-db',
            'verifier' => 'ci-recovery-verifier-v1',
            'dataset_id' => 'ubsc-race-dataset-v1',
            'backup_destination_id' => 'ubsc-race-vault-v1',
            'primary_region' => 'ci-primary-1',
            'recovery_region' => 'ci-recovery-2',
            'source_snapshot_at' => $completed->subMinutes(5)->toIso8601String(),
            'recovery_point_at' => $completed->subMinute()->toIso8601String(),
            'completed_at' => $completed->toIso8601String(),
            'immutable_until' => $completed->addDays(36)->toIso8601String(),
            'object_lock_mode' => 'compliance',
            'size_bytes' => 12_345_678,
            'checksum_sha256' => hash('sha256', $operationId),
            'archive_readable' => true,
            'checksum_verified' => true,
            'encrypted' => true,
            'offsite' => true,
            'cross_account' => true,
            'cross_region' => true,
        ];
    }

    private function headSequence(): int
    {
        return (int) DB::table('recovery_evidence_chain_heads')
            ->where('key', 'primary')
            ->value('sequence');
    }

    private function assertIsolatedMariaDb(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            self::fail('Recovery concurrency requires an isolated MariaDB connection.');
        }
        $databaseName = (string) DB::connection()->getDatabaseName();
        if (preg_match('/\Aubsc_race_[a-z0-9_]+\z/', $databaseName) !== 1) {
            self::fail('Recovery race refused: database must use the ubsc_race_ prefix.');
        }
        $version = strtolower((string) DB::selectOne('select version() as version')->version);
        self::assertStringContainsString('mariadb', $version);
    }
}
