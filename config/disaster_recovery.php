<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isMultiNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'multi_node';
$signingKeys = json_decode((string) env('RECOVERY_EVIDENCE_SIGNING_KEYS', '{}'), true);
$attestationKeys = json_decode(
    (string) env('RECOVERY_ATTESTATION_VERIFYING_KEYS', '{}'),
    true,
);
$activeAttestationKeyIds = array_values(array_unique(array_filter(array_map(
    static fn (string $keyId): string => trim($keyId),
    explode(',', (string) env('RECOVERY_ATTESTATION_ACTIVE_KEY_IDS', '')),
))));

return [
    /*
    | The application validates this contract but does not pretend to enable
    | provider-side PITR or object lock. Production activation fails closed
    | until infrastructure has declared every required recovery capability.
    */
    'enforce' => $isMultiNode
        && (bool) env('DISASTER_RECOVERY_CONTRACT_ENFORCE', $isProduction),

    'objectives' => [
        'rpo_seconds' => max(1, (int) env('RECOVERY_POINT_OBJECTIVE_SECONDS', 300)),
        'rto_seconds' => max(60, (int) env('RECOVERY_TIME_OBJECTIVE_SECONDS', 3_600)),
    ],

    'target' => [
        // Opaque, non-secret identities bind recovery evidence to the exact
        // provider and dataset without exposing a database name or endpoint.
        'provider' => strtolower(trim((string) env('RECOVERY_PROVIDER', ''))),
        'dataset_id' => strtolower(trim((string) env('RECOVERY_DATASET_ID', ''))),
        'primary_region' => strtolower(trim((string) env('RECOVERY_PRIMARY_REGION', ''))),
        'recovery_region' => strtolower(trim((string) env('RECOVERY_SECONDARY_REGION', ''))),
        'backup_destination_id' => strtolower(trim((string) env(
            'RECOVERY_BACKUP_DESTINATION_ID',
            '',
        ))),
        'independent_verifier' => strtolower(trim((string) env(
            'RECOVERY_INDEPENDENT_VERIFIER',
            '',
        ))),
    ],

    'pitr' => [
        'enabled' => (bool) env('DB_PITR_ENABLED', false),
        'provider_managed' => (bool) env('DB_PITR_PROVIDER_MANAGED', false),
        'continuous' => (bool) env('DB_PITR_CONTINUOUS', false),
        'retention_days' => max(1, (int) env('DB_PITR_RETENTION_DAYS', 1)),
        'minimum_retention_days' => 14,
        'observation_enabled' => (bool) env('DB_PITR_OBSERVATION_ENABLED', false),
        'heartbeat_key' => 'pitr-capability',
        'warning_after_seconds' => max(60, (int) env('DB_PITR_OBSERVATION_WARNING_SECONDS', 600)),
        'outage_after_seconds' => max(120, (int) env('DB_PITR_OBSERVATION_OUTAGE_SECONDS', 1_200)),
    ],

    'backup' => [
        'enabled' => (bool) env('DB_IMMUTABLE_BACKUP_ENABLED', false),
        // Back up the complete relational database. Media remains protected
        // by the independent versioning/retention policy of object storage.
        'scope' => strtolower(trim((string) env('DB_BACKUP_SCOPE', 'database'))),
        'encrypted' => (bool) env('DB_BACKUP_ENCRYPTED', false),
        'offsite' => (bool) env('DB_BACKUP_OFFSITE', false),
        'cross_account' => (bool) env('DB_BACKUP_CROSS_ACCOUNT', false),
        'cross_region' => (bool) env('DB_BACKUP_CROSS_REGION', false),
        'immutable' => (bool) env('DB_BACKUP_IMMUTABLE', false),
        'object_lock_mode' => strtolower(trim((string) env('DB_BACKUP_OBJECT_LOCK_MODE', ''))),
        'retention_days' => max(1, (int) env('DB_BACKUP_RETENTION_DAYS', 1)),
        'minimum_retention_days' => 35,
        'allowed_object_lock_modes' => ['compliance'],
        'expected_interval_seconds' => min(
            172_800,
            max(3_600, (int) env('DB_BACKUP_EXPECTED_INTERVAL_SECONDS', 86_400)),
        ),
    ],

    'restore_drill' => [
        'enabled' => (bool) env('RESTORE_DRILL_ENABLED', false),
        'interval_days' => max(1, (int) env('RESTORE_DRILL_INTERVAL_DAYS', 90)),
        'maximum_interval_days' => 90,
        'grace_days' => max(1, (int) env('RESTORE_DRILL_GRACE_DAYS', 14)),
        'isolated_target_required' => (bool) env('RESTORE_DRILL_ISOLATED_TARGET_REQUIRED', true),
        'production_target_forbidden' => (bool) env('RESTORE_DRILL_PRODUCTION_TARGET_FORBIDDEN', true),
        'isolation_evidence_required' => true,
        'production_access_blocked_required' => true,
        'heartbeat_key' => 'restore-drill',
    ],

    'evidence' => [
        // A key ring permits rotation without invalidating old attestations.
        // Values remain in the deployment secret manager, never in source.
        'active_key_id' => trim((string) env('RECOVERY_EVIDENCE_ACTIVE_KEY_ID', '')),
        'signing_keys' => is_array($signingKeys) ? $signingKeys : [],
        'minimum_key_bytes' => 32,
        'maximum_key_bytes' => 128,
        'verification_heartbeat_key' => 'recovery-evidence-chain',
        'verification_warning_after_seconds' => max(
            3_600,
            (int) env('RECOVERY_EVIDENCE_WARNING_SECONDS', 7_200),
        ),
        'verification_outage_after_seconds' => max(
            7_200,
            (int) env('RECOVERY_EVIDENCE_OUTAGE_SECONDS', 14_400),
        ),
    ],

    'attestation' => [
        // Success evidence is produced by an independently credentialed
        // verifier. Laravel receives public keys only; its local HMAC ledger
        // is a second, separate integrity boundary.
        'required' => (bool) env('RECOVERY_ATTESTATION_REQUIRED', $isProduction),
        'verification_keys' => is_array($attestationKeys) ? $attestationKeys : [],
        'active_key_ids' => $activeAttestationKeyIds,
        'maximum_payload_bytes' => min(
            131_072,
            max(8_192, (int) env('RECOVERY_ATTESTATION_MAX_BYTES', 65_536)),
        ),
        'maximum_envelope_bytes' => min(
            262_144,
            max(16_384, (int) env('RECOVERY_ATTESTATION_MAX_ENVELOPE_BYTES', 98_304)),
        ),
        'maximum_clock_skew_seconds' => min(
            900,
            max(0, (int) env('RECOVERY_ATTESTATION_CLOCK_SKEW_SECONDS', 300)),
        ),
    ],
];
