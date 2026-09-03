<?php

$environment = (string) env('APP_ENV', 'production');
$isTesting = $environment === 'testing';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';

$keyMap = static function (mixed $raw): array {
    if (! is_string($raw) || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);

    if (! is_array($decoded) || array_is_list($decoded) || count($decoded) > 16) {
        return [];
    }

    return array_filter(
        $decoded,
        static fn (mixed $value, mixed $key): bool => is_string($key)
            && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $key) === 1
            && is_string($value)
            && trim($value) !== '',
        ARRAY_FILTER_USE_BOTH,
    );
};

$requiredEvidenceScopes = array_values(array_unique(array_filter(
    array_map('trim', explode(',', (string) env(
        'CAPACITY_REQUIRED_EVIDENCE_SCOPES',
        'public_read,booking_checkout,admin,authentication,write',
    ))),
    static fn (string $scope): bool => preg_match('/\A[a-z][a-z0-9_]{0,31}\z/', $scope) === 1,
)));

$managedTargets = array_values(array_filter(
    array_map('trim', explode(',', (string) env('CAPACITY_MANAGED_TARGETS', ''))),
    static fn (string $target): bool => $target !== '',
));

return [
    /*
    | Capacity planning is a control plane, not a cloud API. The application
    | accepts signed platform observations, evaluates bounded policy, and
    | emits a short-lived signed desired-state plan. A provider-side adapter
    | remains the only component permitted to change replica/process counts.
    */
    'enabled' => $isMultiNode && (bool) env('CAPACITY_PLANNING_ENABLED', ! $isTesting),
    'enforce' => $isMultiNode && (bool) env('CAPACITY_PLANNING_ENFORCE', false),
    'mode' => strtolower((string) env('CAPACITY_AUTOSCALING_MODE', 'advisory')),
    'environment' => strtolower((string) env('CAPACITY_TARGET_ENVIRONMENT', $environment)),
    'infrastructure_profile' => trim((string) env('CAPACITY_INFRASTRUCTURE_PROFILE', '')),

    'coordination' => [
        'decision_lock_seconds' => min(120, max(10, (int) env('CAPACITY_DECISION_LOCK_SECONDS', 30))),
        'decision_lock_wait_seconds' => min(15, max(1, (int) env('CAPACITY_DECISION_LOCK_WAIT_SECONDS', 5))),
    ],

    'platform' => [
        'provider' => strtolower(trim((string) env('CAPACITY_PLATFORM_PROVIDER', ''))),
        // This is the independently deployed provider-adapter contract. The
        // production check requires it to match the application-derived set.
        'managed_targets' => $managedTargets,
        'observation_max_age_seconds' => min(600, max(30, (int) env('CAPACITY_OBSERVATION_MAX_AGE_SECONDS', 120))),
        'minimum_live_observations' => min(5, max(2, (int) env('CAPACITY_MINIMUM_LIVE_OBSERVATIONS', 2))),
        'minimum_observation_spacing_seconds' => min(60, max(5, (int) env('CAPACITY_MINIMUM_OBSERVATION_SPACING_SECONDS', 15))),
        'maximum_observation_spacing_seconds' => min(300, max(10, (int) env('CAPACITY_MAXIMUM_OBSERVATION_SPACING_SECONDS', 75))),
        'maximum_clock_skew_seconds' => min(300, max(5, (int) env('CAPACITY_MAX_CLOCK_SKEW_SECONDS', 30))),
        'maximum_payload_bytes' => min(262_144, max(4_096, (int) env('CAPACITY_MAX_PAYLOAD_BYTES', 65_536))),
        'active_key_id' => trim((string) env('CAPACITY_OBSERVATION_ACTIVE_KEY_ID', '')),
        'signing_keys' => $keyMap(env('CAPACITY_OBSERVATION_SIGNING_KEYS')),
    ],

    'evidence' => [
        'required_scopes' => $requiredEvidenceScopes,
        'expected_application_instances' => min(1_000, max(1, (int) env('CAPACITY_EVIDENCE_EXPECTED_INSTANCES', 2))),
        'maximum_age_days' => min(365, max(1, (int) env('CAPACITY_EVIDENCE_MAX_AGE_DAYS', 30))),
        'minimum_hold_seconds' => min(3_600, max(180, (int) env('CAPACITY_EVIDENCE_MIN_HOLD_SECONDS', 300))),
        'operational_headroom_percent' => min(60, max(10, (int) env('CAPACITY_OPERATIONAL_HEADROOM_PERCENT', 25))),
        'maximum_error_rate_percent' => min(5, max(0.01, (float) env('CAPACITY_EVIDENCE_MAX_ERROR_PERCENT', 1))),
        'require_release_match' => (bool) env('CAPACITY_EVIDENCE_REQUIRE_RELEASE_MATCH', true),
        'active_key_id' => trim((string) env('CAPACITY_EVIDENCE_ACTIVE_KEY_ID', '')),
        'signing_keys' => $keyMap(env('CAPACITY_EVIDENCE_SIGNING_KEYS')),
    ],

    'plan' => [
        'ttl_seconds' => min(300, max(30, (int) env('CAPACITY_PLAN_TTL_SECONDS', 90))),
        'scale_up_cooldown_seconds' => min(900, max(0, (int) env('CAPACITY_SCALE_UP_COOLDOWN_SECONDS', 60))),
        'scale_down_cooldown_seconds' => min(3_600, max(60, (int) env('CAPACITY_SCALE_DOWN_COOLDOWN_SECONDS', 600))),
        'scale_down_stabilization_seconds' => min(7_200, max(300, (int) env('CAPACITY_SCALE_DOWN_STABILIZATION_SECONDS', 900))),
        'scale_down_required_observations' => min(30, max(2, (int) env('CAPACITY_SCALE_DOWN_REQUIRED_OBSERVATIONS', 5))),
        'scale_up_threshold_percent' => min(90, max(40, (int) env('CAPACITY_SCALE_UP_THRESHOLD_PERCENT', 65))),
        'scale_down_threshold_percent' => min(60, max(10, (int) env('CAPACITY_SCALE_DOWN_THRESHOLD_PERCENT', 35))),
        'maximum_scale_up_step' => min(100, max(1, (int) env('CAPACITY_MAX_SCALE_UP_STEP', 4))),
        'maximum_scale_up_percent' => min(200, max(10, (int) env('CAPACITY_MAX_SCALE_UP_PERCENT', 50))),
        'maximum_scale_down_step' => min(20, max(1, (int) env('CAPACITY_MAX_SCALE_DOWN_STEP', 1))),
        'convergence_timeout_seconds' => min(1_800, max(60, (int) env('CAPACITY_CONVERGENCE_TIMEOUT_SECONDS', 300))),
        'active_key_id' => trim((string) env('CAPACITY_PLAN_ACTIVE_KEY_ID', '')),
        'signing_keys' => $keyMap(env('CAPACITY_PLAN_SIGNING_KEYS')),
    ],

    'web' => [
        'minimum_instances' => min(500, max(2, (int) env('CAPACITY_WEB_MIN_INSTANCES', 2))),
        'maximum_instances' => min(1_000, max(2, (int) env('CAPACITY_WEB_MAX_INSTANCES', 20))),
    ],

    'resources' => [
        // Provider CPU/memory is part of the signed snapshot and participates
        // in both scale-up sizing and scale-down hysteresis.
        'cpu_target_percent' => min(90, max(30, (int) env('CAPACITY_CPU_TARGET_PERCENT', 65))),
        'memory_target_percent' => min(90, max(30, (int) env('CAPACITY_MEMORY_TARGET_PERCENT', 70))),
    ],

    'guardrails' => [
        'database_connection_scale_up_limit_percent' => min(90, max(20, (int) env('CAPACITY_DB_SCALE_UP_LIMIT_PERCENT', 65))),
        'database_lock_wait_scale_up_limit' => min(100, max(0, (int) env('CAPACITY_DB_LOCK_WAIT_LIMIT', 0))),
        'database_slow_query_scale_up_limit_per_minute' => min(1_000, max(0, (int) env('CAPACITY_DB_SLOW_QUERY_LIMIT', 1))),
        'maximum_queue_error_rate_percent' => min(20, max(0, (float) env('CAPACITY_QUEUE_ERROR_LIMIT_PERCENT', 2))),
        'require_database_telemetry_for_scale_up' => (bool) env('CAPACITY_REQUIRE_DATABASE_TELEMETRY', true),
    ],

    'retention' => [
        'evidence_days' => min(3_650, max(30, (int) env('CAPACITY_EVIDENCE_RETENTION_DAYS', 365))),
        'observation_days' => min(90, max(2, (int) env('CAPACITY_OBSERVATION_RETENTION_DAYS', 31))),
        'decision_days' => min(365, max(7, (int) env('CAPACITY_DECISION_RETENTION_DAYS', 30))),
        'prune_batch_size' => min(10_000, max(100, (int) env('CAPACITY_PRUNE_BATCH_SIZE', 1_000))),
        'prune_max_batches' => min(50, max(1, (int) env('CAPACITY_PRUNE_MAX_BATCHES', 10))),
    ],
];
