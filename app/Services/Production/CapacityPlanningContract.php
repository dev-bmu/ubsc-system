<?php

namespace App\Services\Production;

use App\Exceptions\CapacityPlanningContractViolation;
use App\Services\Capacity\CapacityAutoscalingPlanner;
use App\Services\Capacity\CapacityEnvelopeSigner;
use App\Services\Capacity\CapacityLoadEvidenceStore;
use App\Services\Capacity\CapacityPlatformObservationStore;
use App\Services\Monitoring\BackgroundQueueRegistry;
use Illuminate\Contracts\Config\Repository;
use Throwable;

final class CapacityPlanningContract
{
    public function __construct(
        private readonly Repository $config,
        private readonly CapacityEnvelopeSigner $signer,
        private readonly CapacityLoadEvidenceStore $evidence,
        private readonly CapacityPlatformObservationStore $observations,
        private readonly CapacityAutoscalingPlanner $planner,
        private readonly BackgroundQueueRegistry $queues,
    ) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('capacity_planning.enforce', false);
    }

    /** @return array<string, mixed> */
    public function report(bool $live = false): array
    {
        $checks = [];
        $production = (string) $this->config->get('app.env') === 'production';
        $enabled = (bool) $this->config->get('capacity_planning.enabled', false);
        $enforced = $this->shouldEnforce();
        $mode = (string) $this->config->get('capacity_planning.mode', 'advisory');
        $productionAutomationRequired = $production && $enforced;

        $this->add($checks, 'capacity.enabled', $enabled ? 'pass' : 'fail',
            $enabled ? 'Capacity telemetry and planning are enabled.' : 'CAPACITY_PLANNING_ENABLED must be true.');
        $this->add(
            $checks,
            'contract.enforcement',
            $enforced ? 'pass' : ($production ? 'fail' : 'warning'),
            $enforced
                ? 'The production capacity contract is enforced.'
                : ($production
                    ? 'CAPACITY_PLANNING_ENFORCE must be true in production.'
                    : 'Capacity enforcement is intentionally disabled outside production.'),
        );
        $this->add(
            $checks,
            'autoscaling.mode',
            in_array($mode, ['advisory', 'signed_plan'], true)
                ? ($mode === 'signed_plan'
                    ? 'pass'
                    : ($productionAutomationRequired ? 'fail' : 'warning'))
                : 'fail',
            match ($mode) {
                'signed_plan' => 'The control plane emits signed, short-lived desired-state plans.',
                'advisory' => 'Capacity planning is advisory; no provider may apply the recommendation automatically.',
                default => 'CAPACITY_AUTOSCALING_MODE must be advisory or signed_plan.',
            },
        );

        $provider = trim((string) $this->config->get('capacity_planning.platform.provider'));
        $profile = trim((string) $this->config->get('capacity_planning.infrastructure_profile'));
        $environment = trim((string) $this->config->get('capacity_planning.environment'));
        $release = trim((string) $this->config->get('monitoring.release'));
        $this->add($checks, 'platform.provider', $this->identifier($provider, 64) ? 'pass' : 'fail',
            $provider !== '' ? 'A bounded platform adapter identity is configured.' : 'CAPACITY_PLATFORM_PROVIDER is required.');
        $this->add($checks, 'platform.profile', $this->identifier($profile, 128) ? 'pass' : 'fail',
            $profile !== '' ? 'An immutable infrastructure capacity profile is configured.' : 'CAPACITY_INFRASTRUCTURE_PROFILE is required.');
        $this->add($checks, 'platform.environment', $this->identifier($environment, 32) ? 'pass' : 'fail',
            $environment !== '' ? 'The target capacity environment is explicit.' : 'CAPACITY_TARGET_ENVIRONMENT is required.');
        $this->add($checks, 'release.identity', $this->identifier($release, 128) ? 'pass' : 'fail',
            $release !== '' ? 'Capacity evidence is tied to an immutable release identity.' : 'APP_RELEASE is required for capacity evidence binding.');

        foreach (['platform', 'evidence'] as $purpose) {
            $hasKeys = $this->signer->hasAnyKey($purpose);
            $this->add(
                $checks,
                "signing.{$purpose}_verification_keys",
                $hasKeys ? 'pass' : 'fail',
                $hasKeys
                    ? ucfirst($purpose).' verification keys are configured.'
                    : ucfirst($purpose).' verification keys are missing or shorter than 256 bits.',
            );
        }
        $hasPlanKey = $this->signer->hasActiveKey('plan');
        $this->add(
            $checks,
            'signing.plan_active_key',
            $hasPlanKey ? 'pass' : ($mode === 'signed_plan' ? 'fail' : 'warning'),
            $hasPlanKey
                ? 'The application has an active plan-signing key.'
                : ($mode === 'signed_plan'
                    ? 'CAPACITY_PLAN_ACTIVE_KEY_ID must resolve to a plan key of at least 256 bits.'
                    : 'A plan-signing key is required before signed-plan mode may be enabled.'),
        );

        $metricsEnabled = (bool) $this->config->get('performance.enabled', false);
        $metricsDriver = (string) $this->config->get('performance.driver', '');
        $this->add(
            $checks,
            'telemetry.performance_enabled',
            $metricsEnabled ? 'pass' : 'fail',
            $metricsEnabled
                ? 'Bounded first-party request and queue telemetry is enabled.'
                : 'PERFORMANCE_METRICS_ENABLED must be true for capacity decisions.',
        );
        $this->add(
            $checks,
            'telemetry.shared_driver',
            $metricsDriver === 'redis'
                ? 'pass'
                : ($metricsDriver === 'database'
                    ? ($productionAutomationRequired ? 'fail' : 'warning')
                    : 'fail'),
            match ($metricsDriver) {
                'redis' => 'Low-cardinality performance telemetry is shared across nodes through Redis.',
                'database' => 'Database telemetry is coherent but Redis is required by the strict high-throughput production profile.',
                default => 'PERFORMANCE_METRICS_DRIVER must be redis or database.',
            },
        );
        $databaseTelemetryRequired = (bool) $this->config->get(
            'capacity_planning.guardrails.require_database_telemetry_for_scale_up',
            true,
        );
        $this->add(
            $checks,
            'guardrail.database_telemetry',
            $databaseTelemetryRequired ? 'pass' : ($mode === 'signed_plan' ? 'fail' : 'warning'),
            $databaseTelemetryRequired
                ? 'Automatic movement fails closed unless database saturation telemetry is ready.'
                : 'CAPACITY_REQUIRE_DATABASE_TELEMETRY must be true before signed-plan mode is enabled.',
        );

        $observationAge = (int) $this->config->get('capacity_planning.platform.observation_max_age_seconds', 120);
        $planTtl = (int) $this->config->get('capacity_planning.plan.ttl_seconds', 90);
        $freshnessSafe = $planTtl >= 30 && $planTtl <= $observationAge;
        $this->add(
            $checks,
            'plan.freshness',
            $freshnessSafe ? 'pass' : 'fail',
            $freshnessSafe
                ? 'Plan expiry never outlives its maximum platform-observation age.'
                : 'CAPACITY_PLAN_TTL_SECONDS must be between 30 seconds and the observation freshness limit.',
        );
        $minimumLiveObservations = (int) $this->config->get('capacity_planning.platform.minimum_live_observations', 0);
        $minimumObservationSpacing = (int) $this->config->get('capacity_planning.platform.minimum_observation_spacing_seconds', 0);
        $maximumObservationSpacing = (int) $this->config->get('capacity_planning.platform.maximum_observation_spacing_seconds', 0);
        $continuityWindow = max(0, $minimumLiveObservations - 1) * $maximumObservationSpacing;
        $observerContinuitySafe = $minimumLiveObservations >= 2
            && $minimumLiveObservations <= 5
            && $minimumObservationSpacing >= 5
            && $minimumObservationSpacing <= 60
            && $maximumObservationSpacing >= $minimumObservationSpacing
            && $maximumObservationSpacing <= 300
            && $continuityWindow <= max(0, $observationAge - 30);
        $this->add(
            $checks,
            'platform.observer_continuity',
            $observerContinuitySafe ? 'pass' : 'fail',
            $observerContinuitySafe
                ? "The live gate requires {$minimumLiveObservations} signed observer cycles separated by {$minimumObservationSpacing}-{$maximumObservationSpacing} seconds."
                : 'Observer count and minimum/maximum spacing must fit safely inside the signed observation freshness window.',
        );

        $scaleUp = (int) $this->config->get('capacity_planning.plan.scale_up_threshold_percent', 65);
        $scaleDown = (int) $this->config->get('capacity_planning.plan.scale_down_threshold_percent', 35);
        $stabilization = (int) $this->config->get('capacity_planning.plan.scale_down_stabilization_seconds', 900);
        $downCooldown = (int) $this->config->get('capacity_planning.plan.scale_down_cooldown_seconds', 600);
        $upCooldown = (int) $this->config->get('capacity_planning.plan.scale_up_cooldown_seconds', 60);
        $requiredDownObservations = (int) $this->config->get('capacity_planning.plan.scale_down_required_observations', 5);
        $maximumScaleUpStep = (int) $this->config->get('capacity_planning.plan.maximum_scale_up_step', 4);
        $maximumScaleUpPercent = (int) $this->config->get('capacity_planning.plan.maximum_scale_up_percent', 50);
        $maximumScaleDownStep = (int) $this->config->get('capacity_planning.plan.maximum_scale_down_step', 1);
        $policySafe = $scaleDown < $scaleUp
            && $upCooldown >= 0
            && $upCooldown <= 900
            && $downCooldown >= 60
            && $downCooldown <= 3_600
            && $stabilization >= max(300, $downCooldown)
            && $stabilization <= 7_200
            && $requiredDownObservations >= 2
            && $requiredDownObservations <= 30
            && $maximumScaleUpStep >= 1
            && $maximumScaleUpStep <= 100
            && $maximumScaleUpPercent >= 10
            && $maximumScaleUpPercent <= 200
            && $maximumScaleDownStep >= 1
            && $maximumScaleDownStep <= 20;
        $this->add(
            $checks,
            'plan.anti_flap_policy',
            $policySafe ? 'pass' : 'fail',
            $policySafe
                ? 'Thresholds, bounded steps, cooldowns, and multi-sample stabilization form a non-overlapping anti-flap policy.'
                : 'Capacity thresholds, step limits, cooldowns, or scale-down stabilization are outside the safe bounded policy.',
        );
        $convergenceTimeout = (int) $this->config->get('capacity_planning.plan.convergence_timeout_seconds', 0);
        $convergenceSafe = $convergenceTimeout >= max(60, $planTtl * 2)
            && $convergenceTimeout <= 1_800;
        $this->add(
            $checks,
            'plan.convergence_timeout',
            $convergenceSafe ? 'pass' : 'fail',
            $convergenceSafe
                ? "An unchanged actionable provider state raises an incident after {$convergenceTimeout} seconds."
                : 'CAPACITY_CONVERGENCE_TIMEOUT_SECONDS must be at least two plan TTLs and no more than 1,800 seconds.',
        );

        $webMin = (int) $this->config->get('capacity_planning.web.minimum_instances', 0);
        $webMax = (int) $this->config->get('capacity_planning.web.maximum_instances', 0);
        $this->add(
            $checks,
            'bounds.web',
            $webMin >= 2 && $webMin <= 500 && $webMax >= $webMin && $webMax <= 1_000 ? 'pass' : 'fail',
            $webMin >= 2 && $webMin <= 500 && $webMax >= $webMin && $webMax <= 1_000
                ? "Web capacity is bounded between {$webMin} and {$webMax} instances."
                : 'Web autoscaling requires a 2-500 floor and a ceiling no lower than the floor or above 1,000.',
        );

        $workerBoundsSafe = true;
        foreach ((array) $this->config->get('background_jobs.worker_capacity.minimum', []) as $lane => $minimum) {
            $maximum = $this->config->get("background_jobs.worker_capacity.maximum.{$lane}");
            if (! is_string($lane) || ! is_numeric($minimum) || ! is_numeric($maximum)
                || (int) $minimum < 0
                || (int) $minimum > 1_000
                || (int) $maximum < (int) $minimum
                || (int) $maximum > 1_000) {
                $workerBoundsSafe = false;
            }
        }
        foreach ($this->queues->capacityTargetKeys() as $targetKey) {
            $lane = substr($targetKey, 6);
            $minimum = $this->config->get("background_jobs.worker_capacity.minimum.{$lane}");
            $maximum = $this->config->get("background_jobs.worker_capacity.maximum.{$lane}");
            if (! is_numeric($minimum)
                || ! is_numeric($maximum)
                || (int) $minimum < 0
                || (int) $minimum > 1_000
                || (int) $maximum < (int) $minimum
                || (int) $maximum > 1_000) {
                $workerBoundsSafe = false;
            }
        }
        $this->add(
            $checks,
            'bounds.workers',
            $workerBoundsSafe ? 'pass' : 'fail',
            $workerBoundsSafe ? 'Every queue lane has a valid fail-safe floor and ceiling.' : 'One or more worker capacity bounds are invalid.',
        );

        $managedTargets = ['web', ...$this->queues->capacityTargetKeys()];
        $adapterTargets = array_values((array) $this->config->get(
            'capacity_planning.platform.managed_targets',
            [],
        ));
        $normalizedManagedTargets = $managedTargets;
        $normalizedAdapterTargets = $adapterTargets;
        sort($normalizedManagedTargets, SORT_STRING);
        sort($normalizedAdapterTargets, SORT_STRING);
        $targetContractSafe = count($managedTargets) <= 64
            && count($managedTargets) === count(array_unique($managedTargets))
            && count($adapterTargets) === count(array_unique($adapterTargets))
            && collect($adapterTargets)->every(
                static fn (mixed $target): bool => is_string($target)
                    && preg_match('/\A(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})\z/', $target) === 1,
            )
            && $normalizedAdapterTargets === $normalizedManagedTargets;
        $this->add(
            $checks,
            'platform.managed_targets',
            $targetContractSafe ? 'pass' : 'fail',
            $targetContractSafe
                ? count($managedTargets).' uniquely identified web/queue targets exactly match the independently deployed provider adapter.'
                : 'CAPACITY_MANAGED_TARGETS must be unique and exactly match every application-managed web/queue target.',
        );

        $cpuTarget = (int) $this->config->get('capacity_planning.resources.cpu_target_percent', 0);
        $memoryTarget = (int) $this->config->get('capacity_planning.resources.memory_target_percent', 0);
        $resourcePolicySafe = $cpuTarget >= 30 && $cpuTarget <= 90
            && $memoryTarget >= 30 && $memoryTarget <= 90
            && $scaleDown < $scaleUp
            && $scaleUp <= min($cpuTarget, $memoryTarget);
        $this->add(
            $checks,
            'plan.resource_pressure',
            $resourcePolicySafe ? 'pass' : 'fail',
            $resourcePolicySafe
                ? "Signed CPU/memory pressure participates in sizing ({$cpuTarget}% / {$memoryTarget}%)."
                : 'CPU and memory targets must be bounded at or above the scale-up threshold, with scale-down below it.',
        );

        $workerAutomation = (bool) $this->config->get('background_jobs.worker_capacity.automation_enabled', false);
        $this->add(
            $checks,
            'workers.adapter_opt_in',
            $mode !== 'signed_plan' || $workerAutomation ? 'pass' : 'fail',
            $mode !== 'signed_plan' || $workerAutomation
                ? 'Worker automation opt-in agrees with the capacity mode.'
                : 'BACKGROUND_WORKER_AUTOMATION_ENABLED must be true for signed-plan mode.',
        );

        $cacheStore = (string) $this->config->get('cache.default');
        $cacheDriver = (string) $this->config->get("cache.stores.{$cacheStore}.driver");
        $sharedLock = in_array($cacheDriver, ['redis', 'database', 'dynamodb'], true);
        $this->add(
            $checks,
            'coordination.distributed_lock',
            $sharedLock ? 'pass' : ($mode === 'signed_plan' ? 'fail' : 'warning'),
            $sharedLock
                ? "Planner decisions are serialized by the shared [{$cacheDriver}] lock provider."
                : 'Signed autoscaling requires a shared Redis, database, or DynamoDB cache lock.',
        );

        $lockSeconds = (int) $this->config->get('capacity_planning.coordination.decision_lock_seconds', 30);
        $lockWaitSeconds = (int) $this->config->get('capacity_planning.coordination.decision_lock_wait_seconds', 5);
        $lockWindowSafe = $lockSeconds >= 10
            && $lockSeconds <= 120
            && $lockWaitSeconds >= 1
            && $lockWaitSeconds < $lockSeconds;
        $this->add(
            $checks,
            'coordination.decision_lease',
            $lockWindowSafe ? 'pass' : 'fail',
            $lockWindowSafe
                ? 'The planner lease is bounded and its acquisition wait cannot outlive the owner lease.'
                : 'Capacity decision lock/wait values are outside the safe bounded window.',
        );

        $releaseBound = (bool) $this->config->get('capacity_planning.evidence.require_release_match', true);
        $this->add(
            $checks,
            'evidence.release_binding',
            $releaseBound ? 'pass' : 'fail',
            $releaseBound
                ? 'Load evidence must match the active application release.'
                : 'CAPACITY_EVIDENCE_REQUIRE_RELEASE_MATCH must remain enabled in production.',
        );
        $requiredScopes = (array) $this->config->get('capacity_planning.evidence.required_scopes', []);
        $scopesValid = $requiredScopes !== []
            && count($requiredScopes) === count(array_unique(array_filter($requiredScopes, 'is_string')))
            && collect($requiredScopes)->every(
                fn (mixed $scope): bool => is_string($scope)
                    && is_array($this->config->get("performance.scopes.{$scope}")),
            );
        $this->add(
            $checks,
            'evidence.required_scopes',
            $scopesValid ? 'pass' : 'fail',
            $scopesValid
                ? 'Every required workload scope maps to an explicit performance contract.'
                : 'CAPACITY_REQUIRED_EVIDENCE_SCOPES must be non-empty, unique, and configured under performance scopes.',
        );
        $expectedEvidenceInstances = (int) $this->config->get('capacity_planning.evidence.expected_application_instances', 0);
        $this->add(
            $checks,
            'evidence.instance_binding',
            $expectedEvidenceInstances >= 1 && $expectedEvidenceInstances <= 1_000 ? 'pass' : 'fail',
            $expectedEvidenceInstances >= 1 && $expectedEvidenceInstances <= 1_000
                ? "Load evidence must be measured against exactly {$expectedEvidenceInstances} ready application instance(s)."
                : 'CAPACITY_EVIDENCE_EXPECTED_INSTANCES must bind load evidence to a bounded immutable test topology.',
        );

        $evidenceRetention = (int) $this->config->get('capacity_planning.retention.evidence_days', 0);
        $observationRetention = (int) $this->config->get('capacity_planning.retention.observation_days', 0);
        $decisionRetention = (int) $this->config->get('capacity_planning.retention.decision_days', 0);
        $pruneBatch = (int) $this->config->get('capacity_planning.retention.prune_batch_size', 0);
        $pruneMaxBatches = (int) $this->config->get('capacity_planning.retention.prune_max_batches', 0);
        $evidenceMaximumAge = (int) $this->config->get('capacity_planning.evidence.maximum_age_days', 30);
        $retentionSafe = $evidenceRetention >= max(
            30,
            $evidenceMaximumAge + $decisionRetention + 1,
        )
            && $evidenceRetention <= 3_650
            && $observationRetention >= 2
            && $observationRetention <= 90
            && $decisionRetention >= 7
            && $decisionRetention <= 90
            && $observationRetention >= $decisionRetention + 1
            && $pruneBatch >= 100
            && $pruneBatch <= 10_000
            && $pruneMaxBatches >= 1
            && $pruneMaxBatches <= 50;
        $this->add(
            $checks,
            'storage.bounded_history',
            $retentionSafe ? 'pass' : 'fail',
            $retentionSafe
                ? 'High-frequency observations, plans, and inactive policy state have indexed, bounded retention and pruning work.'
                : 'Capacity history retention or prune limits are outside the production-safe bounds; observations must remain available for every retained decision.',
        );

        if ($live) {
            $this->appendLiveChecks($checks);
        }

        return $this->summarize($checks);
    }

    public function assertSatisfied(): void
    {
        $report = $this->report(false);
        if ($report['valid']) {
            return;
        }

        throw CapacityPlanningContractViolation::fromCodes(array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter($report['checks'], static fn (array $check): bool => $check['status'] === 'fail'),
        )));
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function appendLiveChecks(array &$checks): void
    {
        try {
            $missingEvidence = [];
            foreach ((array) $this->config->get('capacity_planning.evidence.required_scopes', []) as $scope) {
                if (! is_string($scope)
                    || ! is_array($this->config->get("performance.scopes.{$scope}"))
                    || $this->evidence->latestForCurrent($scope) === null) {
                    $missingEvidence[] = is_string($scope) ? $scope : 'invalid';
                }
            }
            $this->add(
                $checks,
                'live.capacity_evidence',
                $missingEvidence === [] ? 'pass' : 'fail',
                $missingEvidence === []
                    ? 'Fresh signed capacity evidence covers every required traffic scope for this release/profile.'
                    : 'Capacity evidence is missing for: '.implode(', ', $missingEvidence).'.',
            );
        } catch (Throwable) {
            $this->add($checks, 'live.capacity_evidence', 'fail', 'Capacity evidence storage or verification is unavailable.');
        }

        try {
            $observation = $this->observations->latestForCurrent();
            $requiredSamples = (int) $this->config->get('capacity_planning.platform.minimum_live_observations', 2);
            $minimumSpacing = (int) $this->config->get('capacity_planning.platform.minimum_observation_spacing_seconds', 15);
            $maximumSpacing = (int) $this->config->get('capacity_planning.platform.maximum_observation_spacing_seconds', 75);
            $recentObservations = $this->observations->continuousForCurrent(
                $requiredSamples,
                $minimumSpacing,
                $maximumSpacing,
            );
            $continuous = count($recentObservations) === $requiredSamples;
            $expectedTargets = [
                'web',
                ...$this->queues->capacityTargetKeys(),
            ];
            $reportedTargets = is_array($observation?->payload)
                ? array_keys((array) data_get($observation->payload, 'targets', []))
                : [];
            $missingTargets = array_values(array_diff(array_unique($expectedTargets), $reportedTargets));
            $this->add(
                $checks,
                'live.platform_observation',
                $observation !== null && $missingTargets === [] && $continuous ? 'pass' : 'fail',
                $observation !== null
                    ? ($missingTargets === [] && $continuous
                        ? "{$requiredSamples} fresh signed observer cycles cover every managed target."
                        : (! $continuous
                            ? "Fewer than {$requiredSamples} properly spaced fresh observer cycles are available."
                        : 'Platform observation is missing targets: '.implode(', ', $missingTargets).'.')
                    )
                    : 'No fresh verified platform observation matches this release/profile.',
            );
        } catch (Throwable) {
            $this->add($checks, 'live.platform_observation', 'fail', 'Platform observation storage or verification is unavailable.');
        }

        try {
            $plan = $this->planner->latestStoredPlanForCurrent();
            $valid = $plan !== null
                && $plan->expires_at?->isFuture()
                && $this->planner->verifyStoredPlan($plan);
            $this->add(
                $checks,
                'live.signed_plan',
                $valid && $plan?->status !== 'blocked' ? 'pass' : 'fail',
                $valid
                    ? ($plan->status === 'blocked'
                        ? 'The latest signed plan is valid but blocked by a safety prerequisite.'
                        : 'The latest short-lived autoscaling plan has a valid signature.')
                    : 'No fresh valid signed capacity plan is available.',
            );
        } catch (Throwable) {
            $this->add($checks, 'live.signed_plan', 'fail', 'Capacity plan storage or signature verification is unavailable.');
        }
    }

    private function identifier(string $value, int $maximum): bool
    {
        return $value !== ''
            && strlen($value) <= $maximum
            && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:\/+\-]{0,127}\z/', $value) === 1
            && preg_match('/replace|example|unknown|placeholder/i', $value) !== 1;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function summarize(array $checks): array
    {
        $failures = count(array_filter($checks, static fn (array $check): bool => $check['status'] === 'fail'));
        $warnings = count(array_filter($checks, static fn (array $check): bool => $check['status'] === 'warning'));

        return [
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => $checks,
        ];
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }
}
