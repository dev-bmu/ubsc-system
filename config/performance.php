<?php

$isTesting = (string) env('APP_ENV', 'production') === 'testing';

return [
    /*
    | Request telemetry is aggregated into bounded minute buckets. It stores
    | no URL, route parameter, query string, payload, user ID, or IP address.
    */
    'enabled' => (bool) env('PERFORMANCE_METRICS_ENABLED', ! $isTesting),
    'driver' => env('PERFORMANCE_METRICS_DRIVER', 'database'),
    'database_connection' => env('PERFORMANCE_METRICS_DB_CONNECTION'),
    'redis_connection' => env('PERFORMANCE_METRICS_REDIS_CONNECTION', 'cache'),
    'redis_prefix' => env('PERFORMANCE_METRICS_REDIS_PREFIX', 'performance:v1'),
    'window_minutes' => min(30, max(1, (int) env('PERFORMANCE_WINDOW_MINUTES', 5))),
    'retention_hours' => min(720, max(24, (int) env('PERFORMANCE_RETENTION_HOURS', 168))),
    'prune_batch_size' => min(25_000, max(100, (int) env('PERFORMANCE_PRUNE_BATCH_SIZE', 5_000))),
    'prune_max_batches' => min(20, max(1, (int) env('PERFORMANCE_PRUNE_MAX_BATCHES', 4))),
    'minimum_samples' => min(10_000, max(1, (int) env('PERFORMANCE_MINIMUM_SAMPLES', 20))),
    'maximum_duration_ms' => min(900_000, max(30_000, (int) env('PERFORMANCE_MAX_DURATION_MS', 300_000))),
    'latency_buckets_ms' => [25, 50, 100, 200, 300, 500, 800, 1_200, 2_000, 5_000, 10_000, 30_000, 300_000],
    'excluded_routes' => [
        'monitoring.readiness',
        'admin.settings.monitoring.index',
        'admin.settings.monitoring.snapshot',
    ],
    'excluded_jobs' => [
        App\Jobs\RecordQueueWorkerHeartbeat::class,
    ],

    'scopes' => [
        'public_read' => [
            'label' => 'Public reads',
            'p95_target_ms' => (int) env('PERFORMANCE_PUBLIC_READ_P95_MS', 300),
            'p99_target_ms' => (int) env('PERFORMANCE_PUBLIC_READ_P99_MS', 800),
            'tested_requests_per_second' => env('PERFORMANCE_PUBLIC_READ_TESTED_RPS'),
        ],
        'booking_checkout' => [
            'label' => 'Booking & checkout',
            'p95_target_ms' => (int) env('PERFORMANCE_BOOKING_P95_MS', 800),
            'p99_target_ms' => (int) env('PERFORMANCE_BOOKING_P99_MS', 1_500),
            'tested_requests_per_second' => env('PERFORMANCE_BOOKING_TESTED_RPS'),
        ],
        'admin' => [
            'label' => 'Admin operations',
            'p95_target_ms' => (int) env('PERFORMANCE_ADMIN_P95_MS', 500),
            'p99_target_ms' => (int) env('PERFORMANCE_ADMIN_P99_MS', 1_200),
            'tested_requests_per_second' => env('PERFORMANCE_ADMIN_TESTED_RPS'),
        ],
        'authentication' => [
            'label' => 'Authentication',
            'p95_target_ms' => (int) env('PERFORMANCE_AUTH_P95_MS', 1_200),
            'p99_target_ms' => (int) env('PERFORMANCE_AUTH_P99_MS', 2_000),
            'tested_requests_per_second' => env('PERFORMANCE_AUTH_TESTED_RPS'),
        ],
        'write' => [
            'label' => 'Other writes',
            'p95_target_ms' => (int) env('PERFORMANCE_WRITE_P95_MS', 800),
            'p99_target_ms' => (int) env('PERFORMANCE_WRITE_P99_MS', 1_500),
            'tested_requests_per_second' => env('PERFORMANCE_WRITE_TESTED_RPS'),
        ],
    ],

    'error_rate' => [
        'warning_percent' => max(0.1, (float) env('PERFORMANCE_ERROR_WARNING_PERCENT', 1)),
        'outage_percent' => max(0.5, (float) env('PERFORMANCE_ERROR_OUTAGE_PERCENT', 5)),
    ],

    'queue' => [
        'wait_warning_ms' => max(100, (int) env('PERFORMANCE_QUEUE_WAIT_WARNING_MS', 5_000)),
        'wait_outage_ms' => max(500, (int) env('PERFORMANCE_QUEUE_WAIT_OUTAGE_MS', 30_000)),
        'error_warning_percent' => max(0.1, (float) env('PERFORMANCE_QUEUE_ERROR_WARNING_PERCENT', 1)),
        'error_outage_percent' => max(0.5, (float) env('PERFORMANCE_QUEUE_ERROR_OUTAGE_PERCENT', 5)),
    ],

    'capacity' => [
        // Global capacity requires a representative mixed-workload test. A
        // public-read-only result belongs to its scope above, never here.
        'tested_requests_per_second' => env('PERFORMANCE_TESTED_RPS'),
        'warning_utilization_percent' => min(95, max(10, (int) env('PERFORMANCE_CAPACITY_WARNING_PERCENT', 70))),
        'outage_utilization_percent' => min(100, max(20, (int) env('PERFORMANCE_CAPACITY_OUTAGE_PERCENT', 90))),
    ],

    'database' => [
        'connection_warning_percent' => min(95, max(10, (int) env('PERFORMANCE_DB_CONNECTION_WARNING_PERCENT', 70))),
        'connection_outage_percent' => min(100, max(20, (int) env('PERFORMANCE_DB_CONNECTION_OUTAGE_PERCENT', 90))),
        'lock_wait_warning' => max(1, (int) env('PERFORMANCE_DB_LOCK_WAIT_WARNING', 1)),
        'lock_wait_outage' => max(2, (int) env('PERFORMANCE_DB_LOCK_WAIT_OUTAGE', 5)),
        'slow_query_warning_per_minute' => max(1, (int) env('PERFORMANCE_DB_SLOW_QUERY_WARNING', 1)),
        'slow_query_outage_per_minute' => max(2, (int) env('PERFORMANCE_DB_SLOW_QUERY_OUTAGE', 10)),
    ],
];
