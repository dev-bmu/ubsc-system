<?php

$isProduction = (string) env('APP_ENV', 'production') === 'production';

return [
    /*
    | Invoice PDFs are immutable, private render artifacts. Transaction and
    | service snapshots remain the source of truth; this layer exists to keep
    | expensive document rendering out of repeated HTTP requests.
    */
    'disk' => env('INVOICE_PDF_DISK', 'invoice-pdf'),
    'archive_disk' => env('INVOICE_PDF_ARCHIVE_DISK'),
    'prefix' => trim((string) env('INVOICE_PDF_PREFIX', 'invoice-pdf'), '/'),
    'template_version' => (string) env('INVOICE_PDF_TEMPLATE_VERSION', '2026-08-18.3'),

    'prewarm' => [
        'enabled' => (bool) env('INVOICE_PDF_PREWARM_ENABLED', $isProduction),
        'connection' => env('INVOICE_PDF_QUEUE_CONNECTION'),
        'queue' => (string) env('INVOICE_PDF_QUEUE', 'documents'),
        'timeout_seconds' => min(300, max(15, (int) env('INVOICE_PDF_JOB_TIMEOUT_SECONDS', 60))),
        'visibility_timeout_seconds' => min(
            3_600,
            max(30, (int) env('INVOICE_PDF_QUEUE_VISIBILITY_TIMEOUT_SECONDS', 90)),
        ),
    ],

    // Production serves only prepared artifacts. Local/testing may render one
    // guarded cache miss synchronously so development does not require a worker.
    'allow_synchronous_fallback' => (bool) env(
        'INVOICE_PDF_ALLOW_SYNCHRONOUS_FALLBACK',
        ! $isProduction,
    ),

    'lock' => [
        'store' => env('INVOICE_PDF_LOCK_STORE', env('CACHE_STORE', 'database')),
        'seconds' => max(30, (int) env('INVOICE_PDF_LOCK_SECONDS', 75)),
        'wait_seconds' => max(1, (int) env('INVOICE_PDF_LOCK_WAIT_SECONDS', 10)),
    ],

    'bounds' => [
        // Public checkout currently allows eight items. This larger hard stop
        // protects the renderer from corrupt or manually inserted payloads.
        'max_document_items' => max(8, (int) env('INVOICE_PDF_MAX_ITEMS', 32)),
        'min_output_bytes' => max(256, (int) env('INVOICE_PDF_MIN_BYTES', 1_024)),
        'max_output_bytes' => max(1_048_576, (int) env('INVOICE_PDF_MAX_BYTES', 8_388_608)),
    ],

    'lifecycle' => [
        'hot_retention_days' => max(1, (int) env('INVOICE_PDF_HOT_RETENTION_DAYS', 90)),
        'verification_hours' => max(1, (int) env('INVOICE_PDF_VERIFICATION_HOURS', 168)),
        'prune_batch' => min(2_000, max(1, (int) env('INVOICE_PDF_PRUNE_BATCH', 250))),
        'partial_retention_days' => max(1, (int) env('INVOICE_PDF_PARTIAL_RETENTION_DAYS', 2)),
        'partial_partition_batch' => min(90, max(1, (int) env('INVOICE_PDF_PARTIAL_PARTITION_BATCH', 14))),
    ],

    'pending' => [
        'retry_after_seconds' => min(10, max(1, (int) env('INVOICE_PDF_RETRY_AFTER_SECONDS', 2))),
        'max_automatic_attempts' => min(30, max(1, (int) env('INVOICE_PDF_MAX_WAIT_ATTEMPTS', 10))),
    ],

    'render' => [
        'paper' => 'a4',
        'orientation' => 'portrait',
        'options' => [
            'defaultFont' => 'DejaVu Sans',
            'dpi' => 144,
            'isHtml5ParserEnabled' => true,
            'isPhpEnabled' => false,
            'isRemoteEnabled' => false,
        ],
    ],

    'monitoring' => [
        'sample_limit' => min(5_000, max(100, (int) env('INVOICE_PDF_MONITOR_SAMPLE_LIMIT', 1_000))),
        'pending_warning' => max(1, (int) env('INVOICE_PDF_PENDING_WARNING', 25)),
        'pending_outage' => max(2, (int) env('INVOICE_PDF_PENDING_OUTAGE', 100)),
        'worker_warning_seconds' => max(60, (int) env('INVOICE_PDF_WORKER_WARNING_SECONDS', 180)),
        'worker_outage_seconds' => max(120, (int) env('INVOICE_PDF_WORKER_OUTAGE_SECONDS', 600)),
        'failed_warning' => max(1, (int) env('INVOICE_PDF_FAILED_WARNING', 1)),
        'failed_outage' => max(2, (int) env('INVOICE_PDF_FAILED_OUTAGE', 10)),
        'lifecycle_warning' => max(1, (int) env('INVOICE_PDF_LIFECYCLE_WARNING', 250)),
        'lifecycle_outage' => max(2, (int) env('INVOICE_PDF_LIFECYCLE_OUTAGE', 1_000)),
        'storage_warning_free_percent' => min(50, max(1, (int) env('INVOICE_PDF_STORAGE_WARNING_FREE_PERCENT', 15))),
        'storage_outage_free_percent' => min(25, max(1, (int) env('INVOICE_PDF_STORAGE_OUTAGE_FREE_PERCENT', 5))),
    ],
];
