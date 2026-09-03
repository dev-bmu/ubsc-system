<?php

namespace App\Services\Capacity;

use Carbon\CarbonImmutable;

final class CapacityScalingPolicy
{
    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>|null  $state
     * @return array{target:array<string,mixed>,state:array<string,mixed>}
     */
    public function evaluate(array $input, ?array $state, CarbonImmutable $now): array
    {
        $current = max(0, (int) ($input['current_instances'] ?? 0));
        $ready = max(0, min($current, (int) ($input['ready_instances'] ?? 0)));
        $minimum = max(0, (int) ($input['minimum_instances'] ?? 0));
        $maximum = max($minimum, (int) ($input['maximum_instances'] ?? $minimum));
        $raw = max($minimum, min($maximum, (int) ($input['raw_recommendation'] ?? $minimum)));
        $mode = (string) ($input['mode'] ?? 'advisory');
        $eligible = (bool) ($input['automation_eligible'] ?? false);
        $sampleReady = (bool) ($input['sample_ready'] ?? false);
        $safe = (bool) ($input['system_safe'] ?? false);
        $load = is_numeric($input['load_percent'] ?? null)
            ? max(0, (float) $input['load_percent'])
            : null;
        $reasons = array_values(array_filter(
            (array) ($input['reasons'] ?? []),
            static fn (mixed $reason): bool => is_string($reason) && $reason !== '',
        ));
        $desired = $current;
        $action = 'hold';
        $lowSince = $this->stateTime($state['low_since'] ?? null);
        $lowCount = max(0, (int) ($state['low_observation_count'] ?? 0));
        $lastScaleUp = $this->stateTime($state['last_scale_up_at'] ?? null);
        $lastScaleDown = $this->stateTime($state['last_scale_down_at'] ?? null);

        if ($mode !== 'signed_plan') {
            $action = 'advisory';
            $reasons[] = 'automation_mode_advisory';
            $lowSince = null;
            $lowCount = 0;
        } elseif ($ready !== $current) {
            $reasons[] = 'target_not_fully_ready';
            $lowSince = null;
            $lowCount = 0;
        } elseif (! $safe) {
            $reasons[] = 'downstream_guardrail_blocked';
            $lowSince = null;
            $lowCount = 0;
        } elseif ($current < $minimum) {
            // The configured floor is an availability invariant, not a load
            // prediction. Once provider readiness and global guardrails pass,
            // restoring it must not wait for an idle queue/request sample.
            $desired = $minimum;
            $action = 'scale_up';
            $eligible = true;
            $sampleReady = true;
            $lastScaleUp = $now;
            $lowSince = null;
            $lowCount = 0;
            $reasons[] = 'minimum_capacity_floor_recovery';
        } elseif (! $sampleReady || ! $eligible) {
            $reasons[] = $sampleReady ? 'automation_not_eligible' : 'telemetry_not_ready';
            $lowSince = null;
            $lowCount = 0;
        } elseif ($raw > $current) {
            $lowSince = null;
            $lowCount = 0;
            $upThreshold = (float) config('capacity_planning.plan.scale_up_threshold_percent', 65);
            $forceScaleUp = (bool) ($input['force_scale_up'] ?? false);

            if (! $forceScaleUp && ($load === null || $load < $upThreshold)) {
                $reasons[] = 'scale_up_hysteresis';

                return $this->result(
                    $input,
                    $current,
                    $ready,
                    $minimum,
                    $maximum,
                    $raw,
                    $load,
                    $desired,
                    $action,
                    $eligible,
                    $sampleReady,
                    $safe,
                    $reasons,
                    $lowCount,
                    $lowSince,
                    $lastScaleUp,
                    $lastScaleDown,
                    $mode,
                );
            }
            $cooldown = (int) config('capacity_planning.plan.scale_up_cooldown_seconds', 60);
            $previousDesired = max($current, (int) ($state['desired_instances'] ?? $current));

            if ($lastScaleUp !== null && $lastScaleUp->addSeconds($cooldown)->greaterThan($now)) {
                $desired = min($maximum, $raw, $previousDesired);
                $action = $desired > $current ? 'scale_up' : 'hold';
                $reasons[] = 'scale_up_cooldown';
            } else {
                $percentStep = max(1, (int) ceil(
                    max(1, $current) * ((int) config('capacity_planning.plan.maximum_scale_up_percent', 50) / 100),
                ));
                $step = min(
                    (int) config('capacity_planning.plan.maximum_scale_up_step', 4),
                    $percentStep,
                );
                $desired = min($maximum, $raw, $current + max(1, $step));
                $action = $desired > $current ? 'scale_up' : 'hold';

                if ($action === 'scale_up') {
                    $lastScaleUp = $now;
                    $reasons[] = 'bounded_scale_up';
                }
            }
        } elseif ($raw < $current) {
            $downThreshold = (float) config('capacity_planning.plan.scale_down_threshold_percent', 35);
            if ($load === null || $load > $downThreshold) {
                $reasons[] = 'scale_down_hysteresis';
                $lowSince = null;
                $lowCount = 0;
            } else {
                $previousDesired = (int) ($state['desired_instances'] ?? $current);
                $pendingScaleDown = $lastScaleDown !== null
                    && $previousDesired >= $minimum
                    && $previousDesired < $current;
                if ($pendingScaleDown) {
                    // Desired state is idempotent. Until the provider reports
                    // movement (or load/readiness cancels it), keep emitting
                    // the same bounded target so convergence failures remain
                    // observable instead of disappearing behind cooldown.
                    $desired = max($minimum, $raw, $previousDesired);
                    $action = $desired < $current ? 'scale_down' : 'hold';
                    $lowSince = null;
                    $lowCount = 0;
                    $reasons[] = 'scale_down_pending_convergence';

                    return $this->result(
                        $input,
                        $current,
                        $ready,
                        $minimum,
                        $maximum,
                        $raw,
                        $load,
                        $desired,
                        $action,
                        $eligible,
                        $sampleReady,
                        $safe,
                        $reasons,
                        $lowCount,
                        $lowSince,
                        $lastScaleUp,
                        $lastScaleDown,
                        $mode,
                    );
                }

                $stableCurrent = $state !== null
                    && (int) ($state['observed_instances'] ?? -1) === $current;
                $newObservation = $state === null
                    || ! hash_equals(
                        (string) ($state['last_observation_id'] ?? ''),
                        (string) ($input['observation_id'] ?? ''),
                    );
                $lowSince = $stableCurrent && $lowSince !== null ? $lowSince : $now;
                $lowCount = ! $stableCurrent
                    ? 1
                    : ($newObservation ? $lowCount + 1 : $lowCount);
                $stabilization = (int) config('capacity_planning.plan.scale_down_stabilization_seconds', 900);
                $required = (int) config('capacity_planning.plan.scale_down_required_observations', 5);
                $downCooldown = (int) config('capacity_planning.plan.scale_down_cooldown_seconds', 600);
                $stableLongEnough = $lowSince->addSeconds($stabilization)->lessThanOrEqualTo($now)
                    && $lowCount >= $required;
                $cooldownFinished = ($lastScaleUp === null || $lastScaleUp->addSeconds($downCooldown)->lessThanOrEqualTo($now))
                    && ($lastScaleDown === null || $lastScaleDown->addSeconds($downCooldown)->lessThanOrEqualTo($now));

                if (! $stableLongEnough) {
                    $reasons[] = 'scale_down_stabilizing';
                } elseif (! $cooldownFinished) {
                    $reasons[] = 'scale_down_cooldown';
                } else {
                    $step = max(1, (int) config('capacity_planning.plan.maximum_scale_down_step', 1));
                    $desired = max($minimum, $raw, $current - $step);
                    $action = $desired < $current ? 'scale_down' : 'hold';
                    if ($action === 'scale_down') {
                        $lastScaleDown = $now;
                        $lowSince = null;
                        $lowCount = 0;
                        $reasons[] = 'stabilized_scale_down';
                    }
                }
            }
        } else {
            $reasons[] = 'capacity_matches_demand';
            $lowSince = null;
            $lowCount = 0;
        }

        if ((bool) ($input['capacity_limited'] ?? false)) {
            $reasons[] = 'configured_capacity_ceiling_reached';
        }

        return $this->result(
            $input,
            $current,
            $ready,
            $minimum,
            $maximum,
            $raw,
            $load,
            $desired,
            $action,
            $eligible,
            $sampleReady,
            $safe,
            $reasons,
            $lowCount,
            $lowSince,
            $lastScaleUp,
            $lastScaleDown,
            $mode,
        );
    }

    /** @return array{target:array<string,mixed>,state:array<string,mixed>} */
    private function result(
        array $input,
        int $current,
        int $ready,
        int $minimum,
        int $maximum,
        int $raw,
        ?float $load,
        int $desired,
        string $action,
        bool $eligible,
        bool $sampleReady,
        bool $safe,
        array $reasons,
        int $lowCount,
        ?CarbonImmutable $lowSince,
        ?CarbonImmutable $lastScaleUp,
        ?CarbonImmutable $lastScaleDown,
        string $mode,
    ): array {
        if ((bool) ($input['capacity_limited'] ?? false)) {
            $reasons[] = 'configured_capacity_ceiling_reached';
        }
        $reasons = array_values(array_unique($reasons));

        return [
            'target' => [
                'kind' => (string) ($input['kind'] ?? 'unknown'),
                'state_token' => (string) ($input['state_token'] ?? ''),
                'current_instances' => $current,
                'ready_instances' => $ready,
                'minimum_instances' => $minimum,
                'maximum_instances' => $maximum,
                'raw_recommendation' => $raw,
                'desired_instances' => $desired,
                'load_percent' => $load === null ? null : round($load, 2),
                'cpu_utilization_percent' => is_numeric($input['cpu_utilization_percent'] ?? null)
                    ? round((float) $input['cpu_utilization_percent'], 2)
                    : null,
                'memory_utilization_percent' => is_numeric($input['memory_utilization_percent'] ?? null)
                    ? round((float) $input['memory_utilization_percent'], 2)
                    : null,
                'action' => $action,
                'automation_eligible' => $mode === 'signed_plan'
                    && $eligible
                    && $sampleReady
                    && $safe
                    && $ready === $current,
                'capacity_limited' => (bool) ($input['capacity_limited'] ?? false),
                'reasons' => $reasons,
            ],
            'state' => [
                'observed_instances' => $current,
                'raw_recommendation' => $raw,
                'desired_instances' => $desired,
                'low_observation_count' => $lowCount,
                'low_since' => $lowSince,
                'last_scale_up_at' => $lastScaleUp,
                'last_scale_down_at' => $lastScaleDown,
            ],
        ];
    }

    private function stateTime(mixed $value): ?CarbonImmutable
    {
        if ($value instanceof \DateTimeInterface) {
            return CarbonImmutable::instance($value)->utc();
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value)->utc();
        } catch (\Throwable) {
            return null;
        }
    }
}
