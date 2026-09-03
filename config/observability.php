<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';
$externalSliKeys = json_decode((string) env('EXTERNAL_MONITORING_INGEST_KEYS', '{}'), true);
$logReceiptKeys = json_decode(
    (string) env('OBSERVABILITY_LOG_RECEIPT_VERIFYING_KEYS', '{}'),
    true,
);
$logReceiptActiveKeyIds = array_values(array_unique(array_filter(array_map(
    static fn (string $key): string => trim($key),
    explode(',', (string) env('OBSERVABILITY_LOG_RECEIPT_ACTIVE_KEY_IDS', '')),
))));

return [
    /*
    | Observability is a production safety contract, not a dashboard theme.
    | It requires independently observable failure, bounded telemetry, and an
    | off-host route that still works when an application node disappears.
    */
    'enforce' => $isMultiNode
        && (bool) env('OBSERVABILITY_CONTRACT_ENFORCE', $isProduction),

    'request_correlation' => [
        'enabled' => (bool) env('OBSERVABILITY_REQUEST_ID_ENABLED', true),
        'header' => 'X-Request-ID',
        'attribute' => 'ubsc.observability.request_id',
        // Never trust a client-supplied identifier as the server trace ID.
        'accept_incoming' => false,
    ],

    'logs' => [
        'off_host_export_enabled' => (bool) env('OBSERVABILITY_LOG_EXPORT_ENABLED', false),
        'provider' => strtolower(trim((string) env('OBSERVABILITY_LOG_EXPORT_PROVIDER', ''))),
        'structured_json' => (bool) env('OBSERVABILITY_STRUCTURED_LOGS', false),
        'required_channel' => 'json_stderr',
    ],

    'log_receipts' => [
        'enabled' => (bool) env('OBSERVABILITY_LOG_RECEIPTS_ENABLED', false),
        'provider' => strtolower(trim((string) env(
            'OBSERVABILITY_LOG_RECEIPT_PROVIDER',
            '',
        ))),
        'active_key_ids' => $logReceiptActiveKeyIds,
        'verification_keys' => is_array($logReceiptKeys) ? $logReceiptKeys : [],
        'maximum_envelope_bytes' => min(131_072, max(4_096, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_MAX_BYTES',
            32_768,
        ))),
        'maximum_age_seconds' => min(1_800, max(60, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_MAX_AGE_SECONDS',
            600,
        ))),
        'maximum_clock_skew_seconds' => min(600, max(0, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_CLOCK_SKEW_SECONDS',
            120,
        ))),
        'minimum_retention_days' => min(3_650, max(30, (int) env(
            'OBSERVABILITY_LOG_MIN_RETENTION_DAYS',
            90,
        ))),
        'wait_seconds' => min(120, max(5, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_WAIT_SECONDS',
            60,
        ))),
        'poll_milliseconds' => min(2_000, max(100, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_POLL_MS',
            500,
        ))),
        'warning_after_seconds' => max(3_600, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_WARNING_SECONDS',
            90_000,
        )),
        'outage_after_seconds' => max(7_200, (int) env(
            'OBSERVABILITY_LOG_RECEIPT_OUTAGE_SECONDS',
            172_800,
        )),
        'heartbeat_key' => 'monitoring-log-export-receipt',
    ],

    'signals' => [
        'external_sli_connected' => (bool) env('OBSERVABILITY_EXTERNAL_SLI_CONNECTED', false),
        'centralized_security_events' => (bool) env(
            'OBSERVABILITY_SECURITY_EVENTS_CONNECTED',
            false,
        ),
        'apm_connected' => (bool) env('OBSERVABILITY_APM_CONNECTED', false),
    ],

    'external_sli' => [
        // External probes authenticate every individual result. Missing probe
        // intervals remain visible as bad SLI samples, including when the
        // entire application is unavailable and cannot receive an outage POST.
        'ingest_enabled' => (bool) env('EXTERNAL_MONITORING_INGEST_ENABLED', false),
        'provider' => strtolower(trim((string) env(
            'EXTERNAL_MONITORING_PROVIDER',
            'github-actions',
        ))),
        'signing_keys' => is_array($externalSliKeys) ? $externalSliKeys : [],
        'minimum_key_bytes' => 32,
        'maximum_body_bytes' => min(65_536, max(1_024, (int) env(
            'EXTERNAL_MONITORING_INGEST_MAX_BODY_BYTES',
            16_384,
        ))),
        'clock_skew_seconds' => min(600, max(60, (int) env(
            'EXTERNAL_MONITORING_INGEST_CLOCK_SKEW_SECONDS',
            300,
        ))),
        'maximum_probe_duration_seconds' => min(300, max(30, (int) env(
            'EXTERNAL_MONITORING_MAX_PROBE_DURATION_SECONDS',
            180,
        ))),
        'metric_key' => 'sli.public_availability',
        'heartbeat_key' => 'external-synthetic-availability',
    ],

    'alerting' => [
        'off_host_required' => true,
        'local_fallback_required' => true,
        'dispatcher_heartbeat_key' => 'monitoring-alert-dispatcher',
        'off_host_canary_heartbeat_key' => 'monitoring-alert-off-host-canary',
        // Retrying the same operation shortly after an interrupted command is
        // idempotent. Reusing an old operation must never refresh proof.
        'canary_reuse_seconds' => min(3_600, max(
            60,
            (int) env('MONITORING_ALERT_CANARY_REUSE_SECONDS', 600),
        )),
        'dispatcher_warning_after_seconds' => max(
            60,
            (int) env('MONITORING_ALERT_DISPATCHER_WARNING_SECONDS', 180),
        ),
        'dispatcher_outage_after_seconds' => max(
            120,
            (int) env('MONITORING_ALERT_DISPATCHER_OUTAGE_SECONDS', 600),
        ),
        'pending_warning' => max(1, (int) env('MONITORING_ALERT_PENDING_WARNING', 25)),
        'pending_outage' => max(2, (int) env('MONITORING_ALERT_PENDING_OUTAGE', 100)),
        'oldest_warning_seconds' => max(
            60,
            (int) env('MONITORING_ALERT_OLDEST_WARNING_SECONDS', 300),
        ),
        'oldest_outage_seconds' => max(
            120,
            (int) env('MONITORING_ALERT_OLDEST_OUTAGE_SECONDS', 900),
        ),
        'off_host_warning_after_seconds' => max(
            3_600,
            (int) env('MONITORING_ALERT_OFF_HOST_WARNING_SECONDS', 90_000),
        ),
        'off_host_outage_after_seconds' => max(
            7_200,
            (int) env('MONITORING_ALERT_OFF_HOST_OUTAGE_SECONDS', 172_800),
        ),
    ],

    'slo' => [
        'latency_threshold_ms' => max(50, (int) env('MONITORING_SLO_LATENCY_THRESHOLD_MS', 800)),
        'booking_scope' => 'booking_checkout',
        'latency_scopes' => ['public_read', 'booking_checkout'],
        'burn_rate' => [
            'fast_short_window' => max(1.0, (float) env('MONITORING_SLO_FAST_BURN_1H', 14.4)),
            'fast_long_window' => max(1.0, (float) env('MONITORING_SLO_FAST_BURN_6H', 6.0)),
            'slow_short_window' => max(1.0, (float) env('MONITORING_SLO_SLOW_BURN_6H', 6.0)),
            'slow_long_window' => max(1.0, (float) env('MONITORING_SLO_SLOW_BURN_24H', 3.0)),
        ],
    ],
];
