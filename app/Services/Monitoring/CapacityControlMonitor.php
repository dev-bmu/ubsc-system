<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\CapacityScalingPlan;
use App\Services\Capacity\CapacityAutoscalingPlanner;
use App\Services\Capacity\CapacityLoadEvidenceStore;
use App\Services\Capacity\CapacityPlatformObservationStore;
use Throwable;

final class CapacityControlMonitor
{
    public function __construct(
        private readonly CapacityLoadEvidenceStore $evidenceStore,
        private readonly CapacityPlatformObservationStore $observationStore,
        private readonly CapacityAutoscalingPlanner $planner,
        private readonly BackgroundQueueRegistry $queues,
    ) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $enabled = (bool) config('capacity_planning.enabled', false);
        $enforced = (bool) config('capacity_planning.enforce', false);
        $mode = (string) config('capacity_planning.mode', 'advisory');
        $evidence = null;
        $observation = null;
        $plan = null;
        $planValid = false;
        $requiredScopes = array_values(array_filter(
            (array) config('capacity_planning.evidence.required_scopes', []),
            'is_string',
        ));
        $verifiedScopes = [];
        $evidenceByScope = [];
        $expectedTargets = ['web', ...$this->queues->capacityTargetKeys()];
        $reportedTargets = [];
        $missingTargets = $expectedTargets;
        $requiredObservationSamples = (int) config('capacity_planning.platform.minimum_live_observations', 2);
        $minimumObservationSpacing = (int) config('capacity_planning.platform.minimum_observation_spacing_seconds', 15);
        $maximumObservationSpacing = (int) config('capacity_planning.platform.maximum_observation_spacing_seconds', 75);
        $verifiedObservationSamples = 0;

        try {
            foreach ($requiredScopes as $scope) {
                $candidate = $this->evidenceStore->latestForCurrent($scope);
                if ($candidate !== null) {
                    $verifiedScopes[] = $scope;
                    $evidenceByScope[$scope] = $candidate;
                }
            }
            ksort($evidenceByScope, SORT_STRING);
            $evidence = $evidenceByScope['public_read']
                ?? collect($evidenceByScope)->first();
        } catch (Throwable) {
            // Explicit Unknown below is safer than allowing the monitoring
            // cockpit to fail because one control-plane table is unavailable.
        }
        try {
            $observation = $this->observationStore->latestForCurrent();
            $verifiedObservationSamples = count(
                $this->observationStore->continuousForCurrent(
                    $requiredObservationSamples,
                    $minimumObservationSpacing,
                    $maximumObservationSpacing,
                ),
            );
            $reportedTargets = $observation === null
                ? []
                : array_keys((array) data_get($observation->payload, 'targets', []));
            $missingTargets = array_values(array_diff($expectedTargets, $reportedTargets));
        } catch (Throwable) {
            // See above.
        }
        try {
            $plan = $this->planner->latestStoredPlanForCurrent();
            $planValid = $plan !== null && $this->planner->verifyStoredPlan($plan);
        } catch (Throwable) {
            $plan = null;
        }

        $planFresh = $planValid && $plan?->expires_at?->isFuture() === true;
        $stalledActionTargets = [];
        try {
            $stalledActionTargets = $this->stalledActionTargets($plan, $planValid);
        } catch (Throwable) {
            // Plan freshness still degrades honestly if history is unavailable.
        }
        $actionStalled = $stalledActionTargets !== [];
        $capacityLimited = collect((array) data_get($plan?->payload, 'targets', []))
            ->contains(static fn (array $target): bool => (bool) ($target['capacity_limited'] ?? false));
        $targetNotReady = collect((array) data_get($plan?->payload, 'targets', []))
            ->contains(static fn (array $target): bool => (int) ($target['ready_instances'] ?? -1)
                !== (int) ($target['current_instances'] ?? -2));
        $heldScaleUp = collect((array) data_get($plan?->payload, 'targets', []))
            ->contains(static fn (array $target): bool => ($target['action'] ?? null) === 'hold'
                && (int) ($target['raw_recommendation'] ?? 0) > (int) ($target['current_instances'] ?? 0)
                && ! (bool) ($target['automation_eligible'] ?? false));
        $status = match (true) {
            ! $enabled => MonitoringStatus::Unknown,
            ! $enforced || $mode !== 'signed_plan' => MonitoringStatus::Unknown,
            count($verifiedScopes) !== count($requiredScopes)
                || $observation === null
                || $missingTargets !== []
                || $verifiedObservationSamples < $requiredObservationSamples => MonitoringStatus::Outage,
            ! $planFresh
                || $plan?->status === 'blocked'
                || $capacityLimited
                || $targetNotReady
                || $heldScaleUp
                || $actionStalled => MonitoringStatus::Degraded,
            $plan?->status === 'actionable' || $plan?->status === 'hold' => MonitoringStatus::Operational,
            default => MonitoringStatus::Unknown,
        };

        return [
            'status' => $status->value,
            'enabled' => $enabled,
            'enforced' => $enforced,
            'mode' => $mode,
            'provider' => (string) config('capacity_planning.platform.provider'),
            'infrastructure_profile' => (string) config('capacity_planning.infrastructure_profile'),
            'evidence' => $evidence === null ? null : [
                'public_id' => (string) $evidence->public_id,
                'scope' => (string) $evidence->scope,
                'tested_instances' => (int) $evidence->tested_instances,
                'tested_requests_per_second' => (float) $evidence->tested_requests_per_second,
                'operational_requests_per_second' => (float) $evidence->operational_requests_per_second,
                'operational_requests_per_second_per_instance' => (float) $evidence->operational_requests_per_second_per_instance,
                'generated_at' => $evidence->generated_at?->toIso8601String(),
                'expires_at' => $evidence->expires_at?->toIso8601String(),
            ],
            'evidence_coverage' => [
                'required' => count($requiredScopes),
                'verified' => count($verifiedScopes),
                'missing_scopes' => array_values(array_diff($requiredScopes, $verifiedScopes)),
            ],
            'observation' => $observation === null ? null : [
                'observation_id' => (string) $observation->observation_id,
                'observed_at' => $observation->observed_at?->toIso8601String(),
                'expires_at' => $observation->expires_at?->toIso8601String(),
                'targets' => collect((array) data_get($observation->payload, 'targets', []))->map(
                    static fn (array $target): array => [
                        'kind' => (string) ($target['kind'] ?? 'unknown'),
                        'state_token_prefix' => substr((string) ($target['state_token'] ?? ''), 0, 12),
                        'current_instances' => max(0, (int) ($target['current_instances'] ?? 0)),
                        'ready_instances' => max(0, (int) ($target['ready_instances'] ?? 0)),
                        'cpu_utilization_percent' => is_numeric($target['cpu_utilization_percent'] ?? null)
                            ? round((float) $target['cpu_utilization_percent'], 2)
                            : null,
                        'memory_utilization_percent' => is_numeric($target['memory_utilization_percent'] ?? null)
                            ? round((float) $target['memory_utilization_percent'], 2)
                            : null,
                    ],
                )->all(),
            ],
            'target_coverage' => [
                'required' => count($expectedTargets),
                'reported' => count(array_intersect($expectedTargets, $reportedTargets)),
                'missing_targets' => $missingTargets,
                'required_observer_cycles' => $requiredObservationSamples,
                'verified_observer_cycles' => $verifiedObservationSamples,
                'minimum_observer_spacing_seconds' => $minimumObservationSpacing,
                'maximum_observer_spacing_seconds' => $maximumObservationSpacing,
            ],
            'plan' => $plan === null ? null : [
                'plan_id' => (string) $plan->plan_id,
                'status' => (string) $plan->status,
                'signature_valid' => $planValid,
                'fresh' => $planFresh,
                'convergence_stalled' => $actionStalled,
                'convergence_stalled_targets' => $stalledActionTargets,
                'generated_at' => $plan->generated_at?->toIso8601String(),
                'expires_at' => $plan->expires_at?->toIso8601String(),
                'targets' => collect((array) data_get($plan->payload, 'targets', []))->map(
                    static fn (array $target): array => [
                        'kind' => (string) ($target['kind'] ?? 'unknown'),
                        'state_token_prefix' => substr((string) ($target['state_token'] ?? ''), 0, 12),
                        'current_instances' => max(0, (int) ($target['current_instances'] ?? 0)),
                        'raw_recommendation' => max(0, (int) ($target['raw_recommendation'] ?? 0)),
                        'desired_instances' => max(0, (int) ($target['desired_instances'] ?? 0)),
                        'minimum_instances' => max(0, (int) ($target['minimum_instances'] ?? 0)),
                        'maximum_instances' => max(0, (int) ($target['maximum_instances'] ?? 0)),
                        'action' => (string) ($target['action'] ?? 'hold'),
                        'automation_eligible' => (bool) ($target['automation_eligible'] ?? false),
                        'capacity_limited' => (bool) ($target['capacity_limited'] ?? false),
                        'cpu_utilization_percent' => is_numeric($target['cpu_utilization_percent'] ?? null)
                            ? round((float) $target['cpu_utilization_percent'], 2)
                            : null,
                        'memory_utilization_percent' => is_numeric($target['memory_utilization_percent'] ?? null)
                            ? round((float) $target['memory_utilization_percent'], 2)
                            : null,
                        'reasons' => array_values((array) ($target['reasons'] ?? [])),
                    ],
                )->all(),
            ],
            'policy' => [
                'web_minimum_instances' => (int) config('capacity_planning.web.minimum_instances', 2),
                'web_maximum_instances' => (int) config('capacity_planning.web.maximum_instances', 20),
                'scale_up_threshold_percent' => (int) config('capacity_planning.plan.scale_up_threshold_percent', 65),
                'scale_down_threshold_percent' => (int) config('capacity_planning.plan.scale_down_threshold_percent', 35),
                'scale_down_stabilization_seconds' => (int) config('capacity_planning.plan.scale_down_stabilization_seconds', 900),
            ],
            'message' => match (true) {
                ! $enabled => 'Capacity planning is disabled.',
                $mode !== 'signed_plan' => 'Capacity planning is advisory; provider-side automation is disabled.',
                count($verifiedScopes) !== count($requiredScopes) => 'Fresh capacity evidence is missing for one or more required traffic scopes.',
                $observation === null => 'Fresh signed platform capacity observation is unavailable.',
                $missingTargets !== [] => 'Platform capacity observation does not cover every managed target.',
                $verifiedObservationSamples < $requiredObservationSamples => 'The provider observer has not completed enough properly spaced fresh cycles.',
                ! $planFresh => 'The latest signed desired-state plan is missing, invalid, or expired.',
                $plan?->status === 'blocked' => 'The latest plan is held by a safety guardrail.',
                $actionStalled => 'The provider has not converged after repeatedly receiving the same actionable state.',
                $capacityLimited => 'Measured demand reached a configured capacity ceiling; operator review is required.',
                $targetNotReady => 'One or more managed targets are not fully ready.',
                $heldScaleUp => 'One or more targets need additional capacity but are held by a local safety gate.',
                default => null,
            },
        ];
    }

    /** @return list<string> */
    private function stalledActionTargets(?CapacityScalingPlan $plan, bool $valid): array
    {
        if (! $valid || $plan?->status !== 'actionable') {
            return [];
        }

        $expectedStates = $this->convergenceStates($plan);
        if ($expectedStates === []) {
            return [];
        }

        $timeout = (int) config('capacity_planning.plan.convergence_timeout_seconds', 300);
        $cutoff = now((string) config('app.timezone', 'UTC'))->subSeconds($timeout);
        $windowStart = $cutoff->copy()->subSeconds((int) config('capacity_planning.plan.ttl_seconds', 90));
        $scope = static fn ($query) => $query
            ->where('environment', (string) $plan->environment)
            ->where('release', (string) $plan->release)
            ->where('infrastructure_profile', (string) $plan->infrastructure_profile);
        $sequence = $scope(CapacityScalingPlan::query())
            ->where('generated_at', '>=', $windowStart)
            ->where('id', '<=', $plan->id)
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->limit(512)
            ->get()
            ->reverse()
            ->values();
        $trackers = collect($expectedStates)->map(static fn (): array => [
            'started_at' => null,
            'previous_expires_at' => null,
            'count' => 0,
        ])->all();
        $expectedProvider = (string) data_get($plan->payload, 'provider');
        $expectedMode = (string) data_get($plan->payload, 'mode');

        foreach ($sequence as $candidate) {
            $sameControlIdentity = hash_equals(
                $expectedProvider,
                (string) data_get($candidate->payload, 'provider'),
            ) && hash_equals(
                $expectedMode,
                (string) data_get($candidate->payload, 'mode'),
            );
            $candidateStates = $sameControlIdentity ? $this->convergenceStates($candidate) : [];

            foreach ($expectedStates as $targetKey => $expectedState) {
                $candidateState = $candidateStates[$targetKey] ?? null;
                $tracker = $trackers[$targetKey];
                if ($candidateState !== $expectedState
                    || $candidate->generated_at === null
                    || $candidate->expires_at === null) {
                    $trackers[$targetKey] = [
                        'started_at' => null,
                        'previous_expires_at' => null,
                        'count' => 0,
                    ];

                    continue;
                }

                if ($tracker['previous_expires_at'] === null
                    || $candidate->generated_at->greaterThan($tracker['previous_expires_at'])) {
                    $tracker['started_at'] = $candidate->generated_at;
                    $tracker['count'] = 1;
                } else {
                    $tracker['count']++;
                }
                $tracker['previous_expires_at'] = $candidate->expires_at;
                $trackers[$targetKey] = $tracker;
            }
        }

        return collect($trackers)->filter(
            static fn (array $tracker): bool => $tracker['count'] >= 2
                && $tracker['started_at'] !== null
                && $tracker['started_at']->lessThanOrEqualTo($cutoff),
        )->keys()->values()->all();
    }

    /** @return array<string, array{kind:string,action:string,current_instances:int}> */
    private function convergenceStates(CapacityScalingPlan $plan): array
    {
        $targets = [];
        foreach ((array) data_get($plan->payload, 'targets', []) as $key => $target) {
            if (! is_string($key) || ! is_array($target)
                || ! in_array($target['action'] ?? null, ['scale_up', 'scale_down'], true)) {
                continue;
            }

            // Provider generations and CAS state tokens may advance for an
            // unrelated metadata write. They must not conceal the fact that
            // the requested target is still at exactly the same capacity.
            $targets[$key] = [
                'kind' => (string) ($target['kind'] ?? ''),
                'action' => (string) $target['action'],
                'current_instances' => (int) ($target['current_instances'] ?? -1),
            ];
        }

        ksort($targets, SORT_STRING);

        return $targets;
    }
}
