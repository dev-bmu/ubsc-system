<?php

namespace Tests\Feature;

use App\Models\CapacityScalingPlan;
use App\Models\CapacityScalingState;
use App\Services\Capacity\CapacityAutoscalingPlanner;
use App\Services\Capacity\CapacityEnvelopeSigner;
use App\Services\Capacity\CapacityLoadEvidenceStore;
use App\Services\Capacity\CapacityPlatformObservationStore;
use App\Services\Monitoring\CapacityControlMonitor;
use App\Services\Monitoring\PerformanceMetricRepository;
use App\Services\Production\ApplicationNodeInventoryVerifier;
use App\Services\Production\CapacityPlanningContract;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

final class CapacityControlPlaneTest extends TestCase
{
    use RefreshDatabase;

    private const EVIDENCE_KEY = 'evidence-signing-key-for-capacity-tests-2026-v1';

    private const OBSERVATION_KEY = 'observation-signing-key-capacity-tests-2026-v1';

    private const PLAN_KEY = 'plan-signing-key-for-capacity-tests-2026-v1';

    protected function setUp(): void
    {
        parent::setUp();

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));
        config()->set('capacity_planning.enabled', true);
        config()->set('capacity_planning.enforce', true);
        config()->set('capacity_planning.mode', 'signed_plan');
        config()->set('capacity_planning.environment', 'production');
        config()->set('capacity_planning.infrastructure_profile', 'ubsc-web-2x-2cpu-4gb');
        config()->set('capacity_planning.platform.provider', 'kubernetes');
        config()->set('capacity_planning.platform.managed_targets', ['web']);
        config()->set('capacity_planning.platform.active_key_id', 'platform-v1');
        config()->set('capacity_planning.platform.signing_keys', ['platform-v1' => self::OBSERVATION_KEY]);
        config()->set('capacity_planning.evidence.active_key_id', 'ci-v1');
        config()->set('capacity_planning.evidence.signing_keys', ['ci-v1' => self::EVIDENCE_KEY]);
        config()->set('capacity_planning.evidence.required_scopes', ['public_read']);
        config()->set('capacity_planning.evidence.expected_application_instances', 2);
        config()->set('capacity_planning.plan.active_key_id', 'plan-v1');
        config()->set('capacity_planning.plan.signing_keys', ['plan-v1' => self::PLAN_KEY]);
        config()->set('monitoring.release', 'release-2026.08.24-a1b2c3d');
        config()->set('background_jobs.worker_capacity.automation_enabled', true);
        config()->set('background_jobs.monitoring.queues', []);
        config()->set('monitoring.queue.connection', 'capacity-test-disabled');
        config()->set('performance.enabled', true);
        config()->set('performance.driver', 'database');
        config()->set('performance.window_minutes', 5);
        config()->set('performance.minimum_samples', 1);
        config()->set('capacity_planning.guardrails.require_database_telemetry_for_scale_up', false);
        config()->set('cache.default', 'database');
        config()->set('cache.stores.database.driver', 'database');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();

        parent::tearDown();
    }

    public function test_signed_evidence_and_observation_are_idempotent_but_replay_tampering_is_rejected(): void
    {
        $evidenceEnvelope = $this->evidenceEnvelope();
        $evidence = app(CapacityLoadEvidenceStore::class)->record($evidenceEnvelope);
        $same = app(CapacityLoadEvidenceStore::class)->record($evidenceEnvelope);

        $this->assertSame($evidence->id, $same->id);
        $this->assertDatabaseCount('capacity_load_evidence', 1);

        $tampered = $evidenceEnvelope;
        $tampered['payload']['recommended_operational_rps'] = 9;
        $this->expectException(InvalidArgumentException::class);
        app(CapacityLoadEvidenceStore::class)->record($tampered);
    }

    public function test_platform_observation_rejects_wrong_release_and_stale_state(): void
    {
        $wrongRelease = $this->observationEnvelope();
        $wrongRelease['payload']['release'] = 'release-other';
        $wrongRelease = $this->sign('platform', $wrongRelease['payload']);

        try {
            app(CapacityPlatformObservationStore::class)->record($wrongRelease);
            $this->fail('Wrong-release observation was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }

        $stale = $this->observationEnvelope();
        $stale['payload']['observation_id'] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        $stale['payload']['observed_at'] = '2026-08-24T09:57:00+00:00';
        $stale = $this->sign('platform', $stale['payload']);

        $this->expectException(InvalidArgumentException::class);
        app(CapacityPlatformObservationStore::class)->record($stale);
    }

    public function test_platform_observation_requires_a_versioned_resource_snapshot_for_every_managed_target(): void
    {
        $missingToken = $this->observationEnvelope();
        unset($missingToken['payload']['targets']['web']['state_token']);
        $missingToken = $this->sign('platform', $missingToken['payload']);

        try {
            app(CapacityPlatformObservationStore::class)->record($missingToken);
            $this->fail('An observation without a provider state token was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }

        config()->set('background_jobs.monitoring.queues', ['default']);
        $missingQueue = $this->observationEnvelope();

        try {
            app(CapacityPlatformObservationStore::class)->record($missingQueue);
            $this->fail('A partial managed-target snapshot was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }

        $missingQueue['payload']['targets']['queue:default'] = [
            'kind' => 'queue',
            'state_token' => hash('sha256', 'queue-default-state-v1'),
            'current_instances' => 1,
            'ready_instances' => 1,
            'cpu_utilization_percent' => 20.0,
            'memory_utilization_percent' => 25.0,
        ];
        $complete = $this->sign('platform', $missingQueue['payload']);

        app(CapacityPlatformObservationStore::class)->record($complete);

        $this->assertDatabaseCount('capacity_platform_observations', 1);
    }

    public function test_release_acceptance_requires_fresh_signed_and_fully_ready_web_inventory(): void
    {
        config()->set('production.application_instances', 2);
        config()->set('capacity_planning.web.minimum_instances', 2);
        config()->set('capacity_planning.web.maximum_instances', 20);

        $verifier = app(ApplicationNodeInventoryVerifier::class);
        self::assertSame(
            'inventory.provider_evidence_missing',
            $verifier->verify(2)['code'],
        );

        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());

        $converged = $verifier->verify(2);
        self::assertTrue($converged['valid']);
        self::assertSame('inventory.nodes_converged', $converged['code']);
        self::assertSame(
            'inventory.nodes_not_converged',
            $verifier->verify(3)['code'],
        );
        self::assertSame(
            'inventory.expected_count_out_of_bounds',
            $verifier->verify(21)['code'],
        );

        CarbonImmutable::setTestNow(CarbonImmutable::now('UTC')->addSeconds(91));
        self::assertSame(
            'inventory.provider_evidence_missing',
            $verifier->verify(2)['code'],
        );
    }

    public function test_signed_capacity_inputs_reject_unexpected_metadata_before_storage(): void
    {
        $evidence = $this->evidenceEnvelope();
        $evidence['payload']['customer_email'] = 'must-not-be-stored@example.test';
        $evidence = $this->sign('evidence', $evidence['payload']);

        try {
            app(CapacityLoadEvidenceStore::class)->record($evidence);
            $this->fail('Unexpected evidence metadata was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_load_evidence', 0);
        }

        $wrongRelease = $this->evidenceEnvelope();
        $wrongRelease['payload']['release'] = 'release-other';
        $wrongRelease = $this->sign('evidence', $wrongRelease['payload']);
        try {
            app(CapacityLoadEvidenceStore::class)->record($wrongRelease);
            $this->fail('Evidence for another release was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_load_evidence', 0);
        }

        $wrongTopology = $this->evidenceEnvelope();
        $wrongTopology['payload']['application_instances'] = 1;
        $wrongTopology = $this->sign('evidence', $wrongTopology['payload']);
        try {
            app(CapacityLoadEvidenceStore::class)->record($wrongTopology);
            $this->fail('Evidence for a different tested topology was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_load_evidence', 0);
        }

        $observation = $this->observationEnvelope();
        $observation['payload']['targets']['web']['provider_token'] = 'must-not-be-stored';
        $observation = $this->sign('platform', $observation['payload']);

        try {
            app(CapacityPlatformObservationStore::class)->record($observation);
            $this->fail('Unexpected platform metadata was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }

        $ambiguousTime = $this->observationEnvelope();
        $ambiguousTime['payload']['observed_at'] = '2026-08-24 09:59:30';
        $ambiguousTime = $this->sign('platform', $ambiguousTime['payload']);
        try {
            app(CapacityPlatformObservationStore::class)->record($ambiguousTime);
            $this->fail('A timezone-ambiguous provider timestamp was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }
    }

    public function test_signed_inputs_reject_numeric_precision_that_is_not_canonical_across_runtimes(): void
    {
        $evidence = $this->evidenceEnvelope();
        $evidence['payload']['error_rate_percent'] = 0.00001;
        $evidence = $this->sign('evidence', $evidence['payload']);
        try {
            app(CapacityLoadEvidenceStore::class)->record($evidence);
            $this->fail('Over-precise capacity evidence was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_load_evidence', 0);
        }

        $observation = $this->observationEnvelope();
        $observation['payload']['targets']['web']['cpu_utilization_percent'] = 0.000001;
        $observation = $this->sign('platform', $observation['payload']);
        try {
            app(CapacityPlatformObservationStore::class)->record($observation);
            $this->fail('Over-precise provider resource telemetry was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }
    }

    public function test_signed_inputs_reject_impossible_rfc3339_calendar_values(): void
    {
        $evidence = $this->evidenceEnvelope();
        $evidence['payload']['generated_at'] = '2026-02-30T09:59:00+00:00';
        $evidence = $this->sign('evidence', $evidence['payload']);
        try {
            app(CapacityLoadEvidenceStore::class)->record($evidence);
            $this->fail('An impossible evidence calendar date was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_load_evidence', 0);
        }

        $observation = $this->observationEnvelope();
        $observation['payload']['observed_at'] = '2026-08-24T25:00:00+00:00';
        $observation = $this->sign('platform', $observation['payload']);
        try {
            app(CapacityPlatformObservationStore::class)->record($observation);
            $this->fail('An impossible provider clock value was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }

        $unknownOffset = $this->observationEnvelope();
        $unknownOffset['payload']['observed_at'] = '2026-08-24T09:59:30-00:00';
        $unknownOffset = $this->sign('platform', $unknownOffset['payload']);
        try {
            app(CapacityPlatformObservationStore::class)->record($unknownOffset);
            $this->fail('A timestamp with an explicitly unknown UTC offset was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 0);
        }
    }

    public function test_planner_is_signed_persisted_and_idempotent_within_one_control_window(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest(
            'public_read',
            80,
            false,
            CarbonImmutable::now('UTC'),
        );

        $first = app(CapacityAutoscalingPlanner::class)->plan();
        $second = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertTrue($first['persisted']);
        $this->assertFalse($first['reused']);
        $this->assertTrue($second['reused']);
        $this->assertSame(data_get($first, 'payload.plan_id'), data_get($second, 'payload.plan_id'));
        $this->assertSame('hold', data_get($first, 'payload.status'));
        $this->assertTrue(app(CapacityEnvelopeSigner::class)->verify(
            'plan',
            $first['payload'],
            $first['key_id'],
            $first['signature'],
        ));
        $this->assertDatabaseCount('capacity_scaling_plans', 1);
        $this->assertDatabaseCount('capacity_scaling_states', 1);
        $state = CapacityScalingState::query()->firstOrFail();
        $this->assertStringStartsWith('web@', (string) $state->target_key);
        $this->assertSame(1, $state->version);
    }

    public function test_primary_evidence_is_deterministic_when_public_read_is_not_required(): void
    {
        config()->set('capacity_planning.evidence.required_scopes', ['write', 'admin']);

        $write = $this->evidenceEnvelope();
        $write['payload']['test_id'] = 'github-write-9001-1';
        $write['payload']['capacity_scope'] = 'write';
        $write = app(CapacityLoadEvidenceStore::class)->record(
            $this->sign('evidence', $write['payload']),
        );

        $admin = $this->evidenceEnvelope();
        $admin['payload']['test_id'] = 'github-admin-9001-1';
        $admin['payload']['capacity_scope'] = 'admin';
        $admin = app(CapacityLoadEvidenceStore::class)->record(
            $this->sign('evidence', $admin['payload']),
        );

        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        $envelope = app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();

        $this->assertSame((string) $admin->public_id, data_get($envelope, 'payload.evidence_id'));
        $this->assertNotSame((string) $write->public_id, data_get($envelope, 'payload.evidence_id'));
        $this->assertTrue(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan));
        $this->assertSame('admin', data_get(
            app(CapacityControlMonitor::class)->summary(),
            'evidence.scope',
        ));
    }

    public function test_tampered_stored_plan_is_never_reused(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();

        DB::table('capacity_scaling_plans')->update(['status' => 'actionable']);

        $this->expectException(RuntimeException::class);
        app(CapacityAutoscalingPlanner::class)->plan();
    }

    public function test_signed_plan_binds_the_database_deduplication_hash(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();

        $plan = CapacityScalingPlan::query()->firstOrFail();
        DB::table('capacity_scaling_plans')->where('id', $plan->id)->update([
            'input_hash' => hash('sha256', 'corrupt-deduplication-index'),
        ]);

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan(
            CapacityScalingPlan::query()->firstOrFail(),
        ));
    }

    public function test_non_blocked_plan_fails_closed_when_a_signed_source_artifact_disappears(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();

        DB::table('capacity_load_evidence')->delete();

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan->fresh()));
    }

    public function test_blocked_plan_is_superseded_when_a_missing_source_arrives(): void
    {
        $blocked = app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();

        $this->assertSame('blocked', data_get($blocked, 'payload.status'));
        $this->assertTrue(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan));

        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan->fresh()));
    }

    public function test_idempotent_replay_rejects_tampered_denormalized_evidence_storage(): void
    {
        $envelope = $this->evidenceEnvelope();
        $evidence = app(CapacityLoadEvidenceStore::class)->record($envelope);
        DB::table('capacity_load_evidence')->where('id', $evidence->id)->update([
            'p95_ms' => 299,
        ]);

        $this->assertNull(app(CapacityLoadEvidenceStore::class)->latestForCurrent('public_read'));

        $this->expectException(InvalidArgumentException::class);
        app(CapacityLoadEvidenceStore::class)->record($envelope);
    }

    public function test_capacity_artifact_ingestion_timestamps_are_integrity_checked(): void
    {
        $evidence = app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();

        DB::table('capacity_load_evidence')->where('id', $evidence->id)->update([
            'imported_at' => CarbonImmutable::now('UTC')->addHour(),
        ]);
        DB::table('capacity_platform_observations')->where('id', $observation->id)->update([
            'recorded_at' => CarbonImmutable::now('UTC')->addHour(),
        ]);
        DB::table('capacity_scaling_plans')->where('id', $plan->id)->update([
            'recorded_at' => CarbonImmutable::now('UTC')->addSecond(),
        ]);

        $this->assertNull(app(CapacityLoadEvidenceStore::class)->latestForCurrent());
        $this->assertNull(app(CapacityPlatformObservationStore::class)->latestForCurrent());
        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan->fresh()));
    }

    public function test_non_blocked_plan_fails_closed_when_its_provider_observation_is_tampered(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();

        DB::table('capacity_platform_observations')->where('id', $observation->id)->update([
            'source_signature' => str_repeat('0', 64),
        ]);

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan->fresh()));
    }

    public function test_signed_plan_fails_closed_when_target_metrics_do_not_match_its_source_observation(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();
        $payload = (array) $plan->payload;
        $payload['targets']['web']['cpu_utilization_percent'] = 43.0;
        $signed = app(CapacityEnvelopeSigner::class)->sign('plan', $payload);

        DB::table('capacity_scaling_plans')->where('id', $plan->id)->update([
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'payload_hash' => app(CapacityEnvelopeSigner::class)->hash($payload),
            'signing_key_id' => $signed['key_id'],
            'signature' => $signed['signature'],
        ]);

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan->fresh()));
    }

    public function test_signed_plan_rejects_noncanonical_guardrail_precision(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $plan = CapacityScalingPlan::query()->firstOrFail();
        $payload = (array) $plan->payload;
        $payload['guardrails']['connection_utilization_percent'] = 12.345;
        $signed = app(CapacityEnvelopeSigner::class)->sign('plan', $payload);

        DB::table('capacity_scaling_plans')->where('id', $plan->id)->update([
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'payload_hash' => app(CapacityEnvelopeSigner::class)->hash($payload),
            'signing_key_id' => $signed['key_id'],
            'signature' => $signed['signature'],
        ]);

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($plan->fresh()));
    }

    public function test_a_new_provider_observation_immediately_supersedes_the_previous_plan(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $oldPlan = CapacityScalingPlan::query()->firstOrFail();

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-24 10:00:20', 'UTC'));
        $newObservation = $this->observationEnvelope();
        $newObservation['payload']['observation_id'] = '77777777-7777-4777-8777-777777777777';
        $newObservation['payload']['observed_at'] = '2026-08-24T10:00:20+00:00';
        $newObservation['payload']['targets']['web']['state_token'] = hash(
            'sha256',
            'newer-provider-state',
        );
        app(CapacityPlatformObservationStore::class)->record(
            $this->sign('platform', $newObservation['payload']),
        );

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan($oldPlan->fresh()));

        $newPlan = app(CapacityAutoscalingPlanner::class)->plan();
        $this->assertNotSame(data_get($oldPlan->payload, 'plan_id'), data_get($newPlan, 'payload.plan_id'));
        $this->assertTrue(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan(
            CapacityScalingPlan::query()->latest('id')->firstOrFail(),
        ));
    }

    public function test_blocked_plan_deduplication_is_isolated_between_releases_even_without_inputs(): void
    {
        $first = app(CapacityAutoscalingPlanner::class)->plan();

        config()->set('monitoring.release', 'release-2026.08.24-next');
        $second = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertSame('blocked', data_get($first, 'payload.status'));
        $this->assertSame('blocked', data_get($second, 'payload.status'));
        $this->assertNotSame(data_get($first, 'payload.plan_id'), data_get($second, 'payload.plan_id'));
        $this->assertNotSame(data_get($first, 'payload.input_hash'), data_get($second, 'payload.input_hash'));
        $this->assertDatabaseCount('capacity_scaling_plans', 2);
    }

    public function test_anti_flap_state_is_isolated_between_releases(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $firstKey = (string) CapacityScalingState::query()->firstOrFail()->target_key;

        config()->set('monitoring.release', 'release-2026.08.24-next');
        $evidence = $this->evidenceEnvelope();
        $evidence['payload']['test_id'] = 'github-9001-next';
        $evidence['payload']['release'] = 'release-2026.08.24-next';
        app(CapacityLoadEvidenceStore::class)->record($this->sign('evidence', $evidence['payload']));
        $observation = $this->observationEnvelope();
        $observation['payload']['observation_id'] = '44444444-4444-4444-8444-444444444444';
        $observation['payload']['release'] = 'release-2026.08.24-next';
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $observation['payload']));
        app(CapacityAutoscalingPlanner::class)->plan();

        $keys = CapacityScalingState::query()->orderBy('target_key')->pluck('target_key')->all();
        $this->assertCount(2, $keys);
        $this->assertNotSame($firstKey, $keys[0] === $firstKey ? $keys[1] : $keys[0]);
        $this->assertTrue(collect($keys)->every(
            static fn (string $key): bool => str_starts_with($key, 'web@'),
        ));
    }

    public function test_provider_resource_pressure_scales_up_without_waiting_for_http_samples_and_binds_state(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = $this->observationEnvelope();
        $observation['payload']['targets']['web']['cpu_utilization_percent'] = 85.0;
        $observation = $this->sign('platform', $observation['payload']);
        app(CapacityPlatformObservationStore::class)->record($observation);

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertSame('actionable', data_get($plan, 'payload.status'));
        $this->assertSame('scale_up', data_get($plan, 'payload.targets.web.action'));
        $this->assertSame(3, data_get($plan, 'payload.targets.web.desired_instances'));
        $this->assertContains('provider_resource_pressure', (array) data_get($plan, 'payload.targets.web.reasons'));
        $this->assertSame(
            data_get($observation, 'payload.targets.web.state_token'),
            data_get($plan, 'payload.targets.web.state_token'),
        );
    }

    public function test_zero_instance_web_outage_is_accepted_and_restores_the_availability_floor(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = $this->observationEnvelope();
        $observation['payload']['targets']['web']['current_instances'] = 0;
        $observation['payload']['targets']['web']['ready_instances'] = 0;
        $observation['payload']['targets']['web']['cpu_utilization_percent'] = 0.0;
        $observation['payload']['targets']['web']['memory_utilization_percent'] = 0.0;
        app(CapacityPlatformObservationStore::class)->record(
            $this->sign('platform', $observation['payload']),
        );

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertSame('actionable', data_get($plan, 'payload.status'));
        $this->assertSame('scale_up', data_get($plan, 'payload.targets.web.action'));
        $this->assertSame(0, data_get($plan, 'payload.targets.web.current_instances'));
        $this->assertSame(2, data_get($plan, 'payload.targets.web.desired_instances'));
        $this->assertContains(
            'minimum_capacity_floor_recovery',
            (array) data_get($plan, 'payload.targets.web.reasons'),
        );
        $this->assertTrue(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan(
            CapacityScalingPlan::query()->firstOrFail(),
        ));
    }

    public function test_zero_worker_outage_restores_the_queue_floor_without_circular_local_telemetry(): void
    {
        config()->set('background_jobs.connection', 'database');
        config()->set('background_jobs.monitoring.queues', ['default']);
        config()->set('capacity_planning.platform.managed_targets', ['web', 'queue:default']);
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = $this->observationEnvelope();
        $observation['payload']['targets']['queue:default'] = [
            'kind' => 'queue',
            'state_token' => hash('sha256', 'queue-default-complete-worker-outage'),
            'current_instances' => 0,
            'ready_instances' => 0,
            'cpu_utilization_percent' => 0.0,
            'memory_utilization_percent' => 0.0,
        ];
        app(CapacityPlatformObservationStore::class)->record(
            $this->sign('platform', $observation['payload']),
        );

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertSame('actionable', data_get($plan, 'payload.status'));
        $this->assertSame('scale_up', data_get($plan, 'payload.targets.queue:default.action'));
        $this->assertSame(1, data_get($plan, 'payload.targets.queue:default.desired_instances'));
        $this->assertContains(
            'minimum_capacity_floor_recovery',
            (array) data_get($plan, 'payload.targets.queue:default.reasons'),
        );
        $this->assertContains(
            'queue_telemetry_unavailable_floor_recovery',
            (array) data_get($plan, 'payload.targets.queue:default.reasons'),
        );
    }

    public function test_target_local_queue_uncertainty_does_not_block_an_independently_safe_web_scale_up(): void
    {
        config()->set('background_jobs.monitoring.queues', ['default']);
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = $this->observationEnvelope();
        $observation['payload']['targets']['web']['cpu_utilization_percent'] = 85.0;
        $observation['payload']['targets']['queue:default'] = [
            'kind' => 'queue',
            'state_token' => hash('sha256', 'queue-default-idle-state'),
            'current_instances' => 1,
            'ready_instances' => 1,
            'cpu_utilization_percent' => 15.0,
            'memory_utilization_percent' => 20.0,
        ];
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $observation['payload']));
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertSame('actionable', data_get($plan, 'payload.status'));
        $this->assertSame('scale_up', data_get($plan, 'payload.targets.web.action'));
        $this->assertSame('hold', data_get($plan, 'payload.targets.queue:default.action'));
        $this->assertFalse(data_get($plan, 'payload.targets.queue:default.automation_eligible'));
    }

    public function test_plan_expiry_never_outlives_the_provider_observation(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $observation = $this->observationEnvelope();
        $observation['payload']['observed_at'] = '2026-08-24T09:59:10+00:00';
        $observation = $this->sign('platform', $observation['payload']);
        $storedObservation = app(CapacityPlatformObservationStore::class)->record($observation);
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertTrue($storedObservation->expires_at?->equalTo(
            CarbonImmutable::parse((string) data_get($plan, 'payload.expires_at')),
        ));
        $this->assertTrue(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan(
            CapacityScalingPlan::query()->firstOrFail(),
        ));
    }

    public function test_plan_expiry_never_outlives_its_earliest_capacity_evidence(): void
    {
        config()->set('capacity_planning.evidence.maximum_age_days', 1);
        $evidence = $this->evidenceEnvelope();
        $evidence['payload']['generated_at'] = '2026-08-23T10:00:40+00:00';
        $storedEvidence = app(CapacityLoadEvidenceStore::class)->record(
            $this->sign('evidence', $evidence['payload']),
        );
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertTrue($storedEvidence->expires_at?->equalTo(
            CarbonImmutable::parse((string) data_get($plan, 'payload.expires_at')),
        ));
        $this->assertTrue(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan(
            CapacityScalingPlan::query()->firstOrFail(),
        ));
    }

    public function test_active_key_rotation_does_not_create_a_duplicate_plan_or_persist_key_material(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));

        $first = app(CapacityAutoscalingPlanner::class)->plan();
        config()->set('capacity_planning.plan.active_key_id', 'plan-v2');
        config()->set('capacity_planning.plan.signing_keys', [
            'plan-v1' => self::PLAN_KEY,
            'plan-v2' => 'rotated-plan-signing-key-for-capacity-tests-v2',
        ]);
        $second = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertTrue($second['reused']);
        $this->assertSame(data_get($first, 'payload.plan_id'), data_get($second, 'payload.plan_id'));
        $this->assertDatabaseCount('capacity_scaling_plans', 1);
        $serialized = json_encode(CapacityScalingPlan::query()->firstOrFail()->payload, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString(self::PLAN_KEY, $serialized);
        $this->assertStringNotContainsString('rotated-plan-signing-key', $serialized);
    }

    public function test_malformed_signed_plan_timestamp_fails_verification_without_parser_failure(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();

        $plan = CapacityScalingPlan::query()->firstOrFail();
        $payload = (array) $plan->payload;
        $payload['generated_at'] = 'not-a-time';
        $signed = app(CapacityEnvelopeSigner::class)->sign('plan', $payload);
        DB::table('capacity_scaling_plans')->where('id', $plan->id)->update([
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'payload_hash' => app(CapacityEnvelopeSigner::class)->hash($payload),
            'signing_key_id' => $signed['key_id'],
            'signature' => $signed['signature'],
        ]);

        $this->assertFalse(app(CapacityAutoscalingPlanner::class)->verifyStoredPlan(
            CapacityScalingPlan::query()->firstOrFail(),
        ));
    }

    public function test_current_plan_lookup_never_selects_a_newer_plan_from_another_release(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();
        $current = CapacityScalingPlan::query()->firstOrFail();
        $payload = (array) $current->payload;
        $payload['plan_id'] = '99999999-9999-4999-8999-999999999999';
        $payload['release'] = 'release-other';
        $payload['generated_at'] = CarbonImmutable::now('UTC')->addSeconds(10)->toIso8601String();
        $payload['expires_at'] = CarbonImmutable::now('UTC')->addSeconds(100)->toIso8601String();
        $signed = app(CapacityEnvelopeSigner::class)->sign('plan', $payload);

        CapacityScalingPlan::query()->create([
            ...$current->getAttributes(),
            'id' => null,
            'public_id' => '88888888-8888-4888-8888-888888888888',
            'plan_id' => $payload['plan_id'],
            'release' => $payload['release'],
            'input_hash' => hash('sha256', 'other-release-input'),
            'payload' => $payload,
            'payload_hash' => app(CapacityEnvelopeSigner::class)->hash($payload),
            'signing_key_id' => $signed['key_id'],
            'signature' => $signed['signature'],
            'generated_at' => CarbonImmutable::now('UTC')->addSeconds(10),
            'expires_at' => CarbonImmutable::now('UTC')->addSeconds(100),
            'recorded_at' => CarbonImmutable::now('UTC')->addSeconds(10),
        ]);

        $selected = app(CapacityAutoscalingPlanner::class)->latestStoredPlanForCurrent();

        $this->assertNotNull($selected);
        $this->assertSame($current->id, $selected->id);
    }

    public function test_invalid_newest_evidence_fails_closed_instead_of_falling_back(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $newest = $this->evidenceEnvelope();
        $newest['payload']['test_id'] = 'github-9002-1';
        $newest['payload']['generated_at'] = '2026-08-24T10:00:00+00:00';
        $newest = $this->sign('evidence', $newest['payload']);
        $stored = app(CapacityLoadEvidenceStore::class)->record($newest);
        DB::table('capacity_load_evidence')->where('id', $stored->id)->update([
            'source_signature' => str_repeat('0', 64),
        ]);

        $this->assertNull(app(CapacityLoadEvidenceStore::class)->latestForCurrent('public_read'));
    }

    public function test_capacity_pruning_has_a_hard_per_run_work_limit(): void
    {
        $old = CarbonImmutable::now('UTC')->subDays(40);
        foreach (range(1, 5) as $index) {
            DB::table('capacity_scaling_plans')->insert([
                'public_id' => sprintf('00000000-0000-4000-8000-%012d', $index),
                'plan_id' => sprintf('10000000-0000-4000-8000-%012d', $index),
                'status' => 'hold',
                'environment' => 'production',
                'release' => 'release-retention-test',
                'infrastructure_profile' => 'profile-retention-test',
                'observation_id' => null,
                'evidence_id' => null,
                'decision_fingerprint' => hash('sha256', "decision-{$index}"),
                'input_hash' => hash('sha256', "input-{$index}"),
                'payload' => '{}',
                'payload_hash' => hash('sha256', "payload-{$index}"),
                'signing_key_id' => 'plan-v1',
                'signature' => hash('sha256', "signature-{$index}"),
                'generated_at' => $old,
                'expires_at' => $old->addSeconds(90),
                'recorded_at' => $old,
            ]);
            DB::table('capacity_scaling_states')->insert([
                'target_key' => "web@retention-{$index}",
                'observed_instances' => 2,
                'raw_recommendation' => 2,
                'desired_instances' => 2,
                'low_observation_count' => 0,
                'low_since' => null,
                'last_scale_up_at' => null,
                'last_scale_down_at' => null,
                'last_observation_id' => sprintf('20000000-0000-4000-8000-%012d', $index),
                'version' => 1,
                'created_at' => $old,
                'updated_at' => $old,
            ]);
        }
        DB::table('capacity_scaling_states')->insert([
            'target_key' => 'web@current-release',
            'observed_instances' => 2,
            'raw_recommendation' => 2,
            'desired_instances' => 2,
            'low_observation_count' => 0,
            'low_since' => null,
            'last_scale_up_at' => null,
            'last_scale_down_at' => null,
            'last_observation_id' => '30000000-0000-4000-8000-000000000001',
            'version' => 1,
            'created_at' => CarbonImmutable::now('UTC'),
            'updated_at' => CarbonImmutable::now('UTC'),
        ]);
        config()->set('capacity_planning.retention.decision_days', 30);
        config()->set('capacity_planning.retention.prune_batch_size', 2);
        config()->set('capacity_planning.retention.prune_max_batches', 2);

        $this->artisan('capacity:prune')->assertSuccessful();

        $this->assertDatabaseCount('capacity_scaling_plans', 1);
        $this->assertDatabaseCount('capacity_scaling_states', 2);
        $this->assertDatabaseHas('capacity_scaling_states', ['target_key' => 'web@current-release']);
    }

    public function test_capacity_control_migration_refuses_to_drop_operational_history(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $migration = require database_path('migrations/2026_08_24_000001_create_capacity_control_plane.php');

        $this->expectException(RuntimeException::class);
        $migration->down();
    }

    public function test_web_automation_is_blocked_when_one_required_workload_scope_is_unproven(): void
    {
        config()->set('capacity_planning.evidence.required_scopes', ['public_read', 'booking_checkout']);
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));

        $plan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertSame('blocked', data_get($plan, 'payload.status'));
        $this->assertFalse(data_get($plan, 'payload.targets.web.automation_eligible'));
        $this->assertStringContainsString(
            'booking_checkout',
            implode(',', (array) data_get($plan, 'payload.targets.web.reasons')),
        );
    }

    public function test_capacity_contract_accepts_complete_static_production_control_configuration(): void
    {
        config()->set('performance.driver', 'redis');
        config()->set('capacity_planning.guardrails.require_database_telemetry_for_scale_up', true);

        $report = app(CapacityPlanningContract::class)->report(false);

        $this->assertTrue($report['valid'], json_encode($report['checks']));
        $this->assertTrue($report['strict_valid'], json_encode($report['checks']));
    }

    public function test_capacity_contract_rejects_provider_adapter_target_drift(): void
    {
        config()->set('performance.driver', 'redis');
        config()->set('capacity_planning.guardrails.require_database_telemetry_for_scale_up', true);
        config()->set('capacity_planning.platform.managed_targets', ['web', 'queue:ghost']);

        $report = app(CapacityPlanningContract::class)->report(false);
        $check = collect($report['checks'])->firstWhere('code', 'platform.managed_targets');

        $this->assertSame('fail', $check['status'] ?? null);
        $this->assertFalse($report['valid']);
    }

    public function test_capacity_contract_rejects_unbounded_or_flapping_step_policy(): void
    {
        config()->set('performance.driver', 'redis');
        config()->set('capacity_planning.guardrails.require_database_telemetry_for_scale_up', true);
        config()->set('capacity_planning.plan.maximum_scale_up_step', 101);
        config()->set('capacity_planning.plan.scale_down_required_observations', 1);

        $report = app(CapacityPlanningContract::class)->report(false);
        $check = collect($report['checks'])->firstWhere('code', 'plan.anti_flap_policy');

        $this->assertSame('fail', $check['status'] ?? null);
        $this->assertFalse($report['valid']);
    }

    public function test_capacity_contract_retains_provider_observations_for_every_retained_decision(): void
    {
        config()->set('capacity_planning.retention.observation_days', 30);
        config()->set('capacity_planning.retention.decision_days', 30);

        $report = app(CapacityPlanningContract::class)->report(false);
        $check = collect($report['checks'])->firstWhere('code', 'storage.bounded_history');

        $this->assertSame('fail', $check['status'] ?? null);
        $this->assertStringContainsString('every retained decision', (string) ($check['message'] ?? ''));

        config()->set('capacity_planning.retention.observation_days', 31);
        config()->set('capacity_planning.retention.evidence_days', 60);
        $insufficientEvidence = app(CapacityPlanningContract::class)->report(false);
        $evidenceCheck = collect($insufficientEvidence['checks'])
            ->firstWhere('code', 'storage.bounded_history');
        $this->assertSame('fail', $evidenceCheck['status'] ?? null);

        config()->set('capacity_planning.retention.evidence_days', 61);
        $complete = app(CapacityPlanningContract::class)->report(false);
        $completeCheck = collect($complete['checks'])->firstWhere('code', 'storage.bounded_history');
        $this->assertSame('pass', $completeCheck['status'] ?? null);
    }

    public function test_enforced_production_runtime_refuses_silent_advisory_or_database_only_degradation(): void
    {
        config()->set('app.env', 'production');
        config()->set('capacity_planning.mode', 'advisory');
        config()->set('performance.driver', 'database');

        $report = app(CapacityPlanningContract::class)->report(false);
        $checks = collect($report['checks'])->keyBy('code');

        $this->assertSame('fail', data_get($checks->get('autoscaling.mode'), 'status'));
        $this->assertSame('fail', data_get($checks->get('telemetry.shared_driver'), 'status'));
        $this->assertFalse($report['valid']);
    }

    public function test_live_contract_requires_multiple_distinct_observer_cycles(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $first = $this->observationEnvelope();
        $first['payload']['observed_at'] = '2026-08-24T09:59:00+00:00';
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $first['payload']));
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();

        $singleCycle = app(CapacityPlanningContract::class)->report(true);
        $singleCheck = collect($singleCycle['checks'])->firstWhere('code', 'live.platform_observation');
        $this->assertSame('fail', $singleCheck['status'] ?? null);

        $tooSoon = $this->observationEnvelope();
        $tooSoon['payload']['observation_id'] = '22222222-2222-4222-8222-222222222222';
        $tooSoon['payload']['observed_at'] = '2026-08-24T09:59:05+00:00';
        try {
            app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $tooSoon['payload']));
            $this->fail('A compressed observer cycle was accepted.');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseCount('capacity_platform_observations', 1);
        }

        $second = $this->observationEnvelope();
        $second['payload']['observation_id'] = '33333333-3333-4333-8333-333333333333';
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $second['payload']));
        app(CapacityAutoscalingPlanner::class)->plan();

        $continuous = app(CapacityPlanningContract::class)->report(true);
        $continuousCheck = collect($continuous['checks'])->firstWhere('code', 'live.platform_observation');
        $this->assertSame('pass', $continuousCheck['status'] ?? null, json_encode($continuous['checks']));
    }

    public function test_live_contract_rejects_observer_cycles_with_an_excessive_gap(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $first = $this->observationEnvelope();
        $first['payload']['observation_id'] = '88888888-8888-4888-8888-888888888888';
        $first['payload']['observed_at'] = '2026-08-24T09:58:30+00:00';
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $first['payload']));

        $second = $this->observationEnvelope();
        $second['payload']['observation_id'] = '99999999-9999-4999-8999-999999999999';
        $second['payload']['observed_at'] = '2026-08-24T09:59:50+00:00';
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $second['payload']));

        $report = app(CapacityPlanningContract::class)->report(true);
        $check = collect($report['checks'])->firstWhere('code', 'live.platform_observation');

        $this->assertSame('fail', $check['status'] ?? null);
        $this->assertStringContainsString('properly spaced', (string) ($check['message'] ?? ''));
    }

    public function test_idle_target_at_safe_capacity_is_operational_instead_of_raising_a_false_alarm(): void
    {
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(CapacityPlatformObservationStore::class)->record($this->observationEnvelope());
        $second = $this->observationEnvelope();
        $second['payload']['observation_id'] = '55555555-5555-4555-8555-555555555555';
        $second['payload']['observed_at'] = '2026-08-24T09:59:50+00:00';
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $second['payload']));
        app(CapacityAutoscalingPlanner::class)->plan();

        $summary = app(CapacityControlMonitor::class)->summary();

        $this->assertSame('operational', $summary['status']);
        $this->assertSame('hold', data_get($summary, 'plan.status'));
        $this->assertFalse(data_get($summary, 'plan.targets.web.automation_eligible'));
    }

    public function test_repeated_unchanged_actionable_state_raises_a_provider_convergence_warning(): void
    {
        config()->set('capacity_planning.plan.convergence_timeout_seconds', 60);
        config()->set('background_jobs.connection', 'database');
        config()->set('background_jobs.monitoring.queues', ['default']);
        config()->set('capacity_planning.platform.managed_targets', ['web', 'queue:default']);
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        app(PerformanceMetricRepository::class)->recordQueue(
            'database',
            'default',
            10,
            100,
            false,
            CarbonImmutable::now('UTC'),
        );
        $firstObservation = $this->observationEnvelope();
        $firstObservation['payload']['targets']['web']['cpu_utilization_percent'] = 85.0;
        $firstObservation['payload']['targets']['queue:default'] = [
            'kind' => 'queue',
            'state_token' => hash('sha256', 'queue-default-first-generation'),
            'current_instances' => 1,
            'ready_instances' => 1,
            'cpu_utilization_percent' => 15.0,
            'memory_utilization_percent' => 20.0,
        ];
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $firstObservation['payload']));
        app(CapacityAutoscalingPlanner::class)->plan();

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-24 10:01:00', 'UTC'));
        $secondObservation = $firstObservation;
        $secondObservation['payload']['observation_id'] = '66666666-6666-4666-8666-666666666666';
        $secondObservation['payload']['observed_at'] = '2026-08-24T10:00:45+00:00';
        $secondObservation['payload']['targets']['web']['state_token'] = hash(
            'sha256',
            'provider-generation-changed-but-capacity-did-not',
        );
        $secondObservation['payload']['targets']['queue:default']['state_token'] = hash(
            'sha256',
            'queue-default-second-generation',
        );
        $secondObservation['payload']['targets']['queue:default']['cpu_utilization_percent'] = 85.0;
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $secondObservation['payload']));
        $secondPlan = app(CapacityAutoscalingPlanner::class)->plan();

        $this->assertCount(
            2,
            CapacityScalingPlan::query()->distinct()->pluck('decision_fingerprint'),
            'The persisted CAS-bound decisions should differ while convergence remains stalled.',
        );
        $this->assertSame(
            'scale_up',
            data_get($secondPlan, 'payload.targets.queue:default.action'),
            json_encode(data_get($secondPlan, 'payload.targets.queue:default')),
        );

        $summary = app(CapacityControlMonitor::class)->summary();

        $this->assertSame('degraded', $summary['status']);
        $this->assertTrue(data_get($summary, 'plan.convergence_stalled'));
        $this->assertSame(['web'], data_get($summary, 'plan.convergence_stalled_targets'));
        $this->assertStringContainsString('not converged', (string) $summary['message']);
    }

    public function test_unapplied_scale_down_remains_actionable_and_reaches_convergence_monitoring(): void
    {
        config()->set('capacity_planning.plan.convergence_timeout_seconds', 60);
        app(CapacityLoadEvidenceStore::class)->record($this->evidenceEnvelope());
        $firstObservation = $this->observationEnvelope();
        $firstObservation['payload']['targets']['web']['current_instances'] = 4;
        $firstObservation['payload']['targets']['web']['ready_instances'] = 4;
        $firstObservation['payload']['targets']['web']['cpu_utilization_percent'] = 20.0;
        $firstObservation['payload']['targets']['web']['memory_utilization_percent'] = 20.0;
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $firstObservation['payload']));
        app(PerformanceMetricRepository::class)->recordRequest('public_read', 80, false, CarbonImmutable::now('UTC'));
        app(CapacityAutoscalingPlanner::class)->plan();

        $state = CapacityScalingState::query()->firstOrFail();
        DB::table('capacity_scaling_states')->where('target_key', $state->target_key)->update([
            'low_since' => CarbonImmutable::now('UTC')->subMinutes(20),
            'low_observation_count' => 4,
        ]);
        $secondObservation = $firstObservation;
        $secondObservation['payload']['observation_id'] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        $secondObservation['payload']['observed_at'] = '2026-08-24T10:00:00+00:00';
        $secondObservation['payload']['targets']['web']['state_token'] = hash('sha256', 'scale-down-cycle-2');
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $secondObservation['payload']));
        $firstAction = app(CapacityAutoscalingPlanner::class)->plan();

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-24 10:01:00', 'UTC'));
        $thirdObservation = $secondObservation;
        $thirdObservation['payload']['observation_id'] = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        $thirdObservation['payload']['observed_at'] = '2026-08-24T10:01:00+00:00';
        $thirdObservation['payload']['targets']['web']['state_token'] = hash('sha256', 'scale-down-cycle-3');
        app(CapacityPlatformObservationStore::class)->record($this->sign('platform', $thirdObservation['payload']));
        $reissued = app(CapacityAutoscalingPlanner::class)->plan();
        $summary = app(CapacityControlMonitor::class)->summary();

        $this->assertSame('scale_down', data_get($firstAction, 'payload.targets.web.action'));
        $this->assertSame(3, data_get($firstAction, 'payload.targets.web.desired_instances'));
        $this->assertSame('scale_down', data_get($reissued, 'payload.targets.web.action'));
        $this->assertSame(3, data_get($reissued, 'payload.targets.web.desired_instances'));
        $this->assertContains(
            'scale_down_pending_convergence',
            (array) data_get($reissued, 'payload.targets.web.reasons'),
        );
        $this->assertSame(['web'], data_get($summary, 'plan.convergence_stalled_targets'));
    }

    private function evidenceEnvelope(): array
    {
        return $this->sign('evidence', [
            'schema_version' => 3,
            'test_id' => 'github-9001-1',
            'generated_at' => '2026-08-24T09:59:00+00:00',
            'profile' => 'capacity',
            'capacity_scope' => 'public_read',
            'environment' => 'production',
            'release' => 'release-2026.08.24-a1b2c3d',
            'infrastructure_profile' => 'ubsc-web-2x-2cpu-4gb',
            'source_provider' => 'github-actions',
            'application_instances' => 2,
            'base_origin' => 'https://staging.ubsportcenter.co.id',
            'requested_start_rps' => 2,
            'requested_target_rps' => 10,
            'observed_requests_per_second' => 8.5,
            'p95_ms' => 210,
            'p99_ms' => 540,
            'error_rate_percent' => 0.1,
            'target_hold_seconds' => 300,
            'target_hold_requests_per_second' => 10,
            'target_hold_p95_ms' => 200,
            'target_hold_p99_ms' => 500,
            'target_hold_error_rate_percent' => 0.1,
            'dropped_iterations' => 0,
            'thresholds_passed' => true,
            'reached_target' => true,
            'qualifies_as_capacity_evidence' => true,
            'tested_requests_per_second' => 10,
            'recommended_operational_rps' => 7,
            'operational_headroom_percent' => 25,
        ]);
    }

    private function observationEnvelope(): array
    {
        return $this->sign('platform', [
            'schema_version' => 2,
            'observation_id' => '11111111-1111-4111-8111-111111111111',
            'observed_at' => '2026-08-24T09:59:30+00:00',
            'provider' => 'kubernetes',
            'environment' => 'production',
            'release' => 'release-2026.08.24-a1b2c3d',
            'infrastructure_profile' => 'ubsc-web-2x-2cpu-4gb',
            'targets' => [
                'web' => [
                    'kind' => 'web',
                    'state_token' => hash('sha256', 'web-state-v1'),
                    'current_instances' => 2,
                    'ready_instances' => 2,
                    'cpu_utilization_percent' => 38.5,
                    'memory_utilization_percent' => 41.2,
                ],
            ],
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function sign(string $purpose, array $payload): array
    {
        $signature = app(CapacityEnvelopeSigner::class)->sign($purpose, $payload);

        return [
            'schema_version' => 1,
            'key_id' => $signature['key_id'],
            'payload' => $payload,
            'signature' => $signature['signature'],
        ];
    }
}
