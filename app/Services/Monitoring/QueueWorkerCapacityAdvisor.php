<?php

namespace App\Services\Monitoring;

final class QueueWorkerCapacityAdvisor
{
    /**
     * @param  array{key:string,label:string,connection:string,queue:string}  $definition
     * @param  array<string, mixed>  $metrics
     * @param  array<string, mixed>  $pulse
     * @return array<string, bool|float|int|string|null>
     */
    public function recommend(array $definition, array $metrics, array $pulse): array
    {
        $key = $definition['key'];
        $minimum = $this->limit('minimum', $key, 1, 0, 100);
        $maximum = max(
            $minimum,
            $this->limit('maximum', $key, max(2, $minimum), $minimum, 1_000),
        );
        $targetUtilization = min(0.9, max(
            0.25,
            ((float) config('background_jobs.worker_capacity.target_utilization_percent', 70)) / 100,
        ));
        $headroomMultiplier = 1 + (min(200, max(
            0,
            (float) config('background_jobs.worker_capacity.headroom_percent', 30),
        )) / 100);
        $catchUpSeconds = min(3_600, max(
            30,
            (int) config('background_jobs.worker_capacity.backlog_catch_up_seconds', 300),
        ));
        $sampleReady = ($metrics['sample_status'] ?? null) === 'ready';
        $jobsPerMinute = max(0, (float) ($metrics['jobs_per_minute'] ?? 0));
        $runtimeMs = $this->nullableNumber($metrics['p95_runtime_ms'] ?? null);
        $depth = $this->nullableNumber($pulse['depth'] ?? null);
        $depthIsCapped = (bool) ($pulse['depth_is_capped'] ?? false);

        if (! $sampleReady || $runtimeMs === null) {
            return $this->result(
                minimum: $minimum,
                maximum: $maximum,
                recommended: $minimum,
                steadyWorkers: null,
                backlogWorkers: null,
                automationEligible: false,
                capacityLimited: false,
                targetUtilization: $targetUtilization,
                reason: 'Collecting stable throughput and runtime samples.',
            );
        }

        $serviceSeconds = max(0.001, $runtimeMs / 1_000);
        $arrivalPerSecond = $jobsPerMinute / 60;
        $steadyWorkers = (int) ceil(
            (($arrivalPerSecond * $serviceSeconds) / $targetUtilization) * $headroomMultiplier,
        );
        $backlogWorkers = $depth === null
            ? 0
            : (int) ceil(($depth * $serviceSeconds) / $catchUpSeconds);
        $rawRecommendation = max($minimum, $steadyWorkers + $backlogWorkers);
        $capacityLimited = $depthIsCapped || $rawRecommendation > $maximum;
        $recommended = $depthIsCapped
            ? $maximum
            : min($maximum, $rawRecommendation);
        $automationEligible = (bool) config(
            'background_jobs.worker_capacity.automation_enabled',
            false,
        ) && $depth !== null && ! $depthIsCapped;

        return $this->result(
            minimum: $minimum,
            maximum: $maximum,
            recommended: $recommended,
            steadyWorkers: $steadyWorkers,
            backlogWorkers: $backlogWorkers,
            automationEligible: $automationEligible,
            capacityLimited: $capacityLimited,
            targetUtilization: $targetUtilization,
            reason: $depthIsCapped
                ? 'Backlog sample is capped; hold the configured maximum until a full sample is available.'
                : ($rawRecommendation > $maximum
                    ? 'Measured demand exceeds the configured worker maximum; scale to the ceiling and review upstream capacity.'
                    : ($automationEligible
                        ? 'Stable evidence is eligible for the platform autoscaler.'
                        : 'Advisory only; platform autoscaling is deliberately disabled.')),
        );
    }

    /** @return array<string, bool|float|int|string|null> */
    private function result(
        int $minimum,
        int $maximum,
        int $recommended,
        ?int $steadyWorkers,
        ?int $backlogWorkers,
        bool $automationEligible,
        bool $capacityLimited,
        float $targetUtilization,
        string $reason,
    ): array {
        return [
            'configured_minimum' => $minimum,
            'configured_maximum' => $maximum,
            'recommended' => $recommended,
            'steady_state_workers' => $steadyWorkers,
            'backlog_workers' => $backlogWorkers,
            'target_utilization_percent' => round($targetUtilization * 100, 2),
            'automation_eligible' => $automationEligible,
            'capacity_limited' => $capacityLimited,
            'reason' => $reason,
        ];
    }

    private function limit(
        string $type,
        string $key,
        int $fallback,
        int $minimum,
        int $maximum,
    ): int {
        $value = (int) config("background_jobs.worker_capacity.{$type}.{$key}", $fallback);

        return min($maximum, max($minimum, $value));
    }

    private function nullableNumber(mixed $value): ?float
    {
        return is_numeric($value) && (float) $value >= 0
            ? (float) $value
            : null;
    }
}
