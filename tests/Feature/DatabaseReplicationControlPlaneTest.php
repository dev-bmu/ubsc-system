<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Models\DatabaseReplicationEvent;
use App\Services\Monitoring\DatabaseReplicationMonitor;
use App\Services\Monitoring\ReadinessService;
use App\Services\Production\DatabaseReplicationAttestationVerifier;
use App\Services\Production\DatabaseReplicationControlPlane;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;
use RuntimeException;
use Tests\TestCase;

final class DatabaseReplicationControlPlaneTest extends TestCase
{
    use RefreshDatabase;

    private static ?\OpenSSLAsymmetricKey $privateKey = null;

    protected function setUp(): void
    {
        parent::setUp();

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

        Carbon::setTestNow('2026-08-24 08:00:00 UTC');
        config()->set('database_replication.enforce', true);
        config()->set('database_replication.enabled', true);
        config()->set('database_replication.target', [
            'provider' => 'managed-database',
            'cluster_id' => 'ubsc-cluster-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'environment' => 'production',
            'primary_region' => 'ap-southeast-3',
            'writer_endpoint_id' => 'ubsc-writer-endpoint',
            'reader_endpoint_id' => 'ubsc-reader-endpoint',
            'independent_observer' => 'ubsc-replication-observer',
        ]);
        config()->set('database_replication.topology.minimum_replicas', 1);
        config()->set('database_replication.topology.minimum_synchronous_replicas', 1);
        config()->set('database_replication.topology.maximum_data_loss_bytes', 0);
        config()->set('database_replication.topology.failover_rto_seconds', 60);
        config()->set('database_replication.lag.warning_ms', 2_000);
        config()->set('database_replication.lag.outage_ms', 10_000);
        config()->set('database_replication.observation.enabled', true);
        config()->set('database_replication.observation.heartbeat_key', 'database-replication-topology');
        config()->set('database_replication.observation.warning_after_seconds', 120);
        config()->set('database_replication.observation.outage_after_seconds', 300);
        config()->set('database_replication.attestation.required', true);
        config()->set('database_replication.attestation.active_key_ids', ['observer-v1']);
        config()->set('database_replication.attestation.verification_keys', [
            'observer-v1' => 'base64:'.base64_encode((string) $details['key']),
        ]);
        config()->set('database_replication.attestation.maximum_payload_bytes', 65_536);
        config()->set('database_replication.attestation.maximum_clock_skew_seconds', 120);
        config()->set('database_replication.attestation.maximum_age_seconds', 900);
        config()->set('database_replication.ledger.active_key_id', 'ledger-v1');
        config()->set('database_replication.ledger.signing_keys', [
            'ledger-v1' => 'replication-ledger-feature-test-key-v1',
        ]);
        config()->set('database_replication.ledger.minimum_key_bytes', 32);
        config()->set('database_replication.ledger.verification_heartbeat_key', 'database-replication-ledger');
        config()->set('database_replication.ledger.verification_warning_after_seconds', 7_200);
        config()->set('database_replication.ledger.verification_outage_after_seconds', 14_400);
        config()->set('database_replication.ledger.event_limit', 30);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_replication_ledger_is_verified_hourly_with_distributed_locking(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->firstWhere('description', 'replication-verify-event-ledger');

        self::assertNotNull($event);
        self::assertSame('37 * * * *', $event->expression);
        self::assertTrue($event->withoutOverlapping);
        self::assertTrue($event->onOneServer);
    }

    public function test_stateless_bootstrap_inspection_proves_topology_without_writing_control_plane(): void
    {
        self::assertTrue($this->controlPlane()->isPristine());
        $inspection = $this->controlPlane()->inspectEnvelope($this->envelope(
            $this->payload('bootstrap-inspection-0001'),
        ));

        self::assertSame(MonitoringStatus::Operational->value, $inspection['status']);
        self::assertSame(1, $inspection['topology_epoch']);
        self::assertTrue($inspection['checks']['single_writer']);
        self::assertDatabaseCount('database_replication_states', 0);
        self::assertDatabaseCount('database_replication_events', 0);
    }

    public function test_first_run_bootstrap_imports_once_and_never_rereads_file_after_state_exists(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'ubsc-replication-bootstrap-');
        self::assertIsString($path);
        try {
            self::assertNotFalse(file_put_contents(
                $path,
                json_encode(
                    $this->envelope($this->payload('bootstrap-import-0001')),
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
                ),
                LOCK_EX,
            ));
            config()->set('database_replication.bootstrap.attestation_file', $path);

            $this->artisan('replication:attestation-import', [
                '--bootstrap-if-empty' => true,
                '--fail-on-unhealthy' => true,
                '--quiet' => true,
            ])->assertSuccessful();
            self::assertDatabaseCount('database_replication_states', 1);
            self::assertDatabaseCount('database_replication_events', 1);
            self::assertFalse($this->controlPlane()->isPristine());

            unlink($path);
            $this->artisan('replication:attestation-import', [
                '--bootstrap-if-empty' => true,
                '--fail-on-unhealthy' => true,
                '--quiet' => true,
            ])->assertSuccessful();
            self::assertDatabaseCount('database_replication_states', 1);
            self::assertDatabaseCount('database_replication_events', 1);
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }
    }

    public function test_live_gate_accepts_signed_bootstrap_after_an_interrupted_pristine_migration(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'ubsc-replication-interrupted-');
        self::assertIsString($path);
        try {
            self::assertNotFalse(file_put_contents(
                $path,
                json_encode(
                    $this->envelope($this->payload('interrupted-bootstrap-0001')),
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
                ),
                LOCK_EX,
            ));
            config()->set('database_replication.bootstrap.attestation_file', $path);

            // The command remains non-zero because this isolated test does not
            // configure the unrelated production TLS/provider declarations;
            // its live branch must nevertheless prove the pristine bootstrap.
            self::assertSame(1, Artisan::call('production:replication-check', [
                '--live' => true,
            ]));
            self::assertStringContainsString('bootstrap_attestation', Artisan::output());
            self::assertTrue($this->controlPlane()->isPristine());
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }
    }

    public function test_bootstrap_cannot_recreate_missing_state_over_existing_history(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('bootstrap-history-baseline-0001'),
        ));
        DB::table('database_replication_states')->where('key', 'primary')->delete();
        config()->set(
            'database_replication.bootstrap.attestation_file',
            base_path('this-bootstrap-file-must-never-be-read.json'),
        );

        $this->artisan('replication:attestation-import', [
            '--bootstrap-if-empty' => true,
            '--quiet' => true,
        ])->assertExitCode(2);

        self::assertDatabaseCount('database_replication_states', 0);
        self::assertDatabaseCount('database_replication_events', 1);
        self::assertSame(
            1,
            (int) DB::table('database_replication_event_chain_heads')
                ->where('key', 'primary')
                ->value('sequence'),
        );
    }

    public function test_current_state_is_constant_size_while_only_transitions_enter_the_ledger(): void
    {
        $first = $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));

        self::assertTrue($first['accepted']);
        self::assertNotNull($first['event']);
        self::assertSame('topology_initialized', $first['event']->event_type);
        self::assertSame(MonitoringStatus::Operational->value, $first['state']->status);

        Carbon::setTestNow(now()->addSeconds(30));
        $second = $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0002'),
        ));

        self::assertTrue($second['accepted']);
        self::assertNull($second['event']);
        self::assertSame(1, DB::table('database_replication_states')->count());
        self::assertSame(1, DB::table('database_replication_events')->count());
        self::assertSame('observation-0002', $second['state']->last_operation_id);
        self::assertTrue($this->controlPlane()->verifyLedger()['valid']);
    }

    public function test_operation_identity_cannot_be_reused_for_different_signed_evidence(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('globally-unique-operation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));

        try {
            $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
                'globally-unique-operation-0001',
                [
                    'event_type' => 'drill_completed',
                    'change_reference' => 'DRILL-IDEMPOTENCY-0001',
                ],
            )));
            self::fail('An operation identity must never describe two signed payloads.');
        } catch (InvalidArgumentException $exception) {
            self::assertSame(
                'Replication operation_id cannot be reused for another payload.',
                $exception->getMessage(),
            );
        }

        self::assertDatabaseCount('database_replication_events', 1);
        self::assertSame(
            'globally-unique-operation-0001',
            DB::table('database_replication_states')
                ->where('key', 'primary')
                ->value('last_operation_id'),
        );
    }

    public function test_caught_up_zero_loss_failover_advances_epoch_and_fences_old_writer(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));

        $payload = $this->payload('failover-0001', [
            'event_type' => 'failover_completed',
            'writer_instance_id' => 'writer-b',
            'previous_writer_instance_id' => 'writer-a',
            'topology_epoch' => 2,
            'change_reference' => 'INC-2026-0042',
        ]);
        $result = $this->controlPlane()->recordEnvelope($this->envelope($payload));

        self::assertSame('failover_completed', $result['event']?->event_type);
        self::assertSame('writer-b', $result['state']->writer_instance_id);
        self::assertSame(2, $result['state']->topology_epoch);
        self::assertSame(2, DB::table('database_replication_events')->count());
        self::assertTrue($this->controlPlane()->verifyLedger()['valid']);
    }

    public function test_controlled_transition_cannot_initialize_an_unknown_topology(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'failover-without-baseline-0001',
            [
                'event_type' => 'failover_completed',
                'writer_instance_id' => 'writer-b',
                'previous_writer_instance_id' => 'writer-a',
                'topology_epoch' => 2,
                'change_reference' => 'INC-2026-0041',
            ],
        )));
    }

    public function test_completed_failover_cannot_claim_success_without_changing_writer(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));

        $this->expectException(InvalidArgumentException::class);
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'false-failover-0001',
            [
                'event_type' => 'failover_completed',
                'writer_instance_id' => 'writer-a',
                'previous_writer_instance_id' => 'writer-b',
                'topology_epoch' => 2,
                'change_reference' => 'INC-2026-0044',
            ],
        )));
    }

    public function test_controlled_failback_requires_another_new_epoch_and_fences_current_writer(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'failover-0001',
            [
                'event_type' => 'failover_completed',
                'writer_instance_id' => 'writer-b',
                'previous_writer_instance_id' => 'writer-a',
                'topology_epoch' => 2,
                'change_reference' => 'INC-2026-0042',
            ],
        )));
        Carbon::setTestNow(now()->addSeconds(20));

        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'failback-0001',
            [
                'event_type' => 'failback_completed',
                'writer_instance_id' => 'writer-a',
                'previous_writer_instance_id' => 'writer-b',
                'topology_epoch' => 3,
                'change_reference' => 'CHG-2026-0112',
            ],
        )));

        self::assertTrue($result['accepted']);
        self::assertSame('failback_completed', $result['event']?->event_type);
        self::assertSame('writer-a', $result['state']->writer_instance_id);
        self::assertSame(3, $result['state']->topology_epoch);
        self::assertTrue($this->controlPlane()->verifyLedger()['valid']);
    }

    public function test_unfenced_or_uncaught_writer_promotion_is_refused(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));

        $this->expectException(InvalidArgumentException::class);
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'unsafe-failover-0001',
            [
                'event_type' => 'failover_completed',
                'writer_instance_id' => 'writer-b',
                'previous_writer_instance_id' => 'writer-a',
                'topology_epoch' => 2,
                'stale_writers_fenced' => false,
                'promotion_caught_up' => false,
                'change_reference' => 'INC-2026-0043',
            ],
        )));
    }

    public function test_same_epoch_with_two_writers_becomes_a_durable_split_brain_outage(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));

        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'conflict-0001',
            ['writer_instance_id' => 'writer-b'],
        )));

        self::assertFalse($result['accepted']);
        self::assertSame('split_brain_detected', $result['event']?->event_type);
        self::assertSame(MonitoringStatus::Outage->value, $result['state']->status);
        self::assertSame('writer-a', $result['state']->writer_instance_id);
        self::assertSame('writer-b', $result['state']->conflicting_writer_instance_id);
        self::assertSame(
            'split_brain_writer_conflict',
            $result['state']->control_failure_code,
        );
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DatabaseReplicationMonitor::class)->summary()['status'],
        );
        self::assertTrue(
            app(DatabaseReplicationMonitor::class)->summary()['current']['attested'],
        );
    }

    public function test_same_second_writer_conflict_is_preserved_instead_of_dismissed_as_ambiguous(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));

        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'same-second-conflict-0001',
            ['writer_instance_id' => 'writer-b'],
        )));

        self::assertFalse($result['accepted']);
        self::assertSame('split_brain_detected', $result['event']?->event_type);
        self::assertSame('writer-a', $result['state']->writer_instance_id);
        self::assertSame('writer-b', $result['state']->conflicting_writer_instance_id);
        self::assertSame('split_brain_writer_conflict', $result['state']->control_failure_code);
        self::assertTrue($this->controlPlane()->verifyCurrentState()['valid']);
        self::assertTrue($this->controlPlane()->verifyLedger()['valid']);
    }

    public function test_split_brain_cannot_recover_without_a_newer_topology_epoch(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('epoch-recovery-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'epoch-recovery-conflict-0001',
            ['writer_instance_id' => 'writer-b'],
        )));

        Carbon::setTestNow(now()->addSeconds(20));
        $sameEpoch = $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('epoch-recovery-same-epoch-0001'),
        ));

        self::assertFalse($sameEpoch['accepted']);
        self::assertNull($sameEpoch['event']);
        self::assertSame('split_brain_writer_conflict', $sameEpoch['state']->control_failure_code);
        self::assertSame(MonitoringStatus::Outage->value, $sameEpoch['state']->status);

        Carbon::setTestNow(now()->addSeconds(20));
        $newEpoch = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'epoch-recovery-new-epoch-0001',
            ['topology_epoch' => 2],
        )));

        self::assertTrue($newEpoch['accepted']);
        self::assertSame('topology_reconfigured', $newEpoch['event']?->event_type);
        self::assertNull($newEpoch['state']->control_failure_code);
        self::assertSame(MonitoringStatus::Operational->value, $newEpoch['state']->status);
        $this->controlPlane()->assertCurrentWriterSafety();
    }

    public function test_repeated_identical_split_brain_evidence_is_coalesced(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('coalesced-conflict-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'coalesced-conflict-first-0001',
            ['writer_instance_id' => 'writer-b'],
        )));
        Carbon::setTestNow(now()->addSeconds(20));
        $repeated = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'coalesced-conflict-second-0001',
            ['writer_instance_id' => 'writer-b'],
        )));

        self::assertFalse($repeated['accepted']);
        self::assertNull($repeated['event']);
        self::assertDatabaseCount('database_replication_events', 2);
        self::assertSame('split_brain_writer_conflict', $repeated['state']->control_failure_code);
        self::assertTrue($this->controlPlane()->verifyLedger()['valid']);
    }

    public function test_newer_observation_with_regressed_epoch_cannot_replace_current_state(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'observation-0001',
            ['topology_epoch' => 3],
        )));
        Carbon::setTestNow(now()->addSeconds(20));

        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'regression-0001',
            ['topology_epoch' => 2],
        )));

        self::assertFalse($result['accepted']);
        self::assertSame(3, $result['state']->topology_epoch);
        self::assertSame('topology_epoch_regression', $result['state']->control_failure_code);
        self::assertSame('topology_epoch_regression', $result['event']?->event_type);
    }

    public function test_delayed_older_observation_cannot_hide_a_newer_state(): void
    {
        $current = $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-current'),
        ));
        $older = $this->payload('observation-old', [
            'observed_at' => now()->subMinute()->toIso8601String(),
            'maximum_replica_lag_ms' => 20_000,
        ]);

        $result = $this->controlPlane()->recordEnvelope($this->envelope($older));

        self::assertFalse($result['accepted']);
        self::assertSame(
            $current['state']->source_payload_hash,
            $result['state']->source_payload_hash,
        );
        self::assertSame(MonitoringStatus::Operational->value, $result['state']->status);
    }

    public function test_delayed_same_epoch_writer_conflict_is_never_discarded_as_stale(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('delayed-conflict-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(40));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'delayed-conflict-current-0001',
            ['observed_at' => now()->subSeconds(10)->toIso8601String()],
        )));

        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'delayed-conflict-evidence-0001',
            [
                'writer_instance_id' => 'writer-b',
                'observed_at' => now()->subSeconds(20)->toIso8601String(),
            ],
        )));

        self::assertFalse($result['accepted']);
        self::assertSame('split_brain_detected', $result['event']?->event_type);
        self::assertSame('writer-a', $result['state']->writer_instance_id);
        self::assertSame('writer-b', $result['state']->conflicting_writer_instance_id);
        self::assertSame('split_brain_writer_conflict', $result['state']->control_failure_code);
        self::assertTrue($this->controlPlane()->verifyCurrentState()['valid']);
        self::assertTrue($this->controlPlane()->verifyLedger()['valid']);
    }

    public function test_lag_outage_and_recovery_are_both_preserved_as_events(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $outage = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'lag-outage-0001',
            ['maximum_replica_lag_ms' => 12_000],
        )));
        Carbon::setTestNow(now()->addSeconds(20));
        $recovered = $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('recovered-0001'),
        ));

        self::assertSame('replication_outage', $outage['event']?->event_type);
        self::assertSame(MonitoringStatus::Outage->value, $outage['state']->status);
        self::assertSame('replication_recovered', $recovered['event']?->event_type);
        self::assertSame(MonitoringStatus::Operational->value, $recovered['state']->status);
        self::assertSame(3, DB::table('database_replication_events')->count());
    }

    public function test_write_safety_gate_blocks_every_fatal_writer_invariant(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('write-safety-baseline-0001'),
        ));
        $this->controlPlane()->assertCurrentWriterSafety();

        foreach ([
            'single_writer',
            'writer_writable',
            'quorum_healthy',
            'stale_writers_fenced',
            'replicas_read_only',
        ] as $index => $unsafeCheck) {
            Carbon::setTestNow(now()->addSeconds(20));
            $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
                'write-safety-unsafe-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT),
                [$unsafeCheck => false],
            )));

            try {
                $this->controlPlane()->assertCurrentWriterSafety();
                self::fail("{$unsafeCheck} must remove the node from write traffic.");
            } catch (RuntimeException $exception) {
                self::assertSame(
                    'Database replication write-safety invariant failed.',
                    $exception->getMessage(),
                );
            }

            Carbon::setTestNow(now()->addSeconds(20));
            $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
                'write-safety-recovered-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT),
            )));
            $this->controlPlane()->assertCurrentWriterSafety();
        }
    }

    public function test_write_safety_gate_keeps_a_healthy_writer_online_during_replica_degradation(): void
    {
        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'replica-lag-outage-0001',
            [
                'healthy_replica_count' => 0,
                'synchronous_replica_count' => 0,
                'maximum_replica_lag_ms' => 12_000,
            ],
        )));

        self::assertSame(MonitoringStatus::Outage->value, $result['state']->status);
        self::assertFalse($result['state']->checks['healthy_replica_floor']);
        self::assertFalse($result['state']->checks['synchronous_replica_floor']);

        // Standby coverage is an urgent incident, but taking down a proven
        // single writer would turn degradation into a self-inflicted outage.
        $this->controlPlane()->assertCurrentWriterSafety();
        self::assertTrue($this->controlPlane()->verifyCurrentState()['valid']);
    }

    public function test_optional_reader_failure_is_monitored_without_taking_down_the_writer(): void
    {
        config()->set('database_replication.application_reads.enabled', true);
        $result = $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'reader-endpoint-outage-0001',
            ['reader_endpoint_healthy' => false],
        )));

        self::assertSame(MonitoringStatus::Outage->value, $result['state']->status);
        self::assertFalse($result['state']->checks['reader_endpoint_healthy']);
        $this->controlPlane()->assertCurrentWriterSafety();
        self::assertTrue($this->controlPlane()->verifyCurrentState()['valid']);
    }

    public function test_write_safety_gate_rejects_durable_split_brain_evidence(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('write-safety-conflict-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'write-safety-conflict-0001',
            ['writer_instance_id' => 'writer-b'],
        )));

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Database replication write-safety invariant failed.');
        $this->controlPlane()->assertCurrentWriterSafety();
    }

    public function test_load_balancer_readiness_cannot_omit_replication_write_safety(): void
    {
        config()->set('monitoring.readiness.required_checks', ['database']);
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('monitoring.readiness.attempts', 1);

        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('readiness-safety-baseline-0001'),
        ));
        self::assertTrue(app(ReadinessService::class)->report()['ready']);

        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'readiness-safety-conflict-0001',
            ['writer_instance_id' => 'writer-b'],
        )));
        $report = app(ReadinessService::class)->report();

        self::assertFalse($report['ready']);
        self::assertSame('database', $report['checks'][0]['key']);
        self::assertSame(MonitoringStatus::Outage->value, $report['checks'][0]['status']);
        self::assertSame('Dependency check failed.', $report['checks'][0]['message']);
    }

    public function test_single_node_readiness_does_not_require_dormant_replication_state(): void
    {
        config()->set('production.topology', 'single_node');
        config()->set('monitoring.readiness.required_checks', ['database']);
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('monitoring.readiness.attempts', 1);

        self::assertTrue(app(ReadinessService::class)->report()['ready']);

        $monitor = app(DatabaseReplicationMonitor::class)->summary();
        self::assertFalse($monitor['configured']);
        self::assertSame('standby', $monitor['mode']);
        self::assertSame('multi_node', $monitor['activation_topology']);
        self::assertNull($monitor['current']);
        self::assertSame([], $monitor['ledger']['items']);
    }

    public function test_target_drift_and_signature_tampering_are_refused(): void
    {
        $payload = $this->payload('wrong-target-0001', ['cluster_id' => 'other-cluster']);

        try {
            $this->controlPlane()->recordEnvelope($this->envelope($payload));
            self::fail('Target drift should be rejected.');
        } catch (InvalidArgumentException) {
            self::assertDatabaseCount('database_replication_events', 0);
        }

        $envelope = $this->envelope($this->payload('tampered-signature-0001'));
        $envelope['payload']['writer_instance_id'] = 'writer-b';

        $this->expectException(InvalidArgumentException::class);
        $this->controlPlane()->recordEnvelope($envelope);
    }

    public function test_state_tampering_is_detected_even_when_the_event_chain_is_intact(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'writer_instance_id' => 'tampered-writer',
        ]);

        $verification = $this->controlPlane()->verifyCurrentState();

        self::assertFalse($verification['valid']);
        self::assertSame('state_payload_mismatch', $verification['code']);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DatabaseReplicationMonitor::class)->summary()['status'],
        );

        try {
            $this->controlPlane()->assertCurrentWriterSafety();
            self::fail('A tampered replication state must remove the node from write traffic.');
        } catch (RuntimeException $exception) {
            self::assertSame(
                'Database replication write-safety proof is invalid.',
                $exception->getMessage(),
            );
        }
    }

    public function test_a_valid_signed_payload_cannot_regress_state_behind_the_ledger_lineage(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('lineage-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'lineage-failover-0001',
            [
                'event_type' => 'failover_completed',
                'writer_instance_id' => 'writer-b',
                'previous_writer_instance_id' => 'writer-a',
                'topology_epoch' => 2,
                'change_reference' => 'INC-LINEAGE-0001',
            ],
        )));

        Carbon::setTestNow(now()->addSeconds(20));
        $replayed = $this->envelope($this->payload('lineage-replay-0001'));
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'status' => MonitoringStatus::Operational->value,
            'writer_instance_id' => 'writer-a',
            'topology_epoch' => 1,
            'last_operation_id' => $replayed['payload']['operation_id'],
            'source_key_id' => $replayed['key_id'],
            'source_payload_hash' => app(DatabaseReplicationAttestationVerifier::class)
                ->hash($replayed['payload']),
            'source_payload' => json_encode($replayed['payload'], JSON_THROW_ON_ERROR),
            'source_signature' => $replayed['signature'],
            'observed_at' => now('UTC')->format('Y-m-d H:i:s'),
        ]);

        $verification = $this->controlPlane()->verifyCurrentState();

        self::assertFalse($verification['valid']);
        self::assertSame('state_lineage_mismatch', $verification['code']);
    }

    public function test_a_signed_controlled_event_cannot_bypass_the_append_only_ledger(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('controlled-lineage-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $unrecorded = $this->envelope($this->payload(
            'unrecorded-drill-0001',
            [
                'event_type' => 'drill_completed',
                'change_reference' => 'DRILL-LINEAGE-0001',
            ],
        ));
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'last_operation_id' => $unrecorded['payload']['operation_id'],
            'source_key_id' => $unrecorded['key_id'],
            'source_payload_hash' => app(DatabaseReplicationAttestationVerifier::class)
                ->hash($unrecorded['payload']),
            'source_payload' => json_encode($unrecorded['payload'], JSON_THROW_ON_ERROR),
            'source_signature' => $unrecorded['signature'],
            'observed_at' => now('UTC')->format('Y-m-d H:i:s'),
        ]);

        $verification = $this->controlPlane()->verifyCurrentState();

        self::assertFalse($verification['valid']);
        self::assertSame('state_lineage_mismatch', $verification['code']);
        self::assertDatabaseCount('database_replication_events', 1);
    }

    public function test_new_evidence_cannot_silently_overwrite_a_tampered_state(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('tamper-ingest-baseline-0001'),
        ));
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'writer_instance_id' => 'tampered-writer',
        ]);
        Carbon::setTestNow(now()->addSeconds(20));

        try {
            $this->controlPlane()->recordEnvelope($this->envelope(
                $this->payload('tamper-ingest-repair-attempt-0001'),
            ));
            self::fail('New evidence must not silently heal a tampered mutable state.');
        } catch (RuntimeException $exception) {
            self::assertSame(
                'Existing database replication state failed integrity verification.',
                $exception->getMessage(),
            );
        }

        self::assertSame(
            'tampered-writer',
            DB::table('database_replication_states')
                ->where('key', 'primary')
                ->value('writer_instance_id'),
        );
        self::assertDatabaseCount('database_replication_events', 1);
    }

    public function test_direct_import_cannot_reinitialize_missing_state_over_history(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('missing-state-baseline-0001'),
        ));
        DB::table('database_replication_states')->where('key', 'primary')->delete();
        Carbon::setTestNow(now()->addSeconds(20));

        try {
            $this->controlPlane()->recordEnvelope($this->envelope(
                $this->payload('missing-state-reinitialize-0001'),
            ));
            self::fail('History without current state must fail closed.');
        } catch (RuntimeException $exception) {
            self::assertSame(
                'Database replication state is missing from an initialized control plane.',
                $exception->getMessage(),
            );
        }

        self::assertDatabaseCount('database_replication_states', 0);
        self::assertDatabaseCount('database_replication_events', 1);
    }

    public function test_signed_lag_outage_cannot_be_relabelled_operational_in_mutable_state(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'lag-outage-0001',
            ['maximum_replica_lag_ms' => 12_000],
        )));
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'status' => MonitoringStatus::Operational->value,
        ]);

        $verification = $this->controlPlane()->verifyCurrentState();

        self::assertFalse($verification['valid']);
        self::assertSame('state_status_mismatch', $verification['code']);
    }

    public function test_signed_checks_cannot_be_rewritten_in_mutable_state(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        $storedChecks = DB::table('database_replication_states')
            ->where('key', 'primary')
            ->value('checks');
        $checks = is_string($storedChecks)
            ? json_decode($storedChecks, true, 16, JSON_THROW_ON_ERROR)
            : (array) $storedChecks;
        $checks['single_writer'] = false;
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'checks' => json_encode($checks, JSON_THROW_ON_ERROR),
        ]);

        $verification = $this->controlPlane()->verifyCurrentState();

        self::assertFalse($verification['valid']);
        self::assertSame('state_checks_mismatch', $verification['code']);
    }

    public function test_split_brain_marker_cannot_be_erased_from_mutable_state(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $this->controlPlane()->recordEnvelope($this->envelope($this->payload(
            'conflict-0001',
            ['writer_instance_id' => 'writer-b'],
        )));
        DB::table('database_replication_states')->where('key', 'primary')->update([
            'status' => MonitoringStatus::Operational->value,
            'control_failure_code' => null,
            'conflicting_writer_instance_id' => null,
        ]);

        $verification = $this->controlPlane()->verifyCurrentState();

        self::assertFalse($verification['valid']);
        self::assertSame('control_failure_mismatch', $verification['code']);
    }

    public function test_database_and_model_guards_refuse_event_mutation(): void
    {
        $result = $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));

        try {
            DB::table('database_replication_events')
                ->where('id', $result['event']?->id)
                ->update(['status' => MonitoringStatus::Outage->value]);
            self::fail('Database trigger should reject event mutation.');
        } catch (QueryException) {
            self::assertSame(
                MonitoringStatus::Operational->value,
                DB::table('database_replication_events')
                    ->where('id', $result['event']?->id)
                    ->value('status'),
            );
        }

        $this->expectException(LogicException::class);
        DatabaseReplicationEvent::query()
            ->whereKey($result['event']?->id)
            ->update(['status' => MonitoringStatus::Outage->value]);
    }

    public function test_chain_head_tampering_is_detected(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        DB::table('database_replication_event_chain_heads')
            ->where('key', 'primary')
            ->update(['last_hash' => str_repeat('f', 64)]);

        $report = $this->controlPlane()->verifyLedger();

        self::assertFalse($report['valid']);
        self::assertContains('chain_head_mismatch', array_column($report['failures'], 'code'));
        $monitoring = app(DatabaseReplicationMonitor::class)->summary();
        self::assertFalse($monitoring['ledger']['head_consistent']);
        self::assertSame(MonitoringStatus::Outage->value, $monitoring['status']);
    }

    public function test_replication_event_remains_bound_to_its_external_attestation(): void
    {
        $controlPlane = $this->controlPlane();
        $controlPlane->recordEnvelope($this->envelope(
            $this->payload('source-binding-0001'),
        ));

        DB::unprepared('DROP TRIGGER IF EXISTS database_replication_events_prevent_update');
        DB::table('database_replication_events')->where('sequence', 1)->update([
            'provider' => 'forged-provider',
        ]);
        $forged = DatabaseReplicationEvent::query()->where('sequence', 1)->sole();
        $canonicalEvent = new \ReflectionMethod($controlPlane, 'canonicalEvent');
        $canonicalJson = new \ReflectionMethod($controlPlane, 'canonicalJson');
        $canonical = $canonicalEvent->invoke(
            $controlPlane,
            $forged->getAttributes(),
            $forged->checks,
        );
        $json = $canonicalJson->invoke($controlPlane, $canonical);
        $recordHash = hash('sha256', $json);
        $signature = hash_hmac(
            'sha256',
            $json,
            'replication-ledger-feature-test-key-v1',
        );
        DB::table('database_replication_events')->where('sequence', 1)->update([
            'record_hash' => $recordHash,
            'signature' => $signature,
        ]);
        DB::table('database_replication_event_chain_heads')->where('key', 'primary')->update([
            'last_hash' => $recordHash,
        ]);

        $report = $controlPlane->verifyLedger();

        self::assertFalse($report['valid']);
        self::assertContains(
            'source_business_mismatch',
            array_column($report['failures'], 'code'),
        );
        self::assertFalse(
            app(DatabaseReplicationMonitor::class)->summary()['ledger']['items'][0]['attested'],
        );
    }

    public function test_full_ledger_verification_retries_a_concurrent_transition_without_false_alarm(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('snapshot-baseline-0001'),
        ));
        Carbon::setTestNow(now()->addSeconds(20));
        $transition = $this->envelope($this->payload(
            'snapshot-outage-0001',
            ['maximum_replica_lag_ms' => 12_000],
        ));
        $injected = false;

        DB::listen(function (QueryExecuted $query) use (&$injected, $transition): void {
            if ($injected
                || ! str_starts_with(strtolower(ltrim($query->sql)), 'select')
                || ! str_contains($query->sql, 'database_replication_events')) {
                return;
            }

            $injected = true;
            $this->controlPlane()->recordEnvelope($transition);
        });

        $report = $this->controlPlane()->verifyLedger();

        self::assertTrue($injected);
        self::assertTrue($report['valid']);
        self::assertSame(2, $report['event_count']);
        self::assertDatabaseCount('database_replication_events', 2);
    }

    public function test_policy_changes_re_evaluate_current_health_without_invalidating_history_or_blocking_ingestion(): void
    {
        $controlPlane = $this->controlPlane();
        $controlPlane->recordEnvelope($this->envelope(
            $this->payload('policy-history-baseline-0001'),
        ));

        config()->set('database_replication.topology.minimum_replicas', 3);

        $tightened = $controlPlane->verifyCurrentState();
        self::assertTrue($tightened['valid']);
        self::assertSame(MonitoringStatus::Outage->value, $tightened['effective_status']);
        self::assertFalse($tightened['effective_checks']['healthy_replica_floor']);
        self::assertTrue($controlPlane->verifyLedger()['valid']);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DatabaseReplicationMonitor::class)->summary()['current']['status'],
        );

        // A stricter policy is not evidence tampering. Fresh provider proof
        // must remain ingestible and preserve the resulting transition.
        Carbon::setTestNow(now()->addSeconds(20));
        $result = $controlPlane->recordEnvelope($this->envelope(
            $this->payload('policy-history-tightened-0002'),
        ));
        self::assertTrue($result['accepted']);
        self::assertSame('replication_outage', $result['event']?->event_type);
        self::assertTrue($controlPlane->verifyLedger()['valid']);

        config()->set('database_replication.topology.minimum_replicas', 1);
        $relaxed = $controlPlane->verifyCurrentState();
        self::assertTrue($relaxed['valid']);
        self::assertSame(MonitoringStatus::Operational->value, $relaxed['effective_status']);
        self::assertTrue($relaxed['effective_checks']['healthy_replica_floor']);
        self::assertTrue($controlPlane->verifyLedger()['valid']);
    }

    public function test_live_monitor_requires_fresh_state_and_recent_ledger_verification(): void
    {
        $this->controlPlane()->recordEnvelope($this->envelope(
            $this->payload('observation-0001'),
        ));
        $this->controlPlane()->verifyAndRecordHeartbeat();

        self::assertSame(
            MonitoringStatus::Operational->value,
            app(DatabaseReplicationMonitor::class)->summary()['status'],
        );

        Carbon::setTestNow(now()->addSeconds(301));
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DatabaseReplicationMonitor::class)->summary()['status'],
        );
    }

    private function controlPlane(): DatabaseReplicationControlPlane
    {
        return app(DatabaseReplicationControlPlane::class);
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
            'key_id' => 'observer-v1',
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function payload(string $operationId, array $overrides = []): array
    {
        return [
            'schema_version' => 1,
            'event_type' => 'topology_observation',
            'operation_id' => $operationId,
            'provider' => 'managed-database',
            'observer' => 'ubsc-replication-observer',
            'cluster_id' => 'ubsc-cluster-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'environment' => 'production',
            'primary_region' => 'ap-southeast-3',
            'writer_endpoint_id' => 'ubsc-writer-endpoint',
            'reader_endpoint_id' => 'ubsc-reader-endpoint',
            'writer_instance_id' => 'writer-a',
            'previous_writer_instance_id' => null,
            'topology_epoch' => 1,
            'observed_at' => now('UTC')->setMicrosecond(0)->toIso8601String(),
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
}
