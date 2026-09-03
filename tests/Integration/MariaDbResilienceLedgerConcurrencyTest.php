<?php

namespace Tests\Integration;

use App\Services\Production\ResilienceDrillLedger;
use App\Services\Production\ResilienceEvidenceVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class MariaDbResilienceLedgerConcurrencyTest extends TestCase
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
            $key = openssl_pkey_new([
                'private_key_bits' => 2_048,
                'private_key_type' => OPENSSL_KEYTYPE_RSA,
            ]);
            self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $key);
            self::$privateKey = $key;
            self::$ledgerKey = random_bytes(32);
        }
        $details = openssl_pkey_get_details(self::$privateKey);
        self::assertIsArray($details);
        self::assertIsString(self::$ledgerKey);
        $this->raceConfiguration = [
            'resilience_drills.enabled' => true,
            'resilience_drills.enforce' => true,
            'resilience_drills.target.environment' => 'staging',
            'resilience_drills.target.infrastructure_profile' => 'ubsc-ci-ha-twin-v1',
            'resilience_drills.target.provider' => 'ci-managed-cloud',
            'resilience_drills.target.orchestrator' => 'ci-protected-runner',
            'resilience_drills.evidence.verification_keys' => [
                'ci-orchestrator-v1' => 'base64:'.base64_encode((string) $details['key']),
            ],
            'resilience_drills.evidence.active_key_ids' => ['ci-orchestrator-v1'],
            'resilience_drills.ledger.active_key_id' => 'ci-ledger-v1',
            'resilience_drills.ledger.signing_keys' => [
                'ci-ledger-v1' => 'base64:'.base64_encode(self::$ledgerKey),
            ],
        ];
        foreach ($this->raceConfiguration as $key => $value) {
            config()->set($key, $value);
        }
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$privateKey !== null) {
            openssl_free_key(self::$privateKey);
            self::$privateKey = null;
        }
        self::$ledgerKey = null;
        parent::tearDownAfterClass();
    }

    public function test_distinct_campaigns_append_as_one_contiguous_chain_under_race(): void
    {
        $baseline = $this->headSequence();
        $envelopes = collect(range(1, 3))->map(
            fn (): array => $this->envelope((string) Str::uuid()),
        )->all();

        $results = $this->runRace($envelopes);
        $campaignIds = collect($envelopes)->pluck('payload.campaign_id')->all();

        self::assertSame(3, $results->where('result', 'recorded')->count());
        self::assertCount(3, $results->pluck('sequence')->unique());
        self::assertSame(
            range($baseline + 1, $baseline + 3),
            $results->pluck('sequence')->sort()->values()->all(),
        );
        self::assertSame(
            3,
            DB::table('resilience_drill_evidence')
                ->whereIn('campaign_id', $campaignIds)
                ->count(),
        );
        self::assertSame($baseline + 3, $this->headSequence());
        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);
    }

    public function test_same_campaign_race_is_one_idempotent_append(): void
    {
        $baseline = $this->headSequence();
        $envelope = $this->envelope((string) Str::uuid());

        $results = $this->runRace([$envelope, $envelope, $envelope]);

        self::assertSame(3, $results->where('result', 'recorded')->count());
        self::assertCount(1, $results->pluck('sequence')->unique());
        self::assertCount(1, $results->pluck('record_hash')->unique());
        self::assertSame(
            1,
            DB::table('resilience_drill_evidence')
                ->where('campaign_id', $envelope['payload']['campaign_id'])
                ->count(),
        );
        self::assertSame($baseline + 1, $this->headSequence());
        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);
    }

    /**
     * @param  list<array<string, mixed>>  $envelopes
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function runRace(array $envelopes)
    {
        $barrier = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-resilience-race-'.Str::uuid();
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
                    base_path('tests/Support/run-resilience-ledger-race.php'),
                    $barrier,
                    $readyPath,
                    $configuration,
                    base64_encode(json_encode($envelope, JSON_THROW_ON_ERROR)),
                ], base_path(), null, null, 60);
                $process->start();
                $processes[] = $process;
                $readyPaths[] = $readyPath;
            }

            $this->releaseBarrierWhenEveryProcessIsReady(
                $barrier,
                $readyPaths,
                $processes,
            );

            return collect($processes)->map(function (Process $process): array {
                $process->wait();
                $this->assertTrue(
                    $process->isSuccessful(),
                    trim($process->getErrorOutput() ?: $process->getOutput()),
                );

                return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
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

    /**
     * @param  list<string>  $readyPaths
     * @param  list<Process>  $processes
     */
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
                self::fail('Resilience race children did not all reach the ready barrier.');
            }
            usleep(10_000);
        }

        self::assertTrue(touch($barrier), 'Resilience race barrier could not be released.');
    }

    /** @return array<string, mixed> */
    private function envelope(string $campaignId): array
    {
        $payload = $this->payload($campaignId);
        $signature = '';
        self::assertTrue(openssl_sign(
            app(ResilienceEvidenceVerifier::class)->canonicalJson($payload),
            $signature,
            self::$privateKey,
            OPENSSL_ALGO_SHA256,
        ));

        return [
            'schema_version' => 1,
            'key_id' => 'ci-orchestrator-v1',
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }

    /** @return array<string, mixed> */
    private function payload(string $campaignId): array
    {
        $campaignStart = CarbonImmutable::now('UTC')->subMinutes(30)->setMicrosecond(0);
        $definitions = (array) config('resilience_drills.scenarios');
        $checks = [
            'preflight_healthy' => true,
            'monitoring_active' => true,
            'alert_delivered' => true,
            'kill_switch_armed' => true,
            'abort_guard_active' => true,
            'steady_state_recovered' => true,
            'readiness_recovered' => true,
            'booking_integrity' => true,
            'membership_integrity' => true,
            'payment_integrity' => true,
            'no_duplicate_reservations' => true,
            'no_data_loss' => true,
        ];
        $keys = [
            'application_node_loss',
            'load_balancer_failover',
            'queue_worker_restart',
            'cache_primary_failover',
            'database_writer_failover',
        ];
        $scenarios = collect($keys)->map(function (string $key, int $index) use (
            $campaignStart,
            $checks,
            $definitions,
        ): array {
            $started = $campaignStart->addMinutes(1 + ($index * 4));

            return [
                'key' => $key,
                'fault_domain' => (string) $definitions[$key]['fault_domain'],
                'started_at' => $started->toIso8601String(),
                'completed_at' => $started->addMinutes(2)->toIso8601String(),
                'outcome' => 'passed',
                'expected_recovery_seconds' => (int) $definitions[$key]['maximum_recovery_seconds'],
                'detection_seconds' => 5 + $index,
                'recovery_seconds' => 20 + $index,
                'blast_radius_percent' => 50,
                'healthy_instances_remaining' => 1,
                'peak_error_rate_basis_points' => 20,
                'peak_p95_ms' => 750,
                'abort_triggered' => false,
                'checks' => $checks,
            ];
        })->all();

        return [
            'schema_version' => 1,
            'campaign_id' => strtolower($campaignId),
            'environment' => 'staging',
            'release' => 'ci-resilience-race',
            'infrastructure_profile' => 'ubsc-ci-ha-twin-v1',
            'provider' => 'ci-managed-cloud',
            'orchestrator' => 'ci-protected-runner',
            'approval_reference' => 'CI-'.substr(str_replace('-', '', $campaignId), 0, 24),
            'approval_verified' => true,
            'change_reference_verified' => true,
            'orchestrator_identity_verified' => true,
            'production_access_denied' => true,
            'traffic_mode' => 'synthetic_only',
            'started_at' => $campaignStart->toIso8601String(),
            'completed_at' => $campaignStart->addMinutes(18)->toIso8601String(),
            'scenarios' => $scenarios,
        ];
    }

    private function headSequence(): int
    {
        return (int) DB::table('resilience_drill_chain_heads')
            ->where('key', 'primary')
            ->value('sequence');
    }

    private function assertIsolatedMariaDb(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->fail('Resilience concurrency requires an isolated MariaDB connection.');
        }
        $databaseName = (string) DB::connection()->getDatabaseName();
        if (preg_match('/\Aubsc_race_[a-z0-9_]+\z/', $databaseName) !== 1) {
            $this->fail('Resilience race refused: database must use the ubsc_race_ prefix.');
        }
        $version = strtolower((string) DB::selectOne('select version() as version')->version);
        $this->assertStringContainsString('mariadb', $version);
    }
}
