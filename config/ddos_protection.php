<?php

$environment = strtolower((string) env('APP_ENV', 'production'));
$isProduction = $environment === 'production';
$isTesting = $environment === 'testing';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';

return [
    /*
    | DDoS resilience is a layered infrastructure and application contract.
    | These settings never claim that PHP can absorb a volumetric attack;
    | production additionally requires a managed edge and an isolated origin.
    */
    'enforce' => $isMultiNode
        && (bool) env('DDOS_PROTECTION_CONTRACT_ENFORCE', $isProduction),

    'application' => [
        'enabled' => (bool) env('APPLICATION_TRAFFIC_PROTECTION_ENABLED', ! $isTesting),
        'limiter_store' => env('CACHE_LIMITER_STORE', env('CACHE_STORE', 'database')),
        'resource_envelope' => [
            'enabled' => (bool) env('REQUEST_RESOURCE_ENVELOPE_ENABLED', ! $isTesting),
            'maximum_request_target_bytes' => min(16_384, max(1_024, (int) env(
                'REQUEST_MAX_TARGET_BYTES',
                4_096,
            ))),
            'maximum_query_bytes' => min(8_192, max(512, (int) env(
                'REQUEST_MAX_QUERY_BYTES',
                2_048,
            ))),
            'maximum_query_parameters' => min(500, max(20, (int) env(
                'REQUEST_MAX_QUERY_PARAMETERS',
                100,
            ))),
            'maximum_query_depth' => min(16, max(3, (int) env(
                'REQUEST_MAX_QUERY_DEPTH',
                8,
            ))),
            'maximum_header_count' => min(200, max(32, (int) env(
                'REQUEST_MAX_HEADER_COUNT',
                96,
            ))),
            'maximum_header_bytes' => min(65_536, max(8_192, (int) env(
                'REQUEST_MAX_HEADER_BYTES',
                32_768,
            ))),
            'maximum_cookie_bytes' => min(16_384, max(2_048, (int) env(
                'REQUEST_MAX_COOKIE_BYTES',
                8_192,
            ))),
            'default_body_bytes' => min(16_777_216, max(262_144, (int) env(
                'REQUEST_DEFAULT_BODY_BYTES',
                2_097_152,
            ))),
            'route_body_bytes' => [
                'profile.update' => 8_388_608,
                'admin.gallery.upload-sessions.chunks.store' => 8_388_608,
                // Direct gallery ingestion is image-only. Videos use the
                // resumable, integrity-checked 5 MB chunk path below.
                'admin.gallery.items.store' => 25_165_824,
                'admin.facilities.store' => 134_217_728,
                'admin.facilities.update' => 134_217_728,
                'admin.facilities.gallery.add' => 134_217_728,
                'admin.news.store' => 50_331_648,
                'admin.news.update' => 50_331_648,
                'admin.reels.store' => 67_108_864,
                'admin.reels.update' => 67_108_864,
                'monitoring.external-sli.ingest' => 16_384,
                'monitoring.log-receipts.ingest' => 32_768,
                'admin.*' => 16_777_216,
            ],
        ],
        'limits' => [
            // High enough for legitimate NAT/campus traffic; edge controls
            // remain authoritative for distributed and volumetric attacks.
            'web' => [
                'per_ip_per_second' => min(500, max(10, (int) env('TRAFFIC_WEB_IP_RPS', 40))),
                'per_ip_per_minute' => min(20_000, max(300, (int) env('TRAFFIC_WEB_IP_RPM', 1_200))),
                'per_network_per_minute' => min(100_000, max(2_000, (int) env(
                    'TRAFFIC_WEB_NETWORK_RPM',
                    12_000,
                ))),
                // Shared across every application node. This is the final
                // overload fuse, not a substitute for edge mitigation.
                'global_per_second' => min(10_000, max(100, (int) env(
                    'TRAFFIC_WEB_GLOBAL_RPS',
                    600,
                ))),
                'global_per_minute' => min(300_000, max(3_000, (int) env(
                    'TRAFFIC_WEB_GLOBAL_RPM',
                    24_000,
                ))),
            ],
            'registration' => [
                'per_ip_per_15_minutes' => min(50, max(2, (int) env('TRAFFIC_REGISTER_IP_15M', 5))),
                'per_network_per_hour' => min(1_000, max(20, (int) env('TRAFFIC_REGISTER_NETWORK_HOUR', 100))),
                'global_per_minute' => min(10_000, max(20, (int) env('TRAFFIC_REGISTER_GLOBAL_RPM', 300))),
            ],
            'review' => [
                'per_actor_per_hour' => min(100, max(2, (int) env('TRAFFIC_REVIEW_ACTOR_HOUR', 10))),
                'per_ip_per_hour' => min(1_000, max(10, (int) env('TRAFFIC_REVIEW_IP_HOUR', 60))),
            ],
            'oauth' => [
                'per_ip_per_minute' => min(1_000, max(10, (int) env('TRAFFIC_OAUTH_IP_RPM', 60))),
                'per_network_per_minute' => min(10_000, max(100, (int) env('TRAFFIC_OAUTH_NETWORK_RPM', 600))),
            ],
            'sitemap' => [
                'per_ip_per_minute' => min(1_000, max(5, (int) env('TRAFFIC_SITEMAP_IP_RPM', 30))),
                'global_per_minute' => min(20_000, max(100, (int) env('TRAFFIC_SITEMAP_GLOBAL_RPM', 1_000))),
            ],
            'analytics' => [
                'per_ip_per_minute' => min(5_000, max(30, (int) env('TRAFFIC_ANALYTICS_IP_RPM', 180))),
                'per_network_per_minute' => min(50_000, max(500, (int) env('TRAFFIC_ANALYTICS_NETWORK_RPM', 3_000))),
            ],
        ],
    ],

    'edge' => [
        'always_on' => (bool) env('DDOS_EDGE_ALWAYS_ON', false),
        'anycast_or_global_scrubbing' => (bool) env('DDOS_EDGE_GLOBAL_SCRUBBING', false),
        'automatic_l3_l4_mitigation' => (bool) env('DDOS_EDGE_L3_L4_AUTOMATIC', false),
        'automatic_l7_mitigation' => (bool) env('DDOS_EDGE_L7_AUTOMATIC', false),
        'managed_waf_rules' => (bool) env('DDOS_EDGE_MANAGED_WAF_RULES', false),
        'adaptive_rate_limiting' => (bool) env('DDOS_EDGE_ADAPTIVE_RATE_LIMITING', false),
        'bot_management' => (bool) env('DDOS_EDGE_BOT_MANAGEMENT', false),
        'static_asset_caching' => (bool) env('DDOS_EDGE_STATIC_ASSET_CACHE', false),
        'private_html_cache_bypass' => (bool) env('DDOS_EDGE_PRIVATE_HTML_BYPASS', false),
    ],

    'origin' => [
        'public_direct_access_disabled' => (bool) env('DDOS_ORIGIN_DIRECT_ACCESS_DISABLED', false),
        'public_dns_disclosure_prevented' => (bool) env('DDOS_ORIGIN_IP_DISCLOSURE_PREVENTED', false),
        'authentication_mode' => strtolower(trim((string) env('DDOS_ORIGIN_AUTHENTICATION_MODE', ''))),
        'allowed_authentication_modes' => ['private_network', 'mtls', 'provider_authenticated_pull'],
    ],

    'client_identity' => [
        'provider_header' => strtolower(trim((string) env('DDOS_VERIFIED_CLIENT_IP_HEADER', ''))),
        'edge_strips_spoofed_headers' => (bool) env('DDOS_EDGE_STRIPS_SPOOFED_IP_HEADERS', false),
        'load_balancer_replaces_forwarded_for' => (bool) env('DDOS_LB_REPLACES_FORWARDED_FOR', false),
    ],

    'telemetry' => [
        'security_event_stream' => (bool) env('DDOS_SECURITY_EVENT_STREAM_ENABLED', false),
        'attack_alerting' => (bool) env('DDOS_ATTACK_ALERTING_ENABLED', false),
        'origin_saturation_alerting' => (bool) env('DDOS_ORIGIN_SATURATION_ALERTING_ENABLED', false),
        'cost_anomaly_alerting' => (bool) env('DDOS_COST_ANOMALY_ALERTING_ENABLED', false),
    ],

    'operations' => [
        'emergency_mode' => (bool) env('DDOS_EMERGENCY_MODE_AVAILABLE', false),
        'provider_escalation' => (bool) env('DDOS_PROVIDER_ESCALATION_CONFIGURED', false),
        'runbook' => trim((string) env('DDOS_RESPONSE_RUNBOOK', '')),
        'maximum_provider_response_seconds' => min(3_600, max(0, (int) env(
            'DDOS_PROVIDER_RESPONSE_SLA_SECONDS',
            0,
        ))),
        'exercise_interval_days' => min(365, max(0, (int) env(
            'DDOS_EXERCISE_INTERVAL_DAYS',
            0,
        ))),
    ],

    'verification' => [
        'mode' => strtolower(trim((string) env('DDOS_PROVIDER_VERIFICATION_MODE', ''))),
        'provider_hook' => trim((string) env('DDOS_PROVIDER_VERIFY_HOOK', '')),
        // Non-secret SHA-256 of the exact provider zone/site identifier. It
        // binds live provider evidence to this production property without
        // exposing the raw provider identifier in process arguments.
        'provider_zone_fingerprint' => strtolower(trim((string) env(
            'DDOS_PROVIDER_ZONE_FINGERPRINT',
            '',
        ))),
        'edge_response_header' => strtolower(trim((string) env('DDOS_EDGE_RESPONSE_HEADER', ''))),
        'command_timeout_seconds' => min(120, max(5, (int) env(
            'DDOS_PROVIDER_VERIFY_TIMEOUT_SECONDS',
            30,
        ))),
    ],
];
