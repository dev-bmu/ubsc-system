<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Durable service-data audit ledger
    |--------------------------------------------------------------------------
    |
    | Production should set a dedicated key instead of relying on APP_KEY.
    | Keep every retired key version available when rotating so historical
    | records remain verifiable.
    |
    */
    'current_key_version' => (int) env('DATA_AUDIT_CURRENT_KEY_VERSION', 1),

    'integrity_keys' => [
        1 => env('DATA_AUDIT_INTEGRITY_KEY_V1', env('APP_KEY')),
    ],

    'metadata_max_bytes' => (int) env('DATA_AUDIT_METADATA_MAX_BYTES', 8192),
    'baseline_chunk_size' => (int) env('DATA_AUDIT_BASELINE_CHUNK_SIZE', 500),
    'verification_batch_size' => (int) env('DATA_AUDIT_VERIFICATION_BATCH_SIZE', 1000),
    'verification_lock_seconds' => (int) env('DATA_AUDIT_VERIFICATION_LOCK_SECONDS', 300),
    'verification_warning_after_seconds' => (int) env('DATA_AUDIT_VERIFICATION_WARNING_AFTER_SECONDS', 900),
    'verification_outage_after_seconds' => (int) env('DATA_AUDIT_VERIFICATION_OUTAGE_AFTER_SECONDS', 3600),
];
