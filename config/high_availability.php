<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';

return [
    /*
    | High availability is an infrastructure capability with an application
    | contract. The flags below are declarations checked at boot and during
    | deployment; they do not pretend to provision a cloud resource.
    */
    'enforce' => $isMultiNode
        && (bool) env('HIGH_AVAILABILITY_CONTRACT_ENFORCE', $isProduction),

    'database' => [
        'managed_service' => (bool) env('DB_MANAGED_SERVICE', false),
        'ha_enabled' => (bool) env('DB_HA_ENABLED', false),
        'automatic_failover' => (bool) env('DB_AUTOMATIC_FAILOVER', false),
        'endpoint_kind' => strtolower(trim((string) env('DB_FAILOVER_ENDPOINT_KIND', ''))),
        'minimum_availability_zones' => max(1, (int) env('DB_HA_MIN_AZS', 1)),
        'failover_rto_seconds' => max(0, (int) env('DB_FAILOVER_RTO_SECONDS', 0)),
        'tls_required' => (bool) env('DB_TLS_REQUIRED', false),
        'tls_verify_peer' => (bool) env('DB_TLS_VERIFY_PEER', false),
        'tls_ca' => env('MYSQL_ATTR_SSL_CA'),
        'allowed_endpoint_kinds' => ['cluster', 'proxy'],
        'maximum_failover_rto_seconds' => 120,
    ],

    'load_balancer' => [
        'enabled' => (bool) env('LOAD_BALANCER_ENABLED', false),
        'managed_service' => (bool) env('LOAD_BALANCER_MANAGED_SERVICE', false),
        'ha_enabled' => (bool) env('LOAD_BALANCER_HA_ENABLED', false),
        'automatic_failover' => (bool) env('LOAD_BALANCER_AUTOMATIC_FAILOVER', false),
        'failover_rto_seconds' => max(0, (int) env('LOAD_BALANCER_FAILOVER_RTO_SECONDS', 0)),
        'maximum_failover_rto_seconds' => 120,
        'minimum_failure_domains' => max(1, (int) env(
            'LOAD_BALANCER_MIN_FAILURE_DOMAINS',
            1,
        )),
        'health_path' => '/'.ltrim((string) env('LOAD_BALANCER_HEALTH_PATH', '/health/ready'), '/'),
        'instance_id' => trim((string) env('PRODUCTION_INSTANCE_ID', '')),
        'expose_instance_header' => (bool) env('LOAD_BALANCER_EXPOSE_INSTANCE_HEADER', true),
        'expose_release_header' => (bool) env('LOAD_BALANCER_EXPOSE_RELEASE_HEADER', true),
        'forwarded_for_mode' => strtolower(trim((string) env(
            'LOAD_BALANCER_FORWARDED_FOR_MODE',
            '',
        ))),
        'readiness_edge_protected' => (bool) env(
            'LOAD_BALANCER_READINESS_EDGE_PROTECTED',
            false,
        ),
        'sticky_sessions' => (bool) env('LOAD_BALANCER_STICKY_SESSIONS', false),
        'health_interval_seconds' => max(1, (int) env('LOAD_BALANCER_HEALTH_INTERVAL_SECONDS', 5)),
        'health_timeout_seconds' => max(1, (int) env('LOAD_BALANCER_HEALTH_TIMEOUT_SECONDS', 5)),
        'connection_drain_seconds' => max(0, (int) env('LOAD_BALANCER_CONNECTION_DRAIN_SECONDS', 30)),
    ],

    'redis' => [
        'managed_service' => (bool) env('REDIS_MANAGED_SERVICE', false),
        'ha_enabled' => (bool) env('REDIS_HA_ENABLED', false),
        'automatic_failover' => (bool) env('REDIS_AUTOMATIC_FAILOVER', false),
        // A managed replicated primary endpoint gives Laravel one stable
        // writer address while the provider promotes a healthy replica.
        'topology' => strtolower(trim((string) env('REDIS_HA_TOPOLOGY', ''))),
        'minimum_replicas' => max(0, (int) env('REDIS_HA_MIN_REPLICAS', 0)),
        'tls_required' => (bool) env('REDIS_TLS_REQUIRED', false),
        'tls_verify_peer' => (bool) env('REDIS_TLS_VERIFY_PEER', false),
        'auth_required' => (bool) env('REDIS_AUTH_REQUIRED', false),
        'dedicated_workload_endpoints' => (bool) env('REDIS_REQUIRE_DEDICATED_ENDPOINTS', false),
        'session_maxmemory_policy' => strtolower(trim((string) env('REDIS_SESSION_MAXMEMORY_POLICY', ''))),
        'cache_maxmemory_policy' => strtolower(trim((string) env('REDIS_CACHE_MAXMEMORY_POLICY', ''))),
        'traffic_maxmemory_policy' => strtolower(trim((string) env('REDIS_TRAFFIC_MAXMEMORY_POLICY', ''))),
        'queue_maxmemory_policy' => strtolower(trim((string) env('REDIS_QUEUE_MAXMEMORY_POLICY', ''))),
        'coordination_maxmemory_policy' => strtolower(trim((string) env('REDIS_COORDINATION_MAXMEMORY_POLICY', ''))),
        'queue_persistence' => strtolower(trim((string) env('REDIS_QUEUE_PERSISTENCE', ''))),
        'allowed_cache_policies' => ['allkeys-lru', 'allkeys-lfu'],
        'allowed_queue_persistence' => ['provider_managed', 'aof_everysec'],
    ],
];
