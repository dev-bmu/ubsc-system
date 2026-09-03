<?php

namespace Tests\Unit;

use App\Services\Capacity\CapacityScalingPolicy;
use Carbon\CarbonImmutable;
use Tests\TestCase;

final class CapacityScalingPolicyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('capacity_planning.plan.maximum_scale_up_step', 4);
        config()->set('capacity_planning.plan.maximum_scale_up_percent', 50);
        config()->set('capacity_planning.plan.maximum_scale_down_step', 1);
        config()->set('capacity_planning.plan.scale_up_cooldown_seconds', 60);
        config()->set('capacity_planning.plan.scale_down_cooldown_seconds', 600);
        config()->set('capacity_planning.plan.scale_down_stabilization_seconds', 900);
        config()->set('capacity_planning.plan.scale_down_required_observations', 5);
        config()->set('capacity_planning.plan.scale_down_threshold_percent', 35);
    }

    public function test_scale_up_is_immediate_but_bounded_by_step_and_percentage(): void
    {
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 12,
            'load_percent' => 92,
        ]), null, CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('scale_up', $result['target']['action']);
        $this->assertSame(6, $result['target']['desired_instances']);
        $this->assertSame('bounded_scale_up', $result['target']['reasons'][0]);
    }

    public function test_minimum_availability_floor_is_restored_without_waiting_for_load_samples(): void
    {
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 0,
            'ready_instances' => 0,
            'minimum_instances' => 2,
            'raw_recommendation' => 2,
            'sample_ready' => false,
            'automation_eligible' => false,
            'load_percent' => null,
        ]), null, CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('scale_up', $result['target']['action']);
        $this->assertSame(2, $result['target']['desired_instances']);
        $this->assertTrue($result['target']['automation_eligible']);
        $this->assertContains('minimum_capacity_floor_recovery', $result['target']['reasons']);
    }

    public function test_target_readiness_and_downstream_guardrails_fail_closed(): void
    {
        $policy = app(CapacityScalingPolicy::class);
        $now = CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC');
        $notReady = $policy->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 3,
            'raw_recommendation' => 10,
        ]), null, $now);
        $unsafe = $policy->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 10,
            'system_safe' => false,
        ]), null, $now);

        $this->assertSame('hold', $notReady['target']['action']);
        $this->assertSame(4, $notReady['target']['desired_instances']);
        $this->assertContains('target_not_fully_ready', $notReady['target']['reasons']);
        $this->assertSame('hold', $unsafe['target']['action']);
        $this->assertContains('downstream_guardrail_blocked', $unsafe['target']['reasons']);
    }

    public function test_scale_up_hysteresis_ignores_a_low_pressure_raw_spike(): void
    {
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 8,
            'load_percent' => 60,
        ]), null, CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('hold', $result['target']['action']);
        $this->assertContains('scale_up_hysteresis', $result['target']['reasons']);
    }

    public function test_scale_up_cooldown_never_reissues_more_than_current_demand(): void
    {
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 5,
            'load_percent' => 90,
        ]), [
            'desired_instances' => 6,
            'last_scale_up_at' => '2026-08-24T09:59:30+00:00',
        ], CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('scale_up', $result['target']['action']);
        $this->assertSame(5, $result['target']['desired_instances']);
        $this->assertContains('scale_up_cooldown', $result['target']['reasons']);
    }

    public function test_scale_down_requires_sustained_independent_observations(): void
    {
        $now = CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC');
        $state = [
            'observed_instances' => 4,
            'desired_instances' => 4,
            'low_since' => '2026-08-24T09:44:00+00:00',
            'low_observation_count' => 4,
            'last_observation_id' => '11111111-1111-4111-8111-111111111111',
            'last_scale_up_at' => null,
            'last_scale_down_at' => null,
        ];
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 2,
            'load_percent' => 20,
            'observation_id' => '22222222-2222-4222-8222-222222222222',
        ]), $state, $now);

        $this->assertSame('scale_down', $result['target']['action']);
        $this->assertSame(3, $result['target']['desired_instances']);
        $this->assertSame(0, $result['state']['low_observation_count']);
        $this->assertContains('stabilized_scale_down', $result['target']['reasons']);
    }

    public function test_replaying_one_observation_cannot_advance_scale_down_confirmation(): void
    {
        config()->set('capacity_planning.plan.scale_down_required_observations', 3);
        $state = [
            'observed_instances' => 4,
            'desired_instances' => 4,
            'low_since' => '2026-08-24T09:30:00+00:00',
            'low_observation_count' => 2,
            'last_observation_id' => '11111111-1111-4111-8111-111111111111',
            'last_scale_up_at' => null,
            'last_scale_down_at' => null,
        ];
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 2,
            'load_percent' => 20,
            'observation_id' => '11111111-1111-4111-8111-111111111111',
        ]), $state, CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('hold', $result['target']['action']);
        $this->assertSame(2, $result['state']['low_observation_count']);
        $this->assertContains('scale_down_stabilizing', $result['target']['reasons']);
    }

    public function test_unconverged_scale_down_remains_an_idempotent_action(): void
    {
        $state = [
            'observed_instances' => 4,
            'desired_instances' => 3,
            'low_since' => null,
            'low_observation_count' => 0,
            'last_observation_id' => '11111111-1111-4111-8111-111111111111',
            'last_scale_up_at' => null,
            'last_scale_down_at' => '2026-08-24T09:59:30+00:00',
        ];
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 2,
            'load_percent' => 20,
            'observation_id' => '22222222-2222-4222-8222-222222222222',
        ]), $state, CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('scale_down', $result['target']['action']);
        $this->assertSame(3, $result['target']['desired_instances']);
        $this->assertContains('scale_down_pending_convergence', $result['target']['reasons']);
    }

    public function test_rising_load_cancels_a_pending_scale_down(): void
    {
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'current_instances' => 4,
            'ready_instances' => 4,
            'raw_recommendation' => 2,
            'load_percent' => 60,
        ]), [
            'observed_instances' => 4,
            'desired_instances' => 3,
            'last_scale_down_at' => '2026-08-24T09:59:30+00:00',
        ], CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('hold', $result['target']['action']);
        $this->assertSame(4, $result['target']['desired_instances']);
        $this->assertContains('scale_down_hysteresis', $result['target']['reasons']);
    }

    public function test_advisory_mode_never_changes_desired_state(): void
    {
        $result = app(CapacityScalingPolicy::class)->evaluate($this->input([
            'mode' => 'advisory',
            'current_instances' => 3,
            'ready_instances' => 3,
            'raw_recommendation' => 12,
        ]), null, CarbonImmutable::parse('2026-08-24 10:00:00', 'UTC'));

        $this->assertSame('advisory', $result['target']['action']);
        $this->assertSame(3, $result['target']['desired_instances']);
        $this->assertFalse($result['target']['automation_eligible']);
    }

    /** @param array<string, mixed> $overrides */
    private function input(array $overrides = []): array
    {
        return [
            'kind' => 'web',
            'mode' => 'signed_plan',
            'current_instances' => 2,
            'ready_instances' => 2,
            'minimum_instances' => 2,
            'maximum_instances' => 20,
            'raw_recommendation' => 2,
            'load_percent' => 50,
            'sample_ready' => true,
            'automation_eligible' => true,
            'system_safe' => true,
            'capacity_limited' => false,
            'reasons' => [],
            'observation_id' => '22222222-2222-4222-8222-222222222222',
            ...$overrides,
        ];
    }
}
