<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';

return [
    /*
    | Production must be released through an immutable, health-gated traffic
    | switch. This contract records the infrastructure promises that cannot
    | be inferred safely from a PHP process alone; live scripts verify the
    | observable parts before a node is returned to the load balancer.
    */
    'enforce' => $isMultiNode
        && (bool) env('DEPLOYMENT_CONTRACT_ENFORCE', $isProduction),
    'strategy' => strtolower(trim((string) env(
        'DEPLOYMENT_STRATEGY',
        $isProduction ? '' : 'local',
    ))),

    'orchestrator' => [
        'provider' => strtolower(trim((string) env('DEPLOYMENT_ORCHESTRATOR_PROVIDER', ''))),
        'immutable_releases' => (bool) env('DEPLOYMENT_IMMUTABLE_RELEASES', false),
        'atomic_traffic_switch' => (bool) env('DEPLOYMENT_ATOMIC_TRAFFIC_SWITCH', false),
        'health_gated' => (bool) env('DEPLOYMENT_HEALTH_GATED', false),
        'connection_draining' => (bool) env('DEPLOYMENT_CONNECTION_DRAINING', false),
        'automatic_application_rollback' => (bool) env('DEPLOYMENT_AUTOMATIC_APP_ROLLBACK', false),
        'maximum_unavailable' => max(0, (int) env('DEPLOYMENT_MAX_UNAVAILABLE', 0)),
        'minimum_healthy_instances' => max(1, (int) env('DEPLOYMENT_MIN_HEALTHY_INSTANCES', 1)),
        'retained_releases' => max(1, (int) env('DEPLOYMENT_RETAINED_RELEASES', 3)),
    ],

    'schema' => [
        'expand_contract_required' => (bool) env('DEPLOYMENT_EXPAND_CONTRACT_REQUIRED', false),
        'backward_compatible_releases' => max(0, (int) env(
            'DEPLOYMENT_SCHEMA_BACKWARD_COMPATIBLE_RELEASES',
            0,
        )),
        // Database rollback is deliberately manual and restore-led. Blindly
        // reversing a migration after newer code has written data is unsafe.
        'automatic_database_rollback' => (bool) env('DEPLOYMENT_AUTOMATIC_DB_ROLLBACK', false),
    ],

    'edge' => [
        'provider' => strtolower(trim((string) env('EDGE_PROVIDER', ''))),
        'managed_dns' => (bool) env('EDGE_MANAGED_DNS', false),
        'cdn_enabled' => (bool) env('EDGE_CDN_ENABLED', false),
        'waf_enabled' => (bool) env('EDGE_WAF_ENABLED', false),
        'ddos_protection' => (bool) env('EDGE_DDOS_PROTECTION', false),
        'tls_termination' => (bool) env('EDGE_TLS_TERMINATION', false),
        'origin_tls' => (bool) env('EDGE_ORIGIN_TLS', false),
        'origin_access_restricted' => (bool) env('EDGE_ORIGIN_ACCESS_RESTRICTED', false),
        'certificate_auto_renewal' => (bool) env('EDGE_CERTIFICATE_AUTO_RENEWAL', false),
        'minimum_tls_version' => trim((string) env('EDGE_MINIMUM_TLS_VERSION', '')),
        'health_path' => trim((string) env('EDGE_HEALTH_PATH', '/health/ready')),
    ],

    /*
    | The bundled atomic-node rollout is a provider-neutral fallback. A
    | managed container/orchestration platform may implement the same contract
    | without using these paths, but the values remain useful as an explicit
    | operational hand-off and are syntax-validated before release.
    */
    'runtime' => [
        'application_root' => trim((string) env('DEPLOYMENT_APP_ROOT', '/srv/ubsc')),
        'releases_root' => trim((string) env('DEPLOYMENT_RELEASES_ROOT', '/srv/ubsc/releases')),
        'current_link' => trim((string) env('DEPLOYMENT_CURRENT_LINK', '/srv/ubsc/current')),
        'local_readiness_url' => trim((string) env(
            'DEPLOYMENT_LOCAL_READINESS_URL',
            'http://127.0.0.1:8080/health/ready',
        )),
        'lock_timeout_seconds' => min(7_200, max(60, (int) env(
            'DEPLOYMENT_LOCK_TIMEOUT_SECONDS',
            1_800,
        ))),
        'connection_drain_seconds' => min(300, max(5, (int) env(
            'DEPLOYMENT_CONNECTION_DRAIN_SECONDS',
            30,
        ))),
        'command_timeout_seconds' => min(3_600, max(60, (int) env(
            'DEPLOYMENT_COMMAND_TIMEOUT_SECONDS',
            900,
        ))),
    ],
];
