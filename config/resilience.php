<?php

return [
    'database' => [
        'connect_timeout_seconds' => min(30, max(1, (int) env(
            'DB_CONNECT_TIMEOUT_SECONDS',
            5,
        ))),
        'transaction_attempts' => min(5, max(1, (int) env(
            'DB_TRANSACTION_ATTEMPTS',
            3,
        ))),
        'lock_wait_timeout_seconds' => min(15, max(2, (int) env(
            'DB_LOCK_WAIT_TIMEOUT_SECONDS',
            5,
        ))),
    ],

    'redis' => [
        'connect_timeout_seconds' => min(30, max(0.1, (float) env(
            'REDIS_CONNECT_TIMEOUT_SECONDS',
            2,
        ))),
        'read_timeout_seconds' => min(30, max(0.1, (float) env(
            'REDIS_READ_TIMEOUT_SECONDS',
            2,
        ))),
    ],

    /*
    | Retry is deliberately conservative. Application writes are never
    | blindly repeated here; their domain services own transactions and
    | durable idempotency. This policy is for explicit read-only probes and
    | harmless ephemeral probes and similarly repeatable dependency calls.
    */
    'safe_retry' => [
        'attempts' => min(3, max(1, (int) env('SAFE_RETRY_ATTEMPTS', 2))),
        'base_delay_ms' => min(250, max(0, (int) env('SAFE_RETRY_BASE_DELAY_MS', 25))),
        'maximum_delay_ms' => min(1_000, max(0, (int) env('SAFE_RETRY_MAX_DELAY_MS', 100))),
        'jitter_ms' => min(100, max(0, (int) env('SAFE_RETRY_JITTER_MS', 15))),
    ],

    'idempotency' => [
        'header' => 'Idempotency-Key',
        'response_header' => 'Idempotency-Key',
        'replay_header' => 'Idempotent-Replay',
    ],
];
