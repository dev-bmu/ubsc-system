<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';
$verificationKeys = json_decode(
    (string) env('RESILIENCE_EVIDENCE_VERIFYING_KEYS', '{}'),
    true,
);
$ledgerKeys = json_decode(
    (string) env('RESILIENCE_LEDGER_SIGNING_KEYS', '{}'),
    true,
);
$activeVerificationKeyIds = array_values(array_unique(array_filter(array_map(
    static fn (string $keyId): string => trim($keyId),
    explode(',', (string) env('RESILIENCE_EVIDENCE_ACTIVE_KEY_IDS', '')),
))));
$requiredScenarios = array_values(array_unique(array_filter(array_map(
    static fn (string $scenario): string => strtolower(trim($scenario)),
    explode(',', (string) env(
        'RESILIENCE_REQUIRED_SCENARIOS',
        'application_node_loss,load_balancer_failover,queue_worker_restart,cache_primary_failover,database_writer_failover',
    )),
))));

return [
    /*
    | Fault injection never runs inside the Laravel application. A separately
    | credentialed provider orchestrator operates only against the declared
    | non-production target and submits signed, bounded outcome evidence.
    */
    'enabled' => $isMultiNode && (bool) env('RESILIENCE_DRILLS_ENABLED', false),
    'enforce' => $isMultiNode
        && (bool) env('RESILIENCE_DRILLS_ENFORCE', $isProduction),

    'target' => [
        'environment' => strtolower(trim((string) env(
            'RESILIENCE_TARGET_ENVIRONMENT',
            'staging',
        ))),
        'infrastructure_profile' => trim((string) env(
            'RESILIENCE_TARGET_INFRASTRUCTURE_PROFILE',
            '',
        )),
        'provider' => strtolower(trim((string) env('RESILIENCE_PROVIDER', ''))),
        'orchestrator' => strtolower(trim((string) env('RESILIENCE_ORCHESTRATOR', ''))),
        'production_names' => ['prd', 'prod', 'production', 'live'],
    ],

    'campaign' => [
        'required_scenarios' => $requiredScenarios,
        'interval_days' => max(1, (int) env('RESILIENCE_CAMPAIGN_INTERVAL_DAYS', 90)),
        'maximum_interval_days' => 90,
        'grace_days' => max(1, (int) env('RESILIENCE_CAMPAIGN_GRACE_DAYS', 14)),
        'maximum_campaign_seconds' => min(
            43_200,
            max(300, (int) env('RESILIENCE_MAX_CAMPAIGN_SECONDS', 14_400)),
        ),
    ],

    'scenarios' => [
        'application_node_loss' => [
            'fault_domain' => 'application',
            'maximum_recovery_seconds' => 180,
        ],
        'load_balancer_failover' => [
            'fault_domain' => 'edge',
            'maximum_recovery_seconds' => max(
                30,
                (int) env('LOAD_BALANCER_FAILOVER_RTO_SECONDS', 120),
            ),
        ],
        'queue_worker_restart' => [
            'fault_domain' => 'queue',
            'maximum_recovery_seconds' => 180,
        ],
        'cache_primary_failover' => [
            'fault_domain' => 'cache',
            'maximum_recovery_seconds' => 300,
        ],
        'database_writer_failover' => [
            'fault_domain' => 'database',
            'maximum_recovery_seconds' => max(
                60,
                (int) env('DB_FAILOVER_RTO_SECONDS', 120),
            ),
        ],
    ],

    'safety' => [
        'production_fault_injection_forbidden' => (bool) env(
            'RESILIENCE_PRODUCTION_INJECTION_FORBIDDEN',
            true,
        ),
        'external_orchestrator_required' => (bool) env(
            'RESILIENCE_EXTERNAL_ORCHESTRATOR_REQUIRED',
            true,
        ),
        'manual_approval_required' => (bool) env(
            'RESILIENCE_MANUAL_APPROVAL_REQUIRED',
            true,
        ),
        'change_reference_required' => (bool) env(
            'RESILIENCE_CHANGE_REFERENCE_REQUIRED',
            true,
        ),
        'synthetic_traffic_only' => (bool) env(
            'RESILIENCE_SYNTHETIC_TRAFFIC_ONLY',
            true,
        ),
        'provider_kill_switch_required' => (bool) env(
            'RESILIENCE_KILL_SWITCH_REQUIRED',
            true,
        ),
        'one_fault_at_a_time' => (bool) env(
            'RESILIENCE_ONE_FAULT_AT_A_TIME',
            true,
        ),
        'maximum_blast_radius_percent' => min(
            50,
            max(1, (int) env('RESILIENCE_MAX_BLAST_RADIUS_PERCENT', 50)),
        ),
        'minimum_healthy_instances' => max(
            1,
            (int) env('RESILIENCE_MINIMUM_HEALTHY_INSTANCES', 1),
        ),
        'maximum_scenario_seconds' => min(
            3_600,
            max(30, (int) env('RESILIENCE_MAX_SCENARIO_SECONDS', 900)),
        ),
        'maximum_error_rate_percent' => min(
            10.0,
            max(0.1, (float) env('RESILIENCE_ABORT_ERROR_RATE_PERCENT', 2.0)),
        ),
        'maximum_p95_ms' => min(
            30_000,
            max(250, (int) env('RESILIENCE_ABORT_P95_MS', 3_000)),
        ),
    ],

    'evidence' => [
        // The application receives public verification keys only. The
        // matching private keys remain in the external orchestrator/KMS.
        'verification_keys' => is_array($verificationKeys) ? $verificationKeys : [],
        // Historical keys remain available for verification, while only the
        // explicitly active IDs may authorize newly imported campaigns.
        'active_key_ids' => $activeVerificationKeyIds,
        'maximum_payload_bytes' => min(
            131_072,
            max(16_384, (int) env('RESILIENCE_EVIDENCE_MAX_BYTES', 131_072)),
        ),
        'maximum_envelope_bytes' => min(
            262_144,
            max(32_768, (int) env('RESILIENCE_EVIDENCE_MAX_ENVELOPE_BYTES', 196_608)),
        ),
        'maximum_clock_skew_seconds' => min(
            900,
            max(0, (int) env('RESILIENCE_EVIDENCE_CLOCK_SKEW_SECONDS', 300)),
        ),
        'heartbeat_key' => 'resilience-drill-campaign',
        'verification_heartbeat_key' => 'resilience-drill-ledger',
        'verification_warning_after_seconds' => max(
            86_400,
            (int) env('RESILIENCE_LEDGER_WARNING_SECONDS', 129_600),
        ),
        'verification_outage_after_seconds' => max(
            172_800,
            (int) env('RESILIENCE_LEDGER_OUTAGE_SECONDS', 259_200),
        ),
    ],

    'ledger' => [
        'active_key_id' => trim((string) env('RESILIENCE_LEDGER_ACTIVE_KEY_ID', '')),
        'signing_keys' => is_array($ledgerKeys) ? $ledgerKeys : [],
        'minimum_key_bytes' => 32,
    ],
];
