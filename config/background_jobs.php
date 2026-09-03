<?php

$connection = (string) env('BACKGROUND_JOB_CONNECTION', env('QUEUE_CONNECTION', 'database'));
$mediaConnection = match ($connection) {
    'database' => 'database-long',
    'redis' => 'redis-long',
    default => $connection,
};

return [
    /*
    | Background work is separated by operational priority. All names are
    | intentionally low-cardinality so workers, alerts, and dashboards can
    | share one stable contract across database and Redis queue drivers.
    */
    'connection' => $connection,
    'media_connection' => env('BACKGROUND_MEDIA_CONNECTION', $mediaConnection),

    'queues' => [
        'critical' => env('BACKGROUND_QUEUE_CRITICAL', 'critical'),
        'documents' => env('BACKGROUND_QUEUE_DOCUMENTS', 'documents'),
        'notifications' => env('BACKGROUND_QUEUE_NOTIFICATIONS', 'notifications'),
        'media_image' => env('BACKGROUND_QUEUE_MEDIA_IMAGE', 'media-image'),
        'media_video' => env('BACKGROUND_QUEUE_MEDIA_VIDEO', 'media-video'),
        'media_maintenance' => env('BACKGROUND_QUEUE_MEDIA_MAINTENANCE', 'media-maintenance'),
        'maintenance' => env('BACKGROUND_QUEUE_MAINTENANCE', 'maintenance'),
        'default' => env('BACKGROUND_QUEUE_DEFAULT', 'default'),
    ],

    'payment_recovery' => [
        'batch_size' => min(1_000, max(1, (int) env('PAYMENT_RECOVERY_JOB_BATCH_SIZE', 100))),
        'timeout_seconds' => min(80, max(15, (int) env('PAYMENT_RECOVERY_JOB_TIMEOUT_SECONDS', 55))),
        'unique_seconds' => min(600, max(60, (int) env('PAYMENT_RECOVERY_JOB_UNIQUE_SECONDS', 90))),
    ],

    'worker_capacity' => [
        // The application only publishes a bounded recommendation. An
        // external process manager/orchestrator remains the scaling authority.
        'automation_enabled' => (bool) env('BACKGROUND_WORKER_AUTOMATION_ENABLED', false),
        'target_utilization_percent' => min(90, max(25, (int) env('BACKGROUND_WORKER_TARGET_UTILIZATION', 70))),
        'headroom_percent' => min(200, max(0, (int) env('BACKGROUND_WORKER_HEADROOM_PERCENT', 30))),
        'backlog_catch_up_seconds' => min(3_600, max(30, (int) env('BACKGROUND_WORKER_CATCH_UP_SECONDS', 300))),
        'minimum' => [
            'critical' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MIN_CRITICAL', 2))),
            'documents' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_DOCUMENTS', 1))),
            'notifications' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_NOTIFICATIONS', 1))),
            'media_image' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_MEDIA_IMAGE', 1))),
            'media_video' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_MEDIA_VIDEO', 1))),
            'media_maintenance' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_MEDIA_MAINTENANCE', 1))),
            'maintenance' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_MAINTENANCE', 1))),
            'default' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_DEFAULT', 1))),
            'primary' => min(1_000, max(0, (int) env('BACKGROUND_WORKERS_MIN_DEFAULT', 1))),
        ],
        'maximum' => [
            'critical' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_CRITICAL', 12))),
            'documents' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_DOCUMENTS', 4))),
            'notifications' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_NOTIFICATIONS', 8))),
            'media_image' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_MEDIA_IMAGE', 3))),
            'media_video' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_MEDIA_VIDEO', 2))),
            'media_maintenance' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_MEDIA_MAINTENANCE', 2))),
            'maintenance' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_MAINTENANCE', 4))),
            'default' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_DEFAULT', 8))),
            'primary' => min(1_000, max(1, (int) env('BACKGROUND_WORKERS_MAX_DEFAULT', 8))),
        ],
    ],

    'monitoring' => [
        'queues' => [
            'critical',
            'documents',
            'notifications',
            'media_image',
            'media_video',
            'media_maintenance',
            'maintenance',
            'default',
        ],
        'sample_limit' => min(5_000, max(10, (int) env('BACKGROUND_QUEUE_SAMPLE_LIMIT', 1_000))),
        'warning_depth' => max(1, (int) env('BACKGROUND_QUEUE_WARNING_DEPTH', 50)),
        'outage_depth' => max(2, (int) env('BACKGROUND_QUEUE_OUTAGE_DEPTH', 250)),
        'warning_age_seconds' => max(30, (int) env('BACKGROUND_QUEUE_WARNING_SECONDS', 120)),
        'outage_age_seconds' => max(60, (int) env('BACKGROUND_QUEUE_OUTAGE_SECONDS', 600)),
    ],
];
