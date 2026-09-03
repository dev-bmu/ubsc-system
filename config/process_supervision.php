<?php

return [
    /*
    | Supervisor is the process authority for the current VPS deployment.
    | Production must point at the exact file loaded by supervisord; local
    | and test environments validate the bundled examples instead.
    */
    'enforce' => (bool) env(
        'PROCESS_SUPERVISION_ENFORCE',
        env('APP_ENV', 'production') === 'production',
    ),
    'active_config_path' => env('PROCESS_SUPERVISOR_CONFIG_PATH'),
    'templates' => [
        'database' => 'deploy/supervisor/ubsc-database.conf.example',
        'redis' => 'deploy/supervisor/ubsc-redis.conf.example',
    ],

    'group' => 'ubsc',
    'scheduler' => [
        'program' => 'ubsc-scheduler',
        'processes_per_node' => 1,
        'stop_wait_seconds' => 30,
    ],

    /*
    | One process program owns exactly one queue lane. This is deliberate:
    | a media spike, notification outage, or maintenance backlog cannot
    | consume the worker capacity reserved for payment recovery.
    */
    'workers' => [
        'critical' => [
            'program' => 'ubsc-critical',
            'queue_key' => 'critical',
            'connection_kind' => 'regular',
            'baseline_processes' => 2,
            'timeout' => 80,
            'job_timeout_config' => 'background_jobs.payment_recovery.timeout_seconds',
            'maximum_job_timeout' => 80,
            'stop_wait_seconds' => 120,
            'max_time' => 3_600,
            'max_jobs' => 1_000,
            'memory' => 256,
        ],
        'documents' => [
            'program' => 'ubsc-documents',
            'queue_key' => 'documents',
            'connection_kind' => 'regular',
            'baseline_processes' => 1,
            'timeout' => 80,
            'job_timeout_config' => 'invoice_pdf.prewarm.timeout_seconds',
            'maximum_job_timeout' => 80,
            'stop_wait_seconds' => 120,
            'max_time' => 3_600,
            'max_jobs' => 500,
            'memory' => 256,
        ],
        'notifications' => [
            'program' => 'ubsc-notifications',
            'queue_key' => 'notifications',
            'connection_kind' => 'regular',
            'baseline_processes' => 1,
            'timeout' => 80,
            'maximum_job_timeout' => 30,
            'stop_wait_seconds' => 120,
            'max_time' => 3_600,
            'max_jobs' => 1_000,
            'memory' => 256,
        ],
        'maintenance' => [
            'program' => 'ubsc-maintenance',
            'queue_key' => 'maintenance',
            'connection_kind' => 'regular',
            'baseline_processes' => 1,
            'timeout' => 80,
            'maximum_job_timeout' => 60,
            'stop_wait_seconds' => 120,
            'max_time' => 3_600,
            'max_jobs' => 500,
            'memory' => 256,
        ],
        'media_maintenance' => [
            'program' => 'ubsc-media-maintenance',
            'queue_key' => 'media_maintenance',
            'connection_kind' => 'regular',
            'baseline_processes' => 1,
            'timeout' => 80,
            'maximum_job_timeout' => 60,
            'stop_wait_seconds' => 120,
            'max_time' => 3_600,
            'max_jobs' => 250,
            'memory' => 256,
        ],
        'default' => [
            'program' => 'ubsc-default',
            'queue_key' => 'default',
            'connection_kind' => 'regular',
            'baseline_processes' => 1,
            'timeout' => 80,
            'maximum_job_timeout' => 30,
            'stop_wait_seconds' => 120,
            'max_time' => 3_600,
            'max_jobs' => 1_000,
            'memory' => 256,
        ],
        'media_image' => [
            'program' => 'ubsc-media-image',
            'queue_key' => 'media_image',
            'connection_kind' => 'media',
            'baseline_processes' => 1,
            'timeout' => 1_000,
            'maximum_job_timeout' => 1_000,
            'stop_wait_seconds' => 1_100,
            'max_time' => 3_600,
            'max_jobs' => 100,
            'memory' => 512,
        ],
        'media_video' => [
            'program' => 'ubsc-media-video',
            'queue_key' => 'media_video',
            'connection_kind' => 'media',
            'baseline_processes' => 1,
            'timeout' => 1_000,
            'maximum_job_timeout' => 1_000,
            'stop_wait_seconds' => 1_100,
            'max_time' => 3_600,
            'max_jobs' => 25,
            'memory' => 768,
        ],
    ],

    'safety' => [
        'minimum_start_retries' => 5,
        'maximum_start_seconds' => 30,
        'minimum_log_backups' => 2,
        'maximum_log_backups' => 20,
        'maximum_log_bytes' => 100 * 1024 * 1024,
        'maximum_schedule_lock_minutes' => 60,
        'maximum_artifact_bytes' => 1024 * 1024,
        // Heartbeats outside this tolerance indicate clock drift or a
        // malformed/replayed observation and must never certify a process as
        // healthy. Production nodes still require infrastructure-level NTP.
        'maximum_heartbeat_clock_skew_seconds' => min(300, max(
            1,
            (int) env('PROCESS_SUPERVISION_MAX_CLOCK_SKEW_SECONDS', 30),
        )),
    ],
];
