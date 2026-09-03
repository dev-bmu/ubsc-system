<?php

namespace App\Services\Capacity;

use App\Models\CapacityLoadEvidence;
use App\Models\CapacityPlatformObservation;
use App\Models\CapacityScalingPlan;
use App\Models\CapacityScalingState;
use App\Services\Monitoring\BackgroundQueueRegistry;
use App\Services\Monitoring\PerformanceCapacityMonitor;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

final class CapacityAutoscalingPlanner
{
    public function __construct(
        private readonly CapacityEnvelopeSigner $signer,
        private readonly CapacityLoadEvidenceStore $evidenceStore,
        private readonly CapacityPlatformObservationStore $observationStore,
        private readonly CapacityScalingPolicy $policy,
        private readonly PerformanceCapacityMonitor $performance,
        private readonly BackgroundQueueRegistry $queues,
        private readonly CapacityControlLease $lease,
    ) {}

    /** @return array<string, mixed> */
    public function plan(): array
    {
        $mode = (string) config('capacity_planning.mode', 'advisory');
        if (! in_array($mode, ['advisory', 'signed_plan'], true)) {
            throw new RuntimeException('CAPACITY_AUTOSCALING_MODE must be advisory or signed_plan.');
        }
        if ($mode === 'signed_plan' && ! $this->signer->hasActiveKey('plan')) {
            throw new RuntimeException('Signed autoscaling mode requires an active capacity plan key.');
        }

        return $this->lease->run(fn (): array => $this->build($mode));
    }

    /** @return array<string, mixed> */
    private function build(string $mode, int $sourceRetry = 0): array
    {
        $now = CarbonImmutable::now('UTC')->setMicrosecond(0);
        $observation = $this->observationStore->latestForCurrent();
        $performance = $this->performance->summary();
        $evidence = $this->capacityEvidence();
        $sourceFingerprint = $this->sourceFingerprint($observation, $evidence);
        $inputHash = $this->inputHash(
            $now,
            $observation?->payload_hash,
            collect($evidence)->map(static fn ($item): ?string => $item?->payload_hash)->all(),
            $performance,
            $mode,
        );

        $existing = CapacityScalingPlan::query()->where('input_hash', $inputHash)->first();
        if ($existing !== null) {
            if (! $this->verifyStoredPlan($existing)) {
                if ($sourceRetry < 2 && $this->sourceSnapshotChanged($sourceFingerprint)) {
                    return $this->build($mode, $sourceRetry + 1);
                }

                throw new RuntimeException('Stored capacity plan failed signature verification.');
            }

            return $this->envelopeFromPlan($existing, true);
        }

        try {
            $generated = DB::transaction(function () use ($now, $observation, $evidence, $performance, $mode, $inputHash): array {
                $targets = [];
                $globalReasons = [];
                $guard = $this->databaseGuard((array) ($performance['database'] ?? []));
                $expectedTargets = $this->expectedTargetKeys();
                $observedTargets = $observation === null
                    ? []
                    : (array) data_get($observation->payload, 'targets', []);

                $missingEvidence = array_values(array_filter(
                    array_keys($evidence),
                    static fn (string $scope): bool => $evidence[$scope] === null,
                ));
                if ($missingEvidence !== []) {
                    $globalReasons[] = 'required_scope_capacity_evidence_missing';
                }
                if (! $guard['safe']) {
                    $globalReasons[] = $guard['reason'];
                }

                if ($observation === null) {
                    $globalReasons[] = 'fresh_signed_platform_observation_missing';
                } else {
                    $reportedTargets = array_keys($observedTargets);
                    if (array_diff($expectedTargets, $reportedTargets) !== []
                        || array_diff($reportedTargets, $expectedTargets) !== []) {
                        $globalReasons[] = 'managed_target_snapshot_incomplete';
                    }

                    $globalSafe = $globalReasons === [];

                    if (is_array($observedTargets['web'] ?? null)) {
                        $targets['web'] = $this->webTarget(
                            (array) $observedTargets['web'],
                            $performance,
                            $evidence,
                            $guard,
                            $globalSafe,
                            $mode,
                            (string) $observation->observation_id,
                            $now,
                        );
                    }

                    foreach ($expectedTargets as $key) {
                        if ($key === 'web' || ! is_array($observedTargets[$key] ?? null)) {
                            continue;
                        }

                        $targets[$key] = $this->queueTarget(
                            $key,
                            (array) $observedTargets[$key],
                            $performance,
                            $guard,
                            $globalSafe,
                            $mode,
                            (string) $observation->observation_id,
                            $now,
                        );
                    }
                }

                $primaryEvidence = $this->primaryEvidence($evidence);

                $actions = array_column($targets, 'action');
                $blocked = $globalReasons !== []
                    || $observation === null
                    || array_keys($targets) !== $expectedTargets;
                $status = match (true) {
                    $blocked => 'blocked',
                    in_array('scale_up', $actions, true) || in_array('scale_down', $actions, true) => 'actionable',
                    default => 'hold',
                };
                $generatedAt = $now->toIso8601String();
                $expiresAt = $now->addSeconds((int) config('capacity_planning.plan.ttl_seconds', 90));
                if ($observation?->expires_at !== null) {
                    $observationExpiry = CarbonImmutable::instance($observation->expires_at)->utc();
                    if ($observationExpiry->lessThan($expiresAt)) {
                        $expiresAt = $observationExpiry;
                    }
                }
                foreach ($evidence as $proof) {
                    if ($proof?->expires_at === null) {
                        continue;
                    }
                    $evidenceExpiry = CarbonImmutable::instance($proof->expires_at)->utc();
                    if ($evidenceExpiry->lessThan($expiresAt)) {
                        $expiresAt = $evidenceExpiry;
                    }
                }
                $payload = [
                    'schema_version' => 3,
                    'plan_id' => (string) Str::uuid(),
                    'input_hash' => $inputHash,
                    'generated_at' => $generatedAt,
                    'expires_at' => $expiresAt->toIso8601String(),
                    'environment' => (string) config('capacity_planning.environment'),
                    'release' => (string) config('monitoring.release'),
                    'infrastructure_profile' => (string) config('capacity_planning.infrastructure_profile'),
                    'provider' => (string) config('capacity_planning.platform.provider'),
                    'mode' => $mode,
                    'status' => $status,
                    'observation_id' => $observation?->observation_id,
                    'evidence_id' => $primaryEvidence?->public_id,
                    'evidence_ids' => collect($evidence)->map(
                        static fn ($item): ?string => $item?->public_id,
                    )->all(),
                    'guardrails' => $guard,
                    'targets' => $targets,
                    'reasons' => array_values(array_unique($globalReasons)),
                ];
                $signed = $this->signer->hasActiveKey('plan')
                    ? $this->signer->sign('plan', $payload)
                    : ['key_id' => null, 'signature' => null];
                $envelope = [
                    'schema_version' => 1,
                    'key_id' => $signed['key_id'],
                    'payload' => $payload,
                    'signature' => $signed['signature'],
                ];

                if ($signed['key_id'] !== null && $signed['signature'] !== null) {
                    $decisionFingerprint = $this->decisionFingerprint($payload);
                    $plan = CapacityScalingPlan::query()->create([
                        'public_id' => (string) Str::uuid(),
                        'plan_id' => $payload['plan_id'],
                        'status' => $status,
                        'environment' => $payload['environment'],
                        'release' => $payload['release'],
                        'infrastructure_profile' => $payload['infrastructure_profile'],
                        'observation_id' => $observation?->observation_id,
                        'evidence_id' => $primaryEvidence?->public_id,
                        'decision_fingerprint' => $decisionFingerprint,
                        'input_hash' => $inputHash,
                        'payload' => $payload,
                        'payload_hash' => $this->signer->hash($payload),
                        'signing_key_id' => $signed['key_id'],
                        'signature' => $signed['signature'],
                        'generated_at' => $this->databaseTime($now),
                        'expires_at' => $this->databaseTime($expiresAt),
                        'recorded_at' => $this->databaseTime($now),
                    ]);

                    return $this->envelopeFromPlan($plan, false);
                }

                return [...$envelope, 'persisted' => false, 'reused' => false];
            }, 3);
        } catch (QueryException $exception) {
            // The distributed lease is the first line of defence. This unique
            // input-hash recovery is the database-level fence if a process is
            // paused beyond its lease and another node commits the same plan.
            $concurrent = CapacityScalingPlan::query()->where('input_hash', $inputHash)->first();
            if ($concurrent === null) {
                throw $exception;
            }
            if (! $this->verifyStoredPlan($concurrent)) {
                if ($sourceRetry < 2 && $this->sourceSnapshotChanged($sourceFingerprint)) {
                    return $this->build($mode, $sourceRetry + 1);
                }

                throw new RuntimeException(
                    'Concurrent capacity plan failed signature verification.',
                    previous: $exception,
                );
            }

            return $this->envelopeFromPlan($concurrent, true);
        }

        if (($generated['persisted'] ?? false) === true) {
            $stored = CapacityScalingPlan::query()
                ->where('plan_id', (string) data_get($generated, 'payload.plan_id'))
                ->first();
            if ($stored === null || ! $this->verifyStoredPlan($stored)) {
                if ($sourceRetry < 2 && $this->sourceSnapshotChanged($sourceFingerprint)) {
                    return $this->build($mode, $sourceRetry + 1);
                }

                throw new RuntimeException('New capacity plan failed final source-bound verification.');
            }
        }

        return $generated;
    }

    /** @return array<string, mixed> */
    private function webTarget(
        array $observed,
        array $performance,
        array $evidence,
        array $guard,
        bool $globalSafe,
        string $mode,
        string $observationId,
        CarbonImmutable $now,
    ): array {
        $current = (int) ($observed['current_instances'] ?? 0);
        $ready = (int) ($observed['ready_instances'] ?? 0);
        $minimum = (int) config('capacity_planning.web.minimum_instances', 2);
        $maximum = max($minimum, (int) config('capacity_planning.web.maximum_instances', 20));
        $scopeRows = collect((array) data_get($performance, 'http.scopes', []))->keyBy('key');
        $requiredScopes = array_values((array) config('capacity_planning.evidence.required_scopes', []));
        $missingScopes = [];
        $unstableScopes = [];
        $capacityUnits = 0.0;
        $activeScopes = 0;

        foreach ($requiredScopes as $scope) {
            if (! is_string($scope)) {
                continue;
            }
            $proof = $evidence[$scope] ?? null;
            if ($proof === null) {
                $missingScopes[] = $scope;
            }
            $row = $scopeRows->get($scope);
            $requestCount = is_array($row) ? max(0, (int) ($row['request_count'] ?? 0)) : 0;
            if ($requestCount < 1) {
                continue;
            }

            $activeScopes++;
            if (($row['sample_status'] ?? null) !== 'ready') {
                $unstableScopes[] = $scope;
            }
            $perInstance = $proof === null
                ? null
                : (float) $proof->operational_requests_per_second_per_instance;
            if ($perInstance !== null && $perInstance > 0) {
                $scopeRps = max(0, (float) ($row['requests_per_second'] ?? 0));
                $capacityUnits += $scopeRps / $perInstance;
            }
        }

        $sampleReady = $activeScopes > 0 && $unstableScopes === [];
        $upThreshold = (float) config('capacity_planning.plan.scale_up_threshold_percent', 65) / 100;
        $applicationRecommendation = $sampleReady && $missingScopes === []
            ? max($minimum, (int) ceil($capacityUnits / $upThreshold))
            : $minimum;
        $resource = $this->resourcePressure($observed, $current, $minimum);
        $resourceLoad = max($resource['cpu_percent'], $resource['memory_percent']);
        $resourceScaleUp = $resource['raw_recommendation'] > $current
            && $resourceLoad >= (float) config('capacity_planning.plan.scale_up_threshold_percent', 65);
        $rawUnbounded = max($applicationRecommendation, $resource['raw_recommendation']);
        $capacityLimited = $rawUnbounded > $maximum;
        $applicationLoad = $activeScopes > 0 && $missingScopes === [] && $current > 0
            ? ($capacityUnits / $current) * 100
            : null;
        $load = min(1_000_000, max(array_filter(
            [$applicationLoad, $resource['cpu_percent'], $resource['memory_percent']],
            static fn (mixed $value): bool => is_numeric($value),
        )));
        $reasons = [];
        if ($missingScopes !== []) {
            $reasons[] = 'capacity_evidence_missing:'.implode(',', $missingScopes);
        }
        if ($unstableScopes !== []) {
            $reasons[] = 'traffic_scope_telemetry_collecting:'.implode(',', $unstableScopes);
        }
        if ($resourceScaleUp) {
            $reasons[] = 'provider_resource_pressure';
        }

        return $this->evaluateTarget('web', [
            'kind' => 'web',
            'mode' => $mode,
            'current_instances' => $current,
            'ready_instances' => $ready,
            'minimum_instances' => $minimum,
            'maximum_instances' => $maximum,
            'raw_recommendation' => min($maximum, $rawUnbounded),
            'load_percent' => $load,
            'sample_ready' => $sampleReady || $resourceScaleUp,
            'automation_eligible' => $globalSafe
                && $missingScopes === []
                && ($sampleReady || $resourceScaleUp),
            'system_safe' => $globalSafe && $guard['safe'],
            'force_scale_up' => $resourceScaleUp,
            'capacity_limited' => $capacityLimited,
            'state_token' => (string) $observed['state_token'],
            'cpu_utilization_percent' => $resource['cpu_percent'],
            'memory_utilization_percent' => $resource['memory_percent'],
            'reasons' => $reasons,
        ], $observationId, $now);
    }

    /** @return array<string, mixed> */
    private function queueTarget(
        string $key,
        array $observed,
        array $performance,
        array $guard,
        bool $globalSafe,
        string $mode,
        string $observationId,
        CarbonImmutable $now,
    ): array {
        $lane = substr($key, 6);
        $queue = collect((array) data_get($performance, 'queues.items', []))
            ->firstWhere('key', $lane);
        $workers = is_array($queue) ? (array) ($queue['workers'] ?? []) : [];
        $current = (int) ($observed['current_instances'] ?? 0);
        $runtimeMs = is_array($queue) && is_numeric($queue['p95_runtime_ms'] ?? null)
            ? (float) $queue['p95_runtime_ms']
            : null;
        $jobsPerMinute = is_array($queue) ? max(0, (float) ($queue['jobs_per_minute'] ?? 0)) : 0;
        $load = $runtimeMs !== null && $current > 0
            ? (($jobsPerMinute / 60) * ($runtimeMs / 1_000) / $current) * 100
            : null;
        $queueErrorSafe = is_array($queue)
            && is_numeric($queue['error_rate_percent'] ?? null)
            && (float) $queue['error_rate_percent'] >= 0
            && (float) $queue['error_rate_percent'] <= (float) config('capacity_planning.guardrails.maximum_queue_error_rate_percent', 2);
        $minimum = (int) config("background_jobs.worker_capacity.minimum.{$lane}", 0);
        $maximum = (int) config("background_jobs.worker_capacity.maximum.{$lane}", 1);
        $resource = $this->resourcePressure($observed, $current, $minimum);
        $queueRecommendation = (int) ($workers['recommended'] ?? 0);
        $rawUnbounded = max($minimum, $queueRecommendation, $resource['raw_recommendation']);
        $resourceLoad = max($resource['cpu_percent'], $resource['memory_percent']);
        $resourceScaleUp = $resource['raw_recommendation'] > $current
            && $resourceLoad >= (float) config('capacity_planning.plan.scale_up_threshold_percent', 65);
        $queueSampleReady = is_array($queue) && ($queue['sample_status'] ?? null) === 'ready';
        $queueAutomationEligible = (bool) ($workers['automation_eligible'] ?? false);
        $requiresFloorRecovery = $current < $minimum;
        $effectiveLoad = min(1_000_000, max(array_filter(
            [$load, $resource['cpu_percent'], $resource['memory_percent']],
            static fn (mixed $value): bool => is_numeric($value),
        )));

        return $this->evaluateTarget($key, [
            'kind' => 'queue',
            'mode' => $mode,
            'current_instances' => $current,
            'ready_instances' => (int) ($observed['ready_instances'] ?? 0),
            'minimum_instances' => $minimum,
            'maximum_instances' => $maximum,
            'raw_recommendation' => min($maximum, $rawUnbounded),
            'load_percent' => $effectiveLoad,
            'sample_ready' => $queueSampleReady || $resourceScaleUp,
            'automation_eligible' => $globalSafe
                && (($queueSampleReady && $queueAutomationEligible) || $resourceScaleUp),
            // Missing local execution telemetry must not create a circular
            // dependency when the independently observed worker count is
            // already below its configured availability floor.
            'system_safe' => $globalSafe
                && $guard['safe']
                && ($queueErrorSafe || $requiresFloorRecovery),
            'force_scale_up' => (int) ($workers['backlog_workers'] ?? 0) > 0 || $resourceScaleUp,
            'capacity_limited' => (bool) ($workers['capacity_limited'] ?? false) || $rawUnbounded > $maximum,
            'state_token' => (string) $observed['state_token'],
            'cpu_utilization_percent' => $resource['cpu_percent'],
            'memory_utilization_percent' => $resource['memory_percent'],
            'reasons' => array_values(array_filter([
                $queueErrorSafe || $requiresFloorRecovery ? null : 'queue_error_guardrail_blocked',
                ! $queueErrorSafe && $requiresFloorRecovery
                    ? 'queue_telemetry_unavailable_floor_recovery'
                    : null,
                $resourceScaleUp ? 'provider_resource_pressure' : null,
            ])),
        ], $observationId, $now);
    }

    /** @return array<string, mixed> */
    private function evaluateTarget(string $targetKey, array $input, string $observationId, CarbonImmutable $now): array
    {
        $stateKey = $this->stateStorageKey($targetKey);
        $state = CapacityScalingState::query()->whereKey($stateKey)->lockForUpdate()->first();
        $input['observation_id'] = $observationId;
        $evaluated = $this->policy->evaluate($input, $state?->toArray(), $now);
        $next = $evaluated['state'];

        CapacityScalingState::query()->updateOrCreate(
            ['target_key' => $stateKey],
            [
                ...$next,
                'low_since' => $this->nullableDatabaseTime($next['low_since'] ?? null),
                'last_scale_up_at' => $this->nullableDatabaseTime($next['last_scale_up_at'] ?? null),
                'last_scale_down_at' => $this->nullableDatabaseTime($next['last_scale_down_at'] ?? null),
                'last_observation_id' => $observationId,
                'version' => max(1, (int) ($state?->version ?? 0) + 1),
            ],
        );

        return $evaluated['target'];
    }

    private function stateStorageKey(string $targetKey): string
    {
        $namespace = $this->signer->hash([
            'environment' => (string) config('capacity_planning.environment'),
            'release' => (string) config('monitoring.release'),
            'infrastructure_profile' => (string) config('capacity_planning.infrastructure_profile'),
            'provider' => (string) config('capacity_planning.platform.provider'),
            'mode' => (string) config('capacity_planning.mode'),
            'policy' => $this->policyFingerprint(),
        ]);

        return $targetKey.'@'.substr($namespace, 0, 24);
    }

    /** @return list<string> */
    private function expectedTargetKeys(): array
    {
        return ['web', ...$this->queues->capacityTargetKeys()];
    }

    /**
     * @param  array<string, mixed>  $observed
     * @return array{cpu_percent:float,memory_percent:float,raw_recommendation:int}
     */
    private function resourcePressure(array $observed, int $current, int $minimum): array
    {
        $cpu = (float) $observed['cpu_utilization_percent'];
        $memory = (float) $observed['memory_utilization_percent'];
        $cpuTarget = max(1, (float) config('capacity_planning.resources.cpu_target_percent', 65));
        $memoryTarget = max(1, (float) config('capacity_planning.resources.memory_target_percent', 70));
        $resourceRecommendation = $current > 0
            ? max(
                $minimum,
                (int) ceil($current * ($cpu / $cpuTarget)),
                (int) ceil($current * ($memory / $memoryTarget)),
            )
            : $minimum;

        return [
            'cpu_percent' => round($cpu, 2),
            'memory_percent' => round($memory, 2),
            'raw_recommendation' => $resourceRecommendation,
        ];
    }

    /** @return array{safe:bool,status:string,reason:string,connection_utilization_percent:float|null,lock_waits_current:int|null,slow_queries_per_minute:float|null} */
    private function databaseGuard(array $database): array
    {
        $connection = data_get($database, 'connections.utilization_percent');
        $locks = $database['lock_waits_current'] ?? null;
        $slow = $database['slow_queries_per_minute'] ?? null;
        $connectionValid = is_numeric($connection)
            && (float) $connection >= 0
            && (float) $connection <= 100;
        $locksValid = is_int($locks) && $locks >= 0;
        $slowValid = is_numeric($slow) && (float) $slow >= 0;
        $required = (bool) config('capacity_planning.guardrails.require_database_telemetry_for_scale_up', true);
        $ready = ($database['sample_status'] ?? null) === 'ready'
            && $connectionValid
            && $locksValid
            && $slowValid;
        $safe = (! $required || $ready)
            && (! $connectionValid || (float) $connection <= (float) config('capacity_planning.guardrails.database_connection_scale_up_limit_percent', 65))
            && (! $locksValid || $locks <= (int) config('capacity_planning.guardrails.database_lock_wait_scale_up_limit', 0))
            && (! $slowValid || (float) $slow <= (float) config('capacity_planning.guardrails.database_slow_query_scale_up_limit_per_minute', 1));

        return [
            'safe' => $safe,
            'status' => $safe ? 'pass' : 'blocked',
            'reason' => ! $ready && $required
                ? 'database_capacity_telemetry_not_ready'
                : ($safe ? 'database_guardrails_passed' : 'database_saturation_guardrail_blocked'),
            'connection_utilization_percent' => $connectionValid ? round((float) $connection, 2) : null,
            'lock_waits_current' => $locksValid ? min(1_000_000, $locks) : null,
            'slow_queries_per_minute' => $slowValid
                ? min(1_000_000, round((float) $slow, 3))
                : null,
        ];
    }

    private function inputHash(
        CarbonImmutable $now,
        ?string $observationHash,
        array $evidenceHashes,
        array $performance,
        string $mode,
    ): string {
        $windowSeconds = min(60, max(10, (int) config('capacity_planning.plan.ttl_seconds', 90)));
        $windowStart = intdiv($now->getTimestamp(), $windowSeconds) * $windowSeconds;

        return $this->signer->hash([
            'decision_window' => gmdate('Y-m-d\TH:i:s\Z', $windowStart),
            'control_identity' => [
                'environment' => (string) config('capacity_planning.environment'),
                'release' => (string) config('monitoring.release'),
                'infrastructure_profile' => (string) config('capacity_planning.infrastructure_profile'),
                'provider' => (string) config('capacity_planning.platform.provider'),
                'mode' => $mode,
            ],
            'observation_hash' => $observationHash,
            'evidence_hashes' => $evidenceHashes,
            'http' => [
                'sample_status' => data_get($performance, 'http.sample_status'),
                'requests_per_second' => data_get($performance, 'http.requests_per_second'),
                'p95_ms' => data_get($performance, 'http.p95_ms'),
                'error_rate_percent' => data_get($performance, 'http.error_rate_percent'),
                'scopes' => collect((array) data_get($performance, 'http.scopes', []))->map(
                    static fn (array $scope): array => [
                        'key' => $scope['key'] ?? null,
                        'sample_status' => $scope['sample_status'] ?? null,
                        'request_count' => $scope['request_count'] ?? null,
                        'requests_per_second' => $scope['requests_per_second'] ?? null,
                        'p95_ms' => $scope['p95_ms'] ?? null,
                        'error_rate_percent' => $scope['error_rate_percent'] ?? null,
                    ],
                )->values()->all(),
            ],
            'queues' => collect((array) data_get($performance, 'queues.items', []))->map(
                static fn (array $queue): array => [
                    'key' => $queue['key'] ?? null,
                    'sample_status' => $queue['sample_status'] ?? null,
                    'jobs_per_minute' => $queue['jobs_per_minute'] ?? null,
                    'p95_runtime_ms' => $queue['p95_runtime_ms'] ?? null,
                    'error_rate_percent' => $queue['error_rate_percent'] ?? null,
                    'workers' => $queue['workers'] ?? null,
                ],
            )->values()->all(),
            'database' => [
                'sample_status' => data_get($performance, 'database.sample_status'),
                'connection_utilization_percent' => data_get($performance, 'database.connections.utilization_percent'),
                'lock_waits_current' => data_get($performance, 'database.lock_waits_current'),
                'slow_queries_per_minute' => data_get($performance, 'database.slow_queries_per_minute'),
            ],
            // Only non-secret policy inputs belong in persisted fingerprints.
            'policy' => $this->policyFingerprint(),
        ]);
    }

    /** @return array<string, mixed> */
    private function policyFingerprint(): array
    {
        return [
            'plan' => collect((array) config('capacity_planning.plan'))
                ->except(['active_key_id', 'signing_keys'])
                ->all(),
            'platform' => collect((array) config('capacity_planning.platform'))
                ->except(['active_key_id', 'signing_keys'])
                ->all(),
            'evidence' => collect((array) config('capacity_planning.evidence'))
                ->except(['active_key_id', 'signing_keys'])
                ->all(),
            'web' => (array) config('capacity_planning.web'),
            'resources' => (array) config('capacity_planning.resources'),
            'guardrails' => (array) config('capacity_planning.guardrails'),
            'worker_capacity' => (array) config('background_jobs.worker_capacity'),
        ];
    }

    /** @param array<string, mixed> $payload */
    private function decisionFingerprint(array $payload): string
    {
        return $this->signer->hash([
            'status' => $payload['status'],
            'targets' => collect((array) $payload['targets'])->map(
                static fn (array $target): array => [
                    'state_token' => $target['state_token'] ?? null,
                    'action' => $target['action'] ?? null,
                    'current_instances' => $target['current_instances'] ?? null,
                    'desired_instances' => $target['desired_instances'] ?? null,
                    'capacity_limited' => $target['capacity_limited'] ?? null,
                    'reasons' => $target['reasons'] ?? [],
                ],
            )->all(),
            'reasons' => $payload['reasons'],
        ]);
    }

    /** @return array<string, \App\Models\CapacityLoadEvidence|null> */
    private function capacityEvidence(): array
    {
        $evidence = [];

        foreach ((array) config('capacity_planning.evidence.required_scopes', []) as $scope) {
            if (is_string($scope) && is_array(config("performance.scopes.{$scope}"))) {
                $evidence[$scope] = $this->evidenceStore->latestForCurrent($scope);
            }
        }

        return $evidence;
    }

    /**
     * JSON object key order is not a storage contract. Prefer the public-read
     * proof when present; otherwise select the first non-null scope in lexical
     * order so PHP, MySQL JSON, and the provider runtime make one decision.
     *
     * @param  array<string, CapacityLoadEvidence|null>  $evidence
     */
    private function primaryEvidence(array $evidence): ?CapacityLoadEvidence
    {
        if (($evidence['public_read'] ?? null) instanceof CapacityLoadEvidence) {
            return $evidence['public_read'];
        }

        ksort($evidence, SORT_STRING);

        foreach ($evidence as $proof) {
            if ($proof instanceof CapacityLoadEvidence) {
                return $proof;
            }
        }

        return null;
    }

    /** @param array<string, \App\Models\CapacityLoadEvidence|null> $evidence */
    private function sourceFingerprint(?CapacityPlatformObservation $observation, array $evidence): string
    {
        return $this->signer->hash([
            'observation_hash' => $observation?->payload_hash,
            'evidence_hashes' => collect($evidence)->map(
                static fn (?CapacityLoadEvidence $item): ?string => $item?->payload_hash,
            )->all(),
        ]);
    }

    private function sourceSnapshotChanged(string $expectedFingerprint): bool
    {
        $current = $this->sourceFingerprint(
            $this->observationStore->latestForCurrent(),
            $this->capacityEvidence(),
        );

        return ! hash_equals($expectedFingerprint, $current);
    }

    public function latestStoredPlanForCurrent(): ?CapacityScalingPlan
    {
        return CapacityScalingPlan::query()
            ->where('environment', (string) config('capacity_planning.environment'))
            ->where('release', (string) config('monitoring.release'))
            ->where('infrastructure_profile', (string) config('capacity_planning.infrastructure_profile'))
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->first();
    }

    public function verifyStoredPlan(CapacityScalingPlan $plan): bool
    {
        try {
            $payload = (array) $plan->payload;
            $generatedAt = CapacityTimestamp::parse($payload['generated_at'] ?? null);
            $expiresAt = CapacityTimestamp::parse($payload['expires_at'] ?? null);
            if ($generatedAt === null || $expiresAt === null) {
                return false;
            }
            $now = CarbonImmutable::now('UTC');
            $clockSkew = (int) config('capacity_planning.platform.maximum_clock_skew_seconds', 30);
            $ttl = (int) config('capacity_planning.plan.ttl_seconds', 90);

            return Str::isUuid((string) $plan->public_id)
                && hash_equals((string) $plan->payload_hash, $this->signer->hash($payload))
                && $this->signer->verify(
                    'plan',
                    $payload,
                    (string) $plan->signing_key_id,
                    (string) $plan->getRawOriginal('signature'),
                )
                && hash_equals((string) $plan->plan_id, (string) ($payload['plan_id'] ?? ''))
                && hash_equals((string) $plan->input_hash, (string) ($payload['input_hash'] ?? ''))
                && hash_equals((string) $plan->status, (string) ($payload['status'] ?? ''))
                && hash_equals((string) $plan->environment, (string) ($payload['environment'] ?? ''))
                && hash_equals((string) $plan->release, (string) ($payload['release'] ?? ''))
                && hash_equals((string) $plan->infrastructure_profile, (string) ($payload['infrastructure_profile'] ?? ''))
                && hash_equals((string) ($plan->observation_id ?? ''), (string) ($payload['observation_id'] ?? ''))
                && hash_equals((string) ($plan->evidence_id ?? ''), (string) ($payload['evidence_id'] ?? ''))
                && hash_equals((string) $plan->decision_fingerprint, $this->decisionFingerprint($payload))
                && ($payload['schema_version'] ?? null) === 3
                && hash_equals((string) config('capacity_planning.mode'), (string) ($payload['mode'] ?? ''))
                && hash_equals((string) config('capacity_planning.environment'), (string) ($payload['environment'] ?? ''))
                && hash_equals((string) config('monitoring.release'), (string) ($payload['release'] ?? ''))
                && hash_equals((string) config('capacity_planning.infrastructure_profile'), (string) ($payload['infrastructure_profile'] ?? ''))
                && hash_equals((string) config('capacity_planning.platform.provider'), (string) ($payload['provider'] ?? ''))
                && $this->planPayloadIsSafe($payload)
                && $this->sourceArtifactsAreValid($payload, $expiresAt)
                && $plan->generated_at !== null
                && $plan->expires_at !== null
                && $plan->recorded_at !== null
                && $generatedAt->equalTo($plan->generated_at)
                && $expiresAt->equalTo($plan->expires_at)
                && $generatedAt->equalTo($plan->recorded_at)
                && $generatedAt->lessThanOrEqualTo($now->addSeconds($clockSkew))
                && $expiresAt->greaterThan($now)
                && ($expiresAt->getTimestamp() - $generatedAt->getTimestamp()) >= 30
                && ($expiresAt->getTimestamp() - $generatedAt->getTimestamp()) <= $ttl;
        } catch (Throwable) {
            return false;
        }
    }

    /** @param array<string, mixed> $payload */
    private function planPayloadIsSafe(array $payload): bool
    {
        $status = $payload['status'] ?? null;
        $mode = $payload['mode'] ?? null;
        $targets = $payload['targets'] ?? null;
        $guard = $payload['guardrails'] ?? null;
        $expectedTargets = $this->expectedTargetKeys();
        $evidenceIds = $payload['evidence_ids'] ?? null;
        $requiredScopes = array_values(array_filter(
            (array) config('capacity_planning.evidence.required_scopes', []),
            'is_string',
        ));

        if (! $this->exactFields($payload, [
            'schema_version', 'plan_id', 'input_hash', 'generated_at', 'expires_at', 'environment',
            'release', 'infrastructure_profile', 'provider', 'mode', 'status',
            'observation_id', 'evidence_id', 'evidence_ids', 'guardrails', 'targets',
            'reasons',
        ])
            || ! Str::isUuid((string) ($payload['plan_id'] ?? ''))
            || preg_match('/\A[a-f0-9]{64}\z/', (string) ($payload['input_hash'] ?? '')) !== 1
            || ! in_array($status, ['actionable', 'hold', 'blocked'], true)
            || ! in_array($mode, ['advisory', 'signed_plan'], true)
            || ! is_array($targets)
            || (array_is_list($targets) && $targets !== [])
            || count($targets) > 64
            || ! $this->validReasons($payload['reasons'] ?? null)
            || ! is_array($guard)
            || ! $this->exactFields($guard, [
                'safe', 'status', 'reason', 'connection_utilization_percent',
                'lock_waits_current', 'slow_queries_per_minute',
            ])
            || ! is_bool($guard['safe'] ?? null)
            || ! in_array($guard['status'] ?? null, ['pass', 'blocked'], true)
            || (($guard['safe'] ?? false) !== (($guard['status'] ?? null) === 'pass'))
            || ! is_string($guard['reason'] ?? null)
            || strlen((string) $guard['reason']) < 1
            || strlen((string) $guard['reason']) > 160
            || ! $this->boundedDecimal($guard['connection_utilization_percent'] ?? null, 0, 100, 2, true)
            || ! $this->boundedIntegerOrNull($guard['lock_waits_current'] ?? null, 0, 1_000_000)
            || ! $this->boundedDecimal($guard['slow_queries_per_minute'] ?? null, 0, 1_000_000, 3, true)
            || ! is_array($evidenceIds)
            || (array_is_list($evidenceIds) && $evidenceIds !== [])
            || count($evidenceIds) > 32
            || array_diff($requiredScopes, array_keys($evidenceIds)) !== []
            || array_diff(array_keys($evidenceIds), $requiredScopes) !== []
            || collect($evidenceIds)->contains(
                static fn (mixed $id): bool => $id !== null && ! Str::isUuid((string) $id),
            )
            || count(array_filter(array_values($evidenceIds)))
                !== count(array_unique(array_filter(array_values($evidenceIds))))
            || ($status !== 'blocked' && in_array(null, array_values($evidenceIds), true))
            || (($payload['observation_id'] ?? null) !== null
                && ! Str::isUuid((string) $payload['observation_id']))
            || (($payload['evidence_id'] ?? null) !== null
                && (! Str::isUuid((string) $payload['evidence_id'])
                    || ! in_array($payload['evidence_id'], array_values($evidenceIds), true)))) {
            return false;
        }

        $reportedTargets = array_keys($targets);
        $complete = array_diff($expectedTargets, $reportedTargets) === []
            && array_diff($reportedTargets, $expectedTargets) === [];
        if (($status !== 'blocked' && ! $complete) || ($targets !== [] && ! $complete)) {
            return false;
        }

        $hasAction = false;
        foreach ($targets as $key => $target) {
            if (! is_string($key)
                || ! is_array($target)
                || array_is_list($target)
                || ! $this->exactFields($target, [
                    'kind', 'state_token', 'current_instances', 'ready_instances',
                    'minimum_instances', 'maximum_instances', 'raw_recommendation',
                    'desired_instances', 'load_percent', 'cpu_utilization_percent',
                    'memory_utilization_percent', 'action', 'automation_eligible',
                    'capacity_limited', 'reasons',
                ])
                || ! in_array($target['kind'] ?? null, ['web', 'queue'], true)
                || (($key === 'web') !== (($target['kind'] ?? null) === 'web'))
                || preg_match('/\A(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})\z/', $key) !== 1
                || preg_match('/\A[a-f0-9]{64}\z/', (string) ($target['state_token'] ?? '')) !== 1
                || ! $this->boundedInteger($target['current_instances'] ?? null, 0, 1_000)
                || ! $this->boundedInteger($target['ready_instances'] ?? null, 0, (int) ($target['current_instances'] ?? -1))
                || ! $this->boundedInteger($target['minimum_instances'] ?? null, $key === 'web' ? 2 : 0, 1_000)
                || ! $this->boundedInteger($target['maximum_instances'] ?? null, (int) ($target['minimum_instances'] ?? -1), 1_000)
                || ! $this->boundedInteger($target['raw_recommendation'] ?? null, (int) ($target['minimum_instances'] ?? -1), (int) ($target['maximum_instances'] ?? -1))
                || ! $this->boundedInteger($target['desired_instances'] ?? null, 0, max((int) ($target['current_instances'] ?? 0), (int) ($target['maximum_instances'] ?? 0)))
                || ! $this->boundedDecimal($target['load_percent'] ?? null, 0, 1_000_000, 2, true)
                || ! $this->boundedDecimal($target['cpu_utilization_percent'] ?? null, 0, 100, 2)
                || ! $this->boundedDecimal($target['memory_utilization_percent'] ?? null, 0, 100, 2)
                || ! is_bool($target['automation_eligible'] ?? null)
                || ! is_bool($target['capacity_limited'] ?? null)
                || ! $this->validReasons($target['reasons'] ?? null)) {
                return false;
            }

            $action = $target['action'] ?? null;
            $current = (int) $target['current_instances'];
            $desired = (int) $target['desired_instances'];
            $raw = (int) $target['raw_recommendation'];
            [$expectedMinimum, $expectedMaximum] = $this->targetBounds($key);
            $scaleDownThreshold = (float) config('capacity_planning.plan.scale_down_threshold_percent', 35);
            $maximumScaleUpStep = min(
                (int) config('capacity_planning.plan.maximum_scale_up_step', 4),
                max(1, (int) ceil(
                    max(1, $current)
                    * ((int) config('capacity_planning.plan.maximum_scale_up_percent', 50) / 100),
                )),
            );
            $floorRecovery = $current < $expectedMinimum
                && $desired === $expectedMinimum
                && in_array('minimum_capacity_floor_recovery', $target['reasons'], true);
            $directionValid = match ($action) {
                'hold' => $desired === $current,
                'scale_up' => $desired > $current
                    && $raw > $current
                    && $desired <= $raw
                    && $desired >= (int) $target['minimum_instances']
                    && $desired <= (int) $target['maximum_instances']
                    && ($floorRecovery || ($desired - $current) <= $maximumScaleUpStep),
                'scale_down' => $desired < $current
                    && $raw < $current
                    && $desired >= $raw
                    && ($current - $desired) <= (int) config('capacity_planning.plan.maximum_scale_down_step', 1)
                    && $desired >= (int) $target['minimum_instances']
                    && $target['load_percent'] !== null
                    && (float) $target['load_percent'] <= $scaleDownThreshold
                    && (float) $target['cpu_utilization_percent'] <= $scaleDownThreshold
                    && (float) $target['memory_utilization_percent'] <= $scaleDownThreshold,
                'advisory' => $mode === 'advisory' && $desired === $current,
                default => false,
            };
            if ((int) $target['minimum_instances'] !== $expectedMinimum
                || (int) $target['maximum_instances'] !== $expectedMaximum
                || ! $directionValid
                || ($action !== 'hold' && $action !== 'advisory'
                    && (($target['automation_eligible'] ?? false) !== true
                        || (int) $target['ready_instances'] !== $current))) {
                return false;
            }
            $hasAction = $hasAction || in_array($action, ['scale_up', 'scale_down'], true);
        }

        if ($status === 'blocked' && $hasAction) {
            return false;
        }

        if ($status !== 'blocked' && ! Str::isUuid((string) ($payload['observation_id'] ?? ''))) {
            return false;
        }

        return ($hasAction === ($status === 'actionable'))
            && (! $hasAction || (($guard['safe'] ?? false) === true && ($guard['status'] ?? null) === 'pass'));
    }

    private function boundedInteger(mixed $value, int $minimum, int $maximum): bool
    {
        return is_int($value) && $value >= $minimum && $value <= $maximum;
    }

    /** @return array{0:int,1:int} */
    private function targetBounds(string $targetKey): array
    {
        if ($targetKey === 'web') {
            $minimum = (int) config('capacity_planning.web.minimum_instances', 2);
            $maximum = (int) config('capacity_planning.web.maximum_instances', 20);

            return [$minimum, max($minimum, $maximum)];
        }

        $lane = substr($targetKey, 6);
        $minimum = (int) config("background_jobs.worker_capacity.minimum.{$lane}", 0);
        $maximum = (int) config("background_jobs.worker_capacity.maximum.{$lane}", $minimum);

        return [$minimum, max($minimum, $maximum)];
    }

    /** @param array<string, mixed> $payload */
    private function sourceArtifactsAreValid(array $payload, CarbonImmutable $planExpiresAt): bool
    {
        $observationId = $payload['observation_id'] ?? null;
        $currentObservation = $this->observationStore->latestForCurrent();
        if ($observationId === null) {
            if ($currentObservation !== null || (array) ($payload['targets'] ?? []) !== []) {
                return false;
            }
            $observation = null;
        } else {
            $observation = CapacityPlatformObservation::query()
                ->where('observation_id', (string) $observationId)
                ->first();
            if ($observation === null
                || $currentObservation === null
                || (int) $currentObservation->id !== (int) $observation->id
                || ! $this->observationStore->validStored($observation)
                || $observation->expires_at?->greaterThanOrEqualTo($planExpiresAt) !== true) {
                return false;
            }
        }

        $observedTargets = $observation === null
            ? []
            : (array) data_get($observation->payload, 'targets', []);
        if (array_diff(array_keys((array) ($payload['targets'] ?? [])), array_keys($observedTargets)) !== []) {
            return false;
        }
        foreach ((array) ($payload['targets'] ?? []) as $targetKey => $target) {
            $observed = $observedTargets[$targetKey] ?? null;
            if (! is_string($targetKey)
                || ! is_array($target)
                || ! is_array($observed)
                || ! hash_equals((string) ($observed['kind'] ?? ''), (string) ($target['kind'] ?? ''))
                || ! hash_equals((string) ($observed['state_token'] ?? ''), (string) ($target['state_token'] ?? ''))
                || (int) ($observed['current_instances'] ?? -1) !== (int) ($target['current_instances'] ?? -2)
                || (int) ($observed['ready_instances'] ?? -1) !== (int) ($target['ready_instances'] ?? -2)
                || abs(round((float) ($observed['cpu_utilization_percent'] ?? -1), 2)
                    - (float) ($target['cpu_utilization_percent'] ?? -2)) > 0.0001
                || abs(round((float) ($observed['memory_utilization_percent'] ?? -1), 2)
                    - (float) ($target['memory_utilization_percent'] ?? -2)) > 0.0001) {
                return false;
            }
        }

        $evidenceIds = (array) ($payload['evidence_ids'] ?? []);
        foreach ($evidenceIds as $scope => $evidenceId) {
            if (! is_string($scope)) {
                return false;
            }
            $currentEvidence = $this->evidenceStore->latestForCurrent($scope);
            if ($evidenceId === null) {
                if ($currentEvidence !== null) {
                    return false;
                }

                continue;
            }

            $evidence = CapacityLoadEvidence::query()
                ->where('public_id', (string) $evidenceId)
                ->first();
            if ($evidence === null
                || $currentEvidence === null
                || (int) $currentEvidence->id !== (int) $evidence->id
                || ! hash_equals($scope, (string) $evidence->scope)
                || ! $this->evidenceStore->validStored($evidence)
                || $evidence->expires_at?->greaterThanOrEqualTo($planExpiresAt) !== true) {
                return false;
            }
        }

        $orderedEvidenceIds = $evidenceIds;
        ksort($orderedEvidenceIds, SORT_STRING);
        $primaryEvidence = $evidenceIds['public_read'] ?? collect($orderedEvidenceIds)->filter()->first();
        if ((string) ($payload['evidence_id'] ?? '') !== (string) ($primaryEvidence ?? '')) {
            return false;
        }

        return true;
    }

    private function boundedIntegerOrNull(mixed $value, int $minimum, int $maximum): bool
    {
        return $value === null || $this->boundedInteger($value, $minimum, $maximum);
    }

    private function boundedNumber(
        mixed $value,
        float $minimum,
        float $maximum,
        bool $nullable = false,
    ): bool {
        if ($nullable && $value === null) {
            return true;
        }

        return (is_int($value) || is_float($value))
            && is_finite((float) $value)
            && (float) $value >= $minimum
            && (float) $value <= $maximum;
    }

    private function boundedDecimal(
        mixed $value,
        float $minimum,
        float $maximum,
        int $places,
        bool $nullable = false,
    ): bool {
        if (! $this->boundedNumber($value, $minimum, $maximum, $nullable)) {
            return false;
        }

        return $value === null
            || abs((float) $value - round((float) $value, $places)) <= 0.0000001;
    }

    private function validReasons(mixed $reasons): bool
    {
        return is_array($reasons)
            && array_is_list($reasons)
            && count($reasons) <= 32
            && collect($reasons)->every(
                static fn (mixed $reason): bool => is_string($reason)
                    && $reason !== ''
                    && strlen($reason) <= 256,
            );
    }

    /** @param list<string> $allowed */
    private function onlyFields(array $value, array $allowed): bool
    {
        return array_diff(array_keys($value), $allowed) === [];
    }

    /** @param list<string> $fields */
    private function exactFields(array $value, array $fields): bool
    {
        return count($value) === count($fields)
            && $this->onlyFields($value, $fields)
            && array_diff($fields, array_keys($value)) === [];
    }

    /** @return array<string, mixed> */
    private function envelopeFromPlan(CapacityScalingPlan $plan, bool $reused): array
    {
        return [
            'schema_version' => 1,
            'key_id' => (string) $plan->signing_key_id,
            'payload' => (array) $plan->payload,
            'signature' => (string) $plan->getRawOriginal('signature'),
            'persisted' => true,
            'reused' => $reused,
        ];
    }

    private function databaseTime(CarbonImmutable $value): CarbonImmutable
    {
        return $value->setTimezone((string) config('app.timezone', 'UTC'));
    }

    private function nullableDatabaseTime(mixed $value): ?CarbonImmutable
    {
        if ($value instanceof \DateTimeInterface) {
            return CarbonImmutable::instance($value)
                ->setTimezone((string) config('app.timezone', 'UTC'));
        }

        return null;
    }
}
