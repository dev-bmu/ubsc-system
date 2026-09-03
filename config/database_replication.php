<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';
$attestationKeys = json_decode(
    (string) env('DB_REPLICATION_ATTESTATION_VERIFYING_KEYS', '{}'),
    true,
);
$ledgerKeys = json_decode(
    (string) env('DB_REPLICATION_LEDGER_SIGNING_KEYS', '{}'),
    true,
);
$activeAttestationKeyIds = array_values(array_unique(array_filter(array_map(
    static fn (string $keyId): string => trim($keyId),
    explode(',', (string) env('DB_REPLICATION_ATTESTATION_ACTIVE_KEY_IDS', '')),
))));

return [
    /*
    | Replication is provisioned by the managed database provider. Laravel
    | validates the topology and consumes independently signed observations;
    | these declarations never pretend to create or promote infrastructure.
    */
    'enforce' => $isMultiNode
        && (bool) env('DATABASE_REPLICATION_CONTRACT_ENFORCE', $isProduction),
    'enabled' => $isMultiNode && (bool) env('DB_REPLICATION_ENABLED', false),

    'target' => [
        'provider' => strtolower(trim((string) env('DB_REPLICATION_PROVIDER', ''))),
        'cluster_id' => strtolower(trim((string) env('DB_REPLICATION_CLUSTER_ID', ''))),
        'dataset_id' => strtolower(trim((string) env('DB_REPLICATION_DATASET_ID', ''))),
        'environment' => strtolower(trim((string) env('DB_REPLICATION_ENVIRONMENT', 'production'))),
        'primary_region' => strtolower(trim((string) env('DB_REPLICATION_PRIMARY_REGION', ''))),
        'writer_endpoint_id' => strtolower(trim((string) env('DB_REPLICATION_WRITER_ENDPOINT_ID', ''))),
        'reader_endpoint_id' => strtolower(trim((string) env('DB_REPLICATION_READER_ENDPOINT_ID', ''))),
        'independent_observer' => strtolower(trim((string) env('DB_REPLICATION_INDEPENDENT_OBSERVER', ''))),
    ],

    'topology' => [
        'managed_service' => (bool) env('DB_REPLICATION_MANAGED_SERVICE', false),
        'mode' => strtolower(trim((string) env('DB_REPLICATION_MODE', ''))),
        'allowed_modes' => ['synchronous', 'semisynchronous'],
        'single_writer' => (bool) env('DB_REPLICATION_SINGLE_WRITER', true),
        'automatic_failover' => (bool) env('DB_REPLICATION_AUTOMATIC_FAILOVER', false),
        // Automatic failback is intentionally forbidden. Returning ownership
        // to the old writer is a separately approved and observed operation.
        'automatic_failback' => (bool) env('DB_REPLICATION_AUTOMATIC_FAILBACK', false),
        'minimum_availability_zones' => max(1, (int) env('DB_REPLICATION_MIN_AZS', 1)),
        'minimum_replicas' => max(0, (int) env('DB_REPLICATION_MIN_REPLICAS', 0)),
        'minimum_synchronous_replicas' => max(
            0,
            (int) env('DB_REPLICATION_MIN_SYNC_REPLICAS', 0),
        ),
        'quorum_required' => (bool) env('DB_REPLICATION_QUORUM_REQUIRED', true),
        'stale_writer_fencing_required' => (bool) env(
            'DB_REPLICATION_FENCING_REQUIRED',
            true,
        ),
        'promotion_catchup_required' => (bool) env(
            'DB_REPLICATION_PROMOTION_CATCHUP_REQUIRED',
            true,
        ),
        'maximum_data_loss_bytes' => max(
            0,
            (int) env('DB_REPLICATION_MAX_DATA_LOSS_BYTES', 0),
        ),
        'failover_rto_seconds' => max(0, (int) env('DB_REPLICATION_FAILOVER_RTO_SECONDS', 0)),
        'maximum_failover_rto_seconds' => 120,
    ],

    'engine' => [
        'gtid_required' => (bool) env('DB_REPLICATION_GTID_REQUIRED', true),
        'row_binlog_required' => (bool) env('DB_REPLICATION_ROW_BINLOG_REQUIRED', true),
        'replica_read_only_required' => (bool) env(
            'DB_REPLICATION_REPLICA_READ_ONLY_REQUIRED',
            true,
        ),
        'tls_required' => (bool) env('DB_TLS_REQUIRED', false),
        'tls_verify_peer' => (bool) env('DB_TLS_VERIFY_PEER', false),
    ],

    'lag' => [
        'warning_ms' => max(100, (int) env('DB_REPLICATION_LAG_WARNING_MS', 2_000)),
        'outage_ms' => max(500, (int) env('DB_REPLICATION_LAG_OUTAGE_MS', 10_000)),
    ],

    'observation' => [
        'enabled' => (bool) env('DB_REPLICATION_OBSERVATION_ENABLED', false),
        'heartbeat_key' => 'database-replication-topology',
        'warning_after_seconds' => max(
            30,
            (int) env('DB_REPLICATION_OBSERVATION_WARNING_SECONDS', 120),
        ),
        'outage_after_seconds' => max(
            60,
            (int) env('DB_REPLICATION_OBSERVATION_OUTAGE_SECONDS', 300),
        ),
    ],

    'application_reads' => [
        // Transactional booking, membership, payment, authentication, admin,
        // and availability reads always remain on the writer. This optional
        // endpoint is reserved for explicitly eventual, idempotent read models.
        'enabled' => $isMultiNode && (bool) env('DB_REPLICA_READS_ENABLED', false),
        'connection' => trim((string) env('DB_REPLICA_CONNECTION', 'mariadb_replica')),
        'fallback_to_writer' => (bool) env('DB_REPLICA_FALLBACK_TO_WRITER', true),
        'read_after_write_seconds' => min(
            300,
            max(0, (int) env('DB_REPLICA_READ_AFTER_WRITE_SECONDS', 30)),
        ),
    ],

    'bootstrap' => [
        // A public, already-signed envelope used only when the first migration
        // introduces an entirely absent replication control-plane schema.
        // It is never used to replace a missing/corrupt state in existing tables.
        'attestation_file' => trim((string) env(
            'DB_REPLICATION_BOOTSTRAP_ATTESTATION_FILE',
            '',
        )),
    ],

    'attestation' => [
        'required' => (bool) env('DB_REPLICATION_ATTESTATION_REQUIRED', $isProduction),
        'verification_keys' => is_array($attestationKeys) ? $attestationKeys : [],
        'active_key_ids' => $activeAttestationKeyIds,
        'maximum_payload_bytes' => min(
            131_072,
            max(8_192, (int) env('DB_REPLICATION_ATTESTATION_MAX_BYTES', 65_536)),
        ),
        'maximum_envelope_bytes' => min(
            262_144,
            max(16_384, (int) env('DB_REPLICATION_ATTESTATION_MAX_ENVELOPE_BYTES', 98_304)),
        ),
        'maximum_clock_skew_seconds' => min(
            900,
            max(0, (int) env('DB_REPLICATION_ATTESTATION_CLOCK_SKEW_SECONDS', 120)),
        ),
        'maximum_age_seconds' => min(
            86_400,
            max(60, (int) env('DB_REPLICATION_ATTESTATION_MAX_AGE_SECONDS', 900)),
        ),
    ],

    'ledger' => [
        'active_key_id' => trim((string) env('DB_REPLICATION_LEDGER_ACTIVE_KEY_ID', '')),
        'signing_keys' => is_array($ledgerKeys) ? $ledgerKeys : [],
        'minimum_key_bytes' => 32,
        'verification_heartbeat_key' => 'database-replication-ledger',
        'verification_warning_after_seconds' => max(
            3_600,
            (int) env('DB_REPLICATION_LEDGER_WARNING_SECONDS', 7_200),
        ),
        'verification_outage_after_seconds' => max(
            7_200,
            (int) env('DB_REPLICATION_LEDGER_OUTAGE_SECONDS', 14_400),
        ),
        'event_limit' => min(100, max(5, (int) env('DB_REPLICATION_EVENT_LIMIT', 30))),
    ],
];
