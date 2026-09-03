<?php

$alertConnectTimeout = min(10, max(1, (int) env(
    'MONITORING_ALERT_CONNECT_TIMEOUT_SECONDS',
    2,
)));
$alertTimeout = min(30, max($alertConnectTimeout + 1, (int) env(
    'MONITORING_ALERT_TIMEOUT_SECONDS',
    5,
)));

return [
    /*
    |--------------------------------------------------------------------------
    | Internal monitoring cockpit
    |--------------------------------------------------------------------------
    |
    | This configuration intentionally provides a small, dependency-free
    | operational foundation. External uptime, APM, RUM, and security-event
    | providers may be connected later without changing the cockpit contract.
    |
    */
    'enabled' => env('MONITORING_ENABLED', true),
    'release' => env('APP_RELEASE'),
    'snapshot_cache_seconds' => max(5, (int) env('MONITORING_SNAPSHOT_CACHE_SECONDS', 15)),
    'snapshot_stale_after_seconds' => max(60, (int) env('MONITORING_SNAPSHOT_STALE_SECONDS', 180)),

    'readiness' => [
        // Required failures remove this node from the load balancer. Advisory
        // failures make the node degraded but keep core booking traffic alive.
        'required_checks' => array_values(array_unique(array_filter(array_map(
            static fn (string $check): string => strtolower(trim($check)),
            explode(',', (string) env('MONITORING_READINESS_REQUIRED_CHECKS', 'database,cache')),
        )))),
        'advisory_checks' => array_values(array_unique(array_filter(array_map(
            static fn (string $check): string => strtolower(trim($check)),
            explode(',', (string) env('MONITORING_READINESS_ADVISORY_CHECKS', '')),
        )))),
        // Deep checks run from deployment/operations commands, never on every
        // load-balancer poll. This avoids turning queue/S3 telemetry into a
        // new source of latency, cost, or cascading failure.
        'deep_checks' => array_values(array_unique(array_filter(array_map(
            static fn (string $check): string => strtolower(trim($check)),
            explode(',', (string) env('MONITORING_READINESS_DEEP_CHECKS', 'queues')),
        )))),
        'cache_write_probe' => (bool) env('MONITORING_READINESS_CACHE_WRITE_PROBE', true),
        // Public load-balancer checks fail fast. The load balancer already
        // supplies repeated observations, so retrying a dead dependency in a
        // single PHP request only delays node removal and consumes workers.
        'attempts' => min(2, max(1, (int) env('MONITORING_READINESS_ATTEMPTS', 1))),
        'total_budget_ms' => min(5_000, max(500, (int) env(
            'MONITORING_READINESS_TOTAL_BUDGET_MS',
            4_000,
        ))),
        // Storage is optional and should only be enabled after a sentinel has
        // been provisioned on the shared object disk.
        'storage_disk' => env('MONITORING_READINESS_STORAGE_DISK'),
        'storage_sentinel' => env('MONITORING_READINESS_STORAGE_SENTINEL'),
    ],

    'external' => [
        // This flag describes an independently running synthetic monitor. It
        // must never be enabled merely because the internal route exists.
        'enabled' => (bool) env('EXTERNAL_MONITORING_ENABLED', false),
        'provider' => env('EXTERNAL_MONITORING_PROVIDER', 'github-actions'),
        'check_url' => env('EXTERNAL_MONITORING_URL'),
        'interval_seconds' => max(60, (int) env('EXTERNAL_MONITORING_INTERVAL_SECONDS', 300)),
        // These endpoints exercise three different failure boundaries: PHP
        // liveness, dependency readiness, and a real public document render.
        // Signed samples must contain every path exactly once.
        'required_paths' => ['/up', '/health/ready', '/'],
        'maximum_healthy_latency_ms' => min(30_000, max(250, (int) env(
            'EXTERNAL_MONITORING_MAX_HEALTHY_LATENCY_MS',
            5_000,
        ))),
    ],

    'scheduler' => [
        'heartbeat_key' => 'scheduler',
        'expected_interval_seconds' => 60,
        'warning_after_seconds' => max(60, (int) env('MONITORING_SCHEDULER_WARNING_SECONDS', 150)),
        'outage_after_seconds' => max(120, (int) env('MONITORING_SCHEDULER_OUTAGE_SECONDS', 300)),
    ],

    'queue' => [
        'connection' => env('MONITORING_QUEUE_CONNECTION', env('QUEUE_CONNECTION', 'database')),
        'queue' => env('MONITORING_QUEUE_NAME', env('DB_QUEUE', 'default')),
        'warning_after_seconds' => max(60, (int) env('MONITORING_QUEUE_WARNING_SECONDS', 180)),
        'outage_after_seconds' => max(120, (int) env('MONITORING_QUEUE_OUTAGE_SECONDS', 600)),
        'warning_depth' => max(1, (int) env('MONITORING_QUEUE_WARNING_DEPTH', 100)),
        'outage_depth' => max(2, (int) env('MONITORING_QUEUE_OUTAGE_DEPTH', 500)),
    ],

    'limits' => [
        'queue_sample_size' => min(5_000, max(10, (int) env('MONITORING_QUEUE_SAMPLE_SIZE', 1_000))),
        'failed_job_sample_size' => min(2_000, max(10, (int) env('MONITORING_FAILED_JOB_SAMPLE_SIZE', 500))),
        'usage_sample_size' => min(5_000, max(10, (int) env('MONITORING_USAGE_SAMPLE_SIZE', 1_000))),
        'security_sample_size' => min(1_000, max(10, (int) env('MONITORING_SECURITY_SAMPLE_SIZE', 250))),
        'incident_limit' => min(100, max(5, (int) env('MONITORING_INCIDENT_LIMIT', 25))),
    ],

    'usage_window_minutes' => max(60, (int) env('MONITORING_USAGE_WINDOW_MINUTES', 1_440)),

    'history' => [
        // Only hourly aggregates are retained; raw requests and transaction
        // records are never copied into the monitoring history.
        'dashboard_hours' => min(168, max(12, (int) env('MONITORING_DASHBOARD_HISTORY_HOURS', 24))),
        'retention_days' => max(7, (int) env('MONITORING_HISTORY_RETENTION_DAYS', 90)),
    ],

    'alerting' => [
        'channels' => array_values(array_filter(array_map(
            static fn (string $channel): string => strtolower(trim($channel)),
            explode(',', (string) env('MONITORING_ALERT_CHANNELS', 'log')),
        ))),
        'log_channel' => env('MONITORING_ALERT_LOG_CHANNEL'),
        'batch_size' => min(500, max(1, (int) env('MONITORING_ALERT_BATCH_SIZE', 50))),
        'max_attempts' => min(20, max(1, (int) env('MONITORING_ALERT_MAX_ATTEMPTS', 8))),
        'retry_base_seconds' => max(5, (int) env('MONITORING_ALERT_RETRY_BASE_SECONDS', 30)),
        'processing_stale_seconds' => max(
            $alertTimeout + 30,
            (int) env('MONITORING_ALERT_PROCESSING_STALE_SECONDS', 180),
        ),
        'delivered_retention_days' => max(7, (int) env('MONITORING_ALERT_DELIVERED_RETENTION_DAYS', 90)),
        'dead_retention_days' => max(30, (int) env('MONITORING_ALERT_DEAD_RETENTION_DAYS', 365)),
        'webhook' => [
            'url' => env('MONITORING_ALERT_WEBHOOK_URL'),
            'secret' => env('MONITORING_ALERT_WEBHOOK_SECRET'),
            'connect_timeout_seconds' => $alertConnectTimeout,
            'timeout_seconds' => $alertTimeout,
        ],
    ],

    'backup' => [
        // A backup process outside Laravel must record this heartbeat only
        // after its archive and checksum have both been verified.
        'enabled' => (bool) env('MONITORING_BACKUP_HEARTBEAT_ENABLED', false),
        'heartbeat_key' => 'verified-backup',
        'warning_after_seconds' => max(3_600, (int) env('MONITORING_BACKUP_WARNING_SECONDS', 108_000)),
        'outage_after_seconds' => max(7_200, (int) env('MONITORING_BACKUP_OUTAGE_SECONDS', 172_800)),
    ],

    /*
     * Internal control-plane reliability has a conservative default target so
     * error-budget mechanics can operate immediately. Public availability,
     * booking success, and request latency remain unconfigured until their
     * independent production telemetry sources are connected.
     */
    'slos' => [
        'window_days' => max(7, (int) env('MONITORING_SLO_WINDOW_DAYS', 28)),
        'minimum_samples' => max(10, (int) env('MONITORING_SLO_MINIMUM_SAMPLES', 60)),
        'definitions' => [
            [
                'key' => 'internal_health',
                'name' => 'Keandalan kontrol internal',
                'indicator' => 'Rasio snapshot internal yang sepenuhnya operational; degraded dan blind spot mengonsumsi error budget.',
                'source' => 'internal_rollups',
                'target_percent' => env('MONITORING_SLO_INTERNAL_TARGET', 99.9),
            ],
            [
                'key' => 'public_availability',
                'name' => 'Ketersediaan layanan publik',
                'indicator' => 'Rasio synthetic checks yang berhasil dari luar infrastruktur aplikasi.',
                'source' => 'external_synthetic',
                'metric_key' => 'sli.public_availability',
                'target_percent' => env('MONITORING_SLO_AVAILABILITY_TARGET'),
            ],
            [
                'key' => 'booking_success',
                'name' => 'Keberhasilan alur reservasi',
                'indicator' => 'Rasio request booking dan checkout yang selesai tanpa respons kegagalan sistem 5xx.',
                'source' => 'request_sli_rollups',
                'metric_key' => 'sli.booking_success',
                'target_percent' => env('MONITORING_SLO_BOOKING_TARGET'),
            ],
            [
                'key' => 'request_latency',
                'name' => 'Latensi permintaan pengguna',
                'indicator' => 'Rasio request publik dan reservasi yang selesai di bawah ambang latensi yang disepakati.',
                'source' => 'request_sli_rollups',
                'metric_key' => 'sli.request_latency',
                'target_percent' => env('MONITORING_SLO_LATENCY_TARGET'),
            ],
        ],
    ],
];
