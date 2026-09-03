<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Data-integrity monitoring
    |--------------------------------------------------------------------------
    |
    | A scan is deliberately detached from HTTP requests. The scheduler-ready
    | command refreshes one compact cache snapshot; admin/health consumers only
    | read that snapshot and therefore never fan out into expensive domain
    | queries while rendering a page.
    |
    */
    'cache_store' => env('DATA_INTEGRITY_CACHE_STORE'),
    'cache_key' => env(
        'DATA_INTEGRITY_CACHE_KEY',
        'monitoring:data-integrity:snapshot:v1',
    ),
    'cache_retention_seconds' => (int) env(
        'DATA_INTEGRITY_CACHE_RETENTION_SECONDS',
        604800,
    ),
    'stale_after_seconds' => (int) env(
        'DATA_INTEGRITY_STALE_AFTER_SECONDS',
        600,
    ),
    'scan_lock_seconds' => (int) env(
        'DATA_INTEGRITY_SCAN_LOCK_SECONDS',
        180,
    ),
    'sample_limit' => (int) env('DATA_INTEGRITY_SAMPLE_LIMIT', 20),

    // Lifecycle detections tolerate normal scheduler jitter before surfacing.
    'reconciliation_grace_seconds' => (int) env(
        'DATA_INTEGRITY_RECONCILIATION_GRACE_SECONDS',
        300,
    ),
    'stale_payment_attempt_seconds' => (int) env(
        'DATA_INTEGRITY_STALE_PAYMENT_ATTEMPT_SECONDS',
        300,
    ),
    'stuck_payment_event_seconds' => (int) env(
        'DATA_INTEGRITY_STUCK_PAYMENT_EVENT_SECONDS',
        600,
    ),

    // Collision checks are operationally useful around the live calendar,
    // not across an unbounded archive. Aggregate/state checks remain all-time.
    'booking_collision_past_days' => (int) env(
        'DATA_INTEGRITY_BOOKING_COLLISION_PAST_DAYS',
        1,
    ),
    'booking_collision_future_days' => (int) env(
        'DATA_INTEGRITY_BOOKING_COLLISION_FUTURE_DAYS',
        180,
    ),
];
