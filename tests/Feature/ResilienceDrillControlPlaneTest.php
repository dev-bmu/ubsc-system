<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Models\ResilienceDrillEvidence;
use App\Services\Monitoring\MonitoringSnapshotBuilder;
use App\Services\Monitoring\ResilienceDrillMonitor;
use App\Services\Production\ResilienceDrillContract;
use App\Services\Production\ResilienceDrillLedger;
use App\Services\Production\ResilienceEvidenceVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use InvalidArgumentException;
use LogicException;
use RuntimeException;
use Tests\TestCase;

final class ResilienceDrillControlPlaneTest extends TestCase
{
    use RefreshDatabase;

    private ?\OpenSSLAsymmetricKey $privateKey = null;

    /** @var array<string, int|string> */
    private array $opensslOptions = [];

    protected function setUp(): void
    {
        parent::setUp();

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-24T02:00:00Z'));
        $options = [
            'private_key_bits' => 2_048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ];
        $windowsConfig = 'C:/xampp/php/extras/ssl/openssl.cnf';
        if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsConfig)) {
            $options['config'] = $windowsConfig;
        }
        $this->opensslOptions = $options;
        $key = openssl_pkey_new($options);
        self::assertInstanceOf(
            \OpenSSLAsymmetricKey::class,
            $key,
            implode('; ', $this->opensslErrors()),
        );
        $this->privateKey = $key;
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);

        config()->set('resilience_drills.enabled', true);
        config()->set('resilience_drills.enforce', true);
        config()->set('resilience_drills.target.environment', 'staging');
        config()->set(
            'resilience_drills.target.infrastructure_profile',
            'ubsc-staging-ha-twin-v1',
        );
        config()->set('resilience_drills.target.provider', 'managed-cloud');
        config()->set(
            'resilience_drills.target.orchestrator',
            'protected-game-day-runner',
        );
        config()->set('resilience_drills.evidence.verification_keys', [
            'orchestrator-v1' => 'base64:'.base64_encode((string) $details['key']),
        ]);
        config()->set('resilience_drills.evidence.active_key_ids', ['orchestrator-v1']);
        config()->set('resilience_drills.ledger.active_key_id', 'ledger-v1');
        config()->set('resilience_drills.ledger.signing_keys', [
            'ledger-v1' => 'base64:'.base64_encode(hash(
                'sha256',
                'resilience-ledger-test-key-v1',
                true,
            )),
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        if ($this->privateKey !== null) {
            openssl_free_key($this->privateKey);
            $this->privateKey = null;
        }

        parent::tearDown();
    }

    public function test_signed_complete_campaign_is_append_only_idempotent_and_live_ready(): void
    {
        $envelope = $this->envelope();
        $first = app(ResilienceDrillLedger::class)->record($envelope);
        $second = app(ResilienceDrillLedger::class)->record($envelope);

        self::assertSame($first->getKey(), $second->getKey());
        $this->assertDatabaseCount('resilience_drill_evidence', 1);
        self::assertSame(MonitoringStatus::Operational->value, $first->status);
        self::assertSame(5, $first->passed_count);
        self::assertSame(0, $first->failed_count);
        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);

        $summary = app(ResilienceDrillMonitor::class)->summary();
        self::assertSame(MonitoringStatus::Operational->value, $summary['status']);
        self::assertSame(5, data_get($summary, 'campaign.coverage.observed'));
        self::assertSame([], data_get($summary, 'campaign.coverage.missing'));

        $snapshot = app(MonitoringSnapshotBuilder::class)->build();
        self::assertSame(
            MonitoringStatus::Operational->value,
            data_get($snapshot, 'resilience.status'),
        );
        self::assertNotNull(collect($snapshot['services'])->firstWhere(
            'key',
            'resilience-drill-campaign',
        ));

        $contract = app(ResilienceDrillContract::class)->report(true);
        self::assertTrue($contract['valid'], json_encode($contract['checks']));
        self::assertTrue($contract['strict_valid'], json_encode($contract['checks']));
    }

    public function test_empty_chain_never_impersonates_a_completed_game_day(): void
    {
        $this->artisan('production:resilience-check', ['--strict' => true])
            ->assertSuccessful();
        $this->artisan('production:resilience-check', [
            '--strict' => true,
            '--live' => true,
        ])->assertFailed();

        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(ResilienceDrillMonitor::class)->summary()['status'],
        );
    }

    public function test_monitoring_fails_closed_when_enforcement_is_enabled_but_campaigns_are_disabled(): void
    {
        config()->set('resilience_drills.enabled', false);
        config()->set('resilience_drills.enforce', true);

        $summary = app(ResilienceDrillMonitor::class)->summary();

        self::assertSame(MonitoringStatus::Outage->value, $summary['status']);
        self::assertStringContainsString('campaigns are disabled', $summary['message']);
        self::assertFalse(app(ResilienceDrillContract::class)->report(false)['valid']);
    }

    public function test_invalid_signature_and_unsupported_fields_are_rejected(): void
    {
        $invalid = $this->envelope();
        $invalid['signature'] = base64_encode(str_repeat('x', 256));

        try {
            app(ResilienceDrillLedger::class)->record($invalid);
            self::fail('Invalid external evidence signature was accepted.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringContainsString('signature', $exception->getMessage());
        }

        $unknown = $this->payload();
        $unknown['operator_note'] = 'customer data does not belong here';
        $this->expectException(InvalidArgumentException::class);
        app(ResilienceDrillLedger::class)->record($this->envelope($unknown));
    }

    public function test_application_refuses_a_private_key_in_the_verification_keyring(): void
    {
        $privatePem = '';
        self::assertTrue(openssl_pkey_export(
            $this->privateKey,
            $privatePem,
            null,
            $this->opensslOptions,
        ));
        config()->set('resilience_drills.evidence.verification_keys', [
            'unsafe-v1' => 'base64:'.base64_encode($privatePem),
        ]);
        config()->set('resilience_drills.evidence.active_key_ids', ['unsafe-v1']);

        self::assertFalse(app(ResilienceEvidenceVerifier::class)->hasAnyKey());
        $report = app(ResilienceDrillContract::class)->report(false);
        $check = collect($report['checks'])->firstWhere(
            'code',
            'evidence.external_signature',
        );
        self::assertSame('fail', $check['status'] ?? null);
    }

    public function test_production_target_and_overlapping_faults_are_refused(): void
    {
        $production = $this->payload();
        $production['environment'] = 'production';
        config()->set('resilience_drills.target.environment', 'production');

        try {
            app(ResilienceDrillLedger::class)->record($this->envelope($production));
            self::fail('Production fault evidence was accepted.');
        } catch (InvalidArgumentException|RuntimeException $exception) {
            self::assertMatchesRegularExpression(
                '/production|safety/',
                strtolower($exception->getMessage()),
            );
        }

        $productionAlias = $this->payload();
        $productionAlias['environment'] = 'prod2';
        config()->set('resilience_drills.target.environment', 'prod2');
        try {
            app(ResilienceDrillLedger::class)->record($this->envelope($productionAlias));
            self::fail('A numbered production alias was accepted.');
        } catch (InvalidArgumentException|RuntimeException $exception) {
            self::assertStringContainsString('safety', strtolower($exception->getMessage()));
        }

        $delimiterFreeAlias = $this->payload();
        $delimiterFreeAlias['environment'] = 'productionblue';
        config()->set('resilience_drills.target.environment', 'productionblue');
        try {
            app(ResilienceDrillLedger::class)->record(
                $this->envelope($delimiterFreeAlias),
            );
            self::fail('A delimiter-free production alias was accepted.');
        } catch (InvalidArgumentException|RuntimeException $exception) {
            self::assertMatchesRegularExpression(
                '/production|safety/',
                strtolower($exception->getMessage()),
            );
        }

        config()->set('resilience_drills.target.environment', 'staging');
        $overlap = $this->payload();
        $overlap['scenarios'][1]['started_at'] = '2026-08-24T01:02:00Z';
        $this->expectException(InvalidArgumentException::class);
        app(ResilienceDrillLedger::class)->record($this->envelope($overlap));
    }

    public function test_guardrail_failure_is_preserved_as_outage_and_never_painted_green(): void
    {
        $payload = $this->payload();
        $payload['scenarios'][0]['peak_error_rate_basis_points'] = 350;
        $payload['scenarios'][0]['outcome'] = 'failed';

        $evidence = app(ResilienceDrillLedger::class)->record($this->envelope($payload));

        self::assertSame(MonitoringStatus::Outage->value, $evidence->status);
        self::assertSame(1, $evidence->failed_count);
        self::assertSame(MonitoringStatus::Outage->value, app(
            ResilienceDrillMonitor::class,
        )->summary()['status']);
        self::assertFalse(app(ResilienceDrillContract::class)->report(true)['valid']);
    }

    public function test_missing_signed_campaign_control_is_preserved_as_outage(): void
    {
        $payload = $this->payload();
        $payload['production_access_denied'] = false;

        $evidence = app(ResilienceDrillLedger::class)->record($this->envelope($payload));

        self::assertSame(MonitoringStatus::Outage->value, $evidence->status);
        self::assertFalse($evidence->campaign_controls_passed);
        self::assertSame(5, $evidence->passed_count);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(ResilienceDrillMonitor::class)->summary()['status'],
        );
    }

    public function test_abort_is_degraded_and_cannot_claim_a_pass(): void
    {
        $payload = $this->payload();
        $payload['scenarios'][2]['abort_triggered'] = true;
        $payload['scenarios'][2]['outcome'] = 'aborted';

        $evidence = app(ResilienceDrillLedger::class)->record($this->envelope($payload));

        self::assertSame(MonitoringStatus::Degraded->value, $evidence->status);
        self::assertSame(1, $evidence->aborted_count);
        self::assertFalse(app(ResilienceDrillContract::class)->report(true)['valid']);

        $lying = $this->payload();
        $lying['campaign_id'] = '22222222-2222-4222-8222-222222222222';
        $lying['scenarios'][2]['abort_triggered'] = true;
        $this->expectException(InvalidArgumentException::class);
        app(ResilienceDrillLedger::class)->record($this->envelope($lying));
    }

    public function test_campaign_id_reuse_with_different_payload_is_refused(): void
    {
        app(ResilienceDrillLedger::class)->record($this->envelope());
        $changed = $this->payload();
        $changed['scenarios'][0]['detection_seconds'] = 9;

        $this->expectException(InvalidArgumentException::class);
        app(ResilienceDrillLedger::class)->record($this->envelope($changed));
    }

    public function test_ledger_key_rotation_preserves_history_only_while_old_keys_are_retained(): void
    {
        app(ResilienceDrillLedger::class)->record($this->envelope());
        $v1 = (array) config('resilience_drills.ledger.signing_keys');
        config()->set('resilience_drills.ledger.signing_keys', [
            ...$v1,
            'ledger-v2' => 'base64:'.base64_encode(hash(
                'sha256',
                'resilience-ledger-test-key-v2',
                true,
            )),
        ]);
        config()->set('resilience_drills.ledger.active_key_id', 'ledger-v2');
        $next = $this->payload();
        $next['campaign_id'] = '22222222-2222-4222-8222-222222222222';

        $second = app(ResilienceDrillLedger::class)->record($this->envelope($next));

        self::assertSame(2, $second->sequence);
        self::assertSame('ledger-v2', $second->ledger_key_id);
        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);

        config()->set('resilience_drills.ledger.signing_keys', [
            'ledger-v2' => config('resilience_drills.ledger.signing_keys.ledger-v2'),
        ]);
        $withoutHistoryKey = app(ResilienceDrillLedger::class)->verify();
        self::assertFalse($withoutHistoryKey['valid']);
        self::assertContains(
            'ledger_signature_mismatch',
            array_column($withoutHistoryKey['failures'], 'code'),
        );
    }

    public function test_retired_source_key_verifies_history_but_cannot_authorize_new_campaigns(): void
    {
        app(ResilienceDrillLedger::class)->record($this->envelope());
        $secondKey = openssl_pkey_new($this->opensslOptions);
        self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $secondKey);
        $details = openssl_pkey_get_details($secondKey);
        self::assertIsArray($details);
        config()->set('resilience_drills.evidence.verification_keys', [
            ...(array) config('resilience_drills.evidence.verification_keys'),
            'orchestrator-v2' => 'base64:'.base64_encode((string) $details['key']),
        ]);
        config()->set('resilience_drills.evidence.active_key_ids', ['orchestrator-v2']);
        $next = $this->payload();
        $next['campaign_id'] = '22222222-2222-4222-8222-222222222222';

        try {
            app(ResilienceDrillLedger::class)->record($this->envelope($next));
            self::fail('A retired source key authorized a new campaign.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringContainsString('not authorized', $exception->getMessage());
        }

        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);
        $accepted = app(ResilienceDrillLedger::class)->record($this->envelope(
            $next,
            'orchestrator-v2',
            $secondKey,
        ));
        self::assertSame('orchestrator-v2', $accepted->source_key_id);
        self::assertSame(2, $accepted->sequence);
        openssl_free_key($secondKey);
    }

    public function test_invalid_calendar_instants_and_non_integer_measurements_are_rejected(): void
    {
        $impossible = $this->payload();
        $impossible['started_at'] = '2026-02-30T01:00:00Z';
        try {
            app(ResilienceDrillLedger::class)->record($this->envelope($impossible));
            self::fail('An impossible RFC3339 date was accepted.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringContainsString('real RFC3339', $exception->getMessage());
        }

        $unsupportedDatabaseYear = $this->payload();
        $unsupportedDatabaseYear['started_at'] = '0001-01-01T00:00:00Z';
        try {
            app(ResilienceDrillLedger::class)->record(
                $this->envelope($unsupportedDatabaseYear),
            );
            self::fail('A database-incompatible evidence year was accepted.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringContainsString('real RFC3339', $exception->getMessage());
        }

        $numericString = $this->payload();
        $numericString['scenarios'][0]['detection_seconds'] = '8';
        try {
            app(ResilienceDrillLedger::class)->record($this->envelope($numericString));
            self::fail('A numeric string bypassed the integer evidence schema.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringContainsString('safe boundary', $exception->getMessage());
        }

        $floatingPoint = $this->payload();
        $floatingPoint['scenarios'][0]['detection_seconds'] = 8.0;
        $this->expectException(InvalidArgumentException::class);
        app(ResilienceEvidenceVerifier::class)->canonicalJson($floatingPoint);
    }

    public function test_controlled_abort_cannot_downgrade_an_integrity_failure(): void
    {
        $payload = $this->payload();
        $payload['scenarios'][2]['abort_triggered'] = true;
        $payload['scenarios'][2]['checks']['no_data_loss'] = false;
        $payload['scenarios'][2]['outcome'] = 'failed';

        $evidence = app(ResilienceDrillLedger::class)->record($this->envelope($payload));

        self::assertSame(MonitoringStatus::Outage->value, $evidence->status);
        self::assertSame(1, $evidence->failed_count);
        self::assertSame(0, $evidence->aborted_count);
    }

    public function test_ledger_hash_and_monitoring_are_invariant_when_display_timezone_changes(): void
    {
        $evidence = app(ResilienceDrillLedger::class)->record($this->envelope());
        $completedTimestamp = $evidence->completed_at?->getTimestamp();

        config()->set('app.timezone', 'America/New_York');
        $reloaded = ResilienceDrillEvidence::query()->sole();

        self::assertSame($completedTimestamp, $reloaded->completed_at?->getTimestamp());
        self::assertSame('UTC', $reloaded->completed_at?->getTimezone()->getName());
        self::assertTrue(app(ResilienceDrillLedger::class)->verify()['valid']);
        self::assertSame(
            MonitoringStatus::Operational->value,
            app(ResilienceDrillMonitor::class)->summary()['status'],
        );
    }

    public function test_active_topology_or_required_scenario_drift_invalidates_old_proof(): void
    {
        app(ResilienceDrillLedger::class)->record($this->envelope());

        config()->set(
            'resilience_drills.target.infrastructure_profile',
            'ubsc-staging-ha-twin-v2',
        );
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(ResilienceDrillMonitor::class)->summary()['status'],
        );
        self::assertFalse(app(ResilienceDrillContract::class)->report(true)['valid']);

        config()->set(
            'resilience_drills.target.infrastructure_profile',
            'ubsc-staging-ha-twin-v1',
        );
        config()->set('resilience_drills.scenarios.search_index_failover', [
            'fault_domain' => 'search',
            'maximum_recovery_seconds' => 180,
        ]);
        config()->set('resilience_drills.campaign.required_scenarios', [
            ...(array) config('resilience_drills.campaign.required_scenarios'),
            'search_index_failover',
        ]);
        $summary = app(ResilienceDrillMonitor::class)->summary();
        self::assertSame(MonitoringStatus::Outage->value, $summary['status']);
        self::assertSame(
            ['search_index_failover'],
            data_get($summary, 'campaign.coverage.missing'),
        );
        self::assertFalse(app(ResilienceDrillContract::class)->report(true)['valid']);
    }

    public function test_monitoring_fails_closed_when_evidence_storage_cannot_be_read(): void
    {
        Schema::rename('resilience_drill_evidence', 'resilience_drill_evidence_unavailable');
        try {
            $summary = app(ResilienceDrillMonitor::class)->summary();
            self::assertSame(MonitoringStatus::Outage->value, $summary['status']);
            self::assertStringContainsString('unavailable', $summary['message']);
        } finally {
            Schema::rename('resilience_drill_evidence_unavailable', 'resilience_drill_evidence');
        }
    }

    public function test_command_accepts_bounded_pretty_envelope_larger_than_payload_cap(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'ubsc-resilience-envelope-');
        self::assertIsString($path);
        $json = json_encode($this->envelope(), JSON_THROW_ON_ERROR);
        file_put_contents($path, str_repeat(" \n", 70_000).$json);

        try {
            $this->artisan('resilience:evidence:record', ['file' => $path])
                ->assertSuccessful();
            $this->assertDatabaseCount('resilience_drill_evidence', 1);
        } finally {
            @unlink($path);
        }
    }

    public function test_database_guards_refuse_row_mutation_and_head_tampering_is_detected(): void
    {
        app(ResilienceDrillLedger::class)->record($this->envelope());

        try {
            DB::table('resilience_drill_evidence')->update([
                'worst_recovery_seconds' => 1,
            ]);
            self::fail('The database accepted an evidence update.');
        } catch (QueryException) {
            self::assertDatabaseHas('resilience_drill_evidence', [
                'worst_recovery_seconds' => 67,
            ]);
        }
        try {
            DB::table('resilience_drill_evidence')->delete();
            self::fail('The database accepted evidence deletion.');
        } catch (QueryException) {
            $this->assertDatabaseCount('resilience_drill_evidence', 1);
        }

        DB::table('resilience_drill_chain_heads')
            ->where('key', 'primary')
            ->update(['last_hash' => str_repeat('0', 64)]);
        $tampered = app(ResilienceDrillLedger::class)->verify();
        self::assertFalse($tampered['valid']);
        self::assertContains('chain_head_mismatch', array_column($tampered['failures'], 'code'));
    }

    public function test_model_mutation_and_destructive_migration_rollback_are_refused(): void
    {
        $evidence = app(ResilienceDrillLedger::class)->record($this->envelope());

        try {
            $evidence->forceFill(['status' => MonitoringStatus::Outage->value])->save();
            self::fail('Append-only evidence was updated.');
        } catch (LogicException) {
            self::assertDatabaseHas('resilience_drill_evidence', [
                'status' => MonitoringStatus::Operational->value,
            ]);
        }
        try {
            (new ResilienceDrillEvidence)->save();
            self::fail('The model API bypassed the transactional append path.');
        } catch (LogicException) {
            $this->assertDatabaseCount('resilience_drill_evidence', 1);
        }

        $migration = require database_path(
            'migrations/2026_08_24_000003_create_resilience_drill_control_plane.php',
        );
        $this->expectException(RuntimeException::class);
        $migration->down();
    }

    public function test_stale_campaign_and_stale_ledger_verification_fail_live_gate(): void
    {
        app(ResilienceDrillLedger::class)->record($this->envelope());
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-12-10T02:00:00Z'));

        $summary = app(ResilienceDrillMonitor::class)->summary();

        self::assertSame(MonitoringStatus::Outage->value, $summary['status']);
        self::assertFalse(app(ResilienceDrillContract::class)->report(true)['valid']);
    }

    public function test_static_contract_rejects_unsafe_blast_radius_flags_and_missing_failure_domain(): void
    {
        config()->set('resilience_drills.safety.provider_kill_switch_required', false);
        config()->set('resilience_drills.safety.maximum_blast_radius_percent', 80);
        config()->set('resilience_drills.campaign.required_scenarios', [
            'application_node_loss',
        ]);
        config()->set('resilience_drills.evidence.maximum_payload_bytes', 200_000);
        config()->set(
            'resilience_drills.evidence.verification_warning_after_seconds',
            900_000,
        );
        config()->set(
            'resilience_drills.evidence.verification_outage_after_seconds',
            100,
        );

        $report = app(ResilienceDrillContract::class)->report(false);
        $failed = array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));

        self::assertContains('campaign.failure_domains', $failed);
        self::assertContains('safety.bounded_experiment', $failed);
        self::assertContains('evidence.bounded_input', $failed);
        self::assertContains('evidence.verification_freshness', $failed);
    }

    public function test_direct_ingestion_cannot_bypass_disabled_safety_flags_or_absolute_blast_cap(): void
    {
        config()->set('resilience_drills.safety.provider_kill_switch_required', false);
        try {
            app(ResilienceDrillLedger::class)->record($this->envelope());
            self::fail('Direct ingestion bypassed the mandatory kill switch.');
        } catch (RuntimeException $exception) {
            self::assertStringContainsString('safety boundary', $exception->getMessage());
        }

        config()->set('resilience_drills.safety.provider_kill_switch_required', true);
        config()->set('resilience_drills.safety.maximum_blast_radius_percent', 80);
        $payload = $this->payload();
        $payload['scenarios'][0]['blast_radius_percent'] = 80;

        $this->expectException(InvalidArgumentException::class);
        app(ResilienceDrillLedger::class)->record($this->envelope($payload));
    }

    /** @param array<string, mixed>|null $payload */
    private function envelope(
        ?array $payload = null,
        string $keyId = 'orchestrator-v1',
        ?\OpenSSLAsymmetricKey $signingKey = null,
    ): array {
        $payload ??= $this->payload();
        $signature = '';
        $signed = openssl_sign(
            app(ResilienceEvidenceVerifier::class)->canonicalJson($payload),
            $signature,
            $signingKey ?? $this->privateKey,
            OPENSSL_ALGO_SHA256,
        );
        self::assertTrue($signed);

        return [
            'schema_version' => 1,
            'key_id' => $keyId,
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
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
        $scenario = static fn (
            string $key,
            string $start,
            string $end,
            int $detection,
            int $recovery,
            int $errorBasisPoints,
            int $p95,
        ): array => [
            'key' => $key,
            'fault_domain' => (string) $definitions[$key]['fault_domain'],
            'started_at' => $start,
            'completed_at' => $end,
            'outcome' => 'passed',
            'expected_recovery_seconds' => (int) $definitions[$key]['maximum_recovery_seconds'],
            'detection_seconds' => $detection,
            'recovery_seconds' => $recovery,
            'blast_radius_percent' => 50,
            'healthy_instances_remaining' => 1,
            'peak_error_rate_basis_points' => $errorBasisPoints,
            'peak_p95_ms' => $p95,
            'abort_triggered' => false,
            'checks' => $checks,
        ];

        return [
            'schema_version' => 1,
            'campaign_id' => '11111111-1111-4111-8111-111111111111',
            'environment' => 'staging',
            'release' => 'release-2026.08.24-a1b2c3d',
            'infrastructure_profile' => 'ubsc-staging-ha-twin-v1',
            'provider' => 'managed-cloud',
            'orchestrator' => 'protected-game-day-runner',
            'approval_reference' => 'CHG-2026-0001',
            'approval_verified' => true,
            'change_reference_verified' => true,
            'orchestrator_identity_verified' => true,
            'production_access_denied' => true,
            'traffic_mode' => 'synthetic_only',
            'started_at' => '2026-08-24T01:00:00Z',
            'completed_at' => '2026-08-24T01:20:00Z',
            'scenarios' => [
                $scenario('application_node_loss', '2026-08-24T01:01:00Z', '2026-08-24T01:03:00Z', 8, 24, 40, 860),
                $scenario('load_balancer_failover', '2026-08-24T01:03:30Z', '2026-08-24T01:04:30Z', 6, 20, 35, 810),
                $scenario('queue_worker_restart', '2026-08-24T01:05:00Z', '2026-08-24T01:07:00Z', 10, 31, 10, 720),
                $scenario('cache_primary_failover', '2026-08-24T01:09:00Z', '2026-08-24T01:12:00Z', 12, 46, 80, 1_250),
                $scenario('database_writer_failover', '2026-08-24T01:14:00Z', '2026-08-24T01:18:00Z', 9, 67, 120, 1_870),
            ],
        ];
    }

    /** @return list<string> */
    private function opensslErrors(): array
    {
        $errors = [];
        while (($error = openssl_error_string()) !== false) {
            $errors[] = $error;
        }

        return $errors;
    }
}
