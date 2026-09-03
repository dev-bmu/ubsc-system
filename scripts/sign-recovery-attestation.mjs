import { createPrivateKey, sign } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MAX_PAYLOAD_BYTES = 65_536;
const MAX_PRIVATE_KEY_BYTES = 16_384;
const PAYLOAD_KEYS = {
    pitr_observation: [
        'backup_destination_id', 'checked_at', 'continuous', 'dataset_id',
        'evidence_type', 'latest_recovery_point_at', 'operation_id',
        'primary_region', 'provider', 'recovery_region', 'restorable',
        'schema_version', 'verifier',
    ],
    backup_verified: [
        'archive_readable', 'backup_destination_id', 'backup_id',
        'checksum_sha256', 'checksum_verified', 'completed_at', 'cross_account',
        'cross_region', 'dataset_id', 'encrypted', 'evidence_type',
        'immutable_until', 'object_lock_mode', 'offsite', 'operation_id',
        'provider', 'primary_region', 'recovery_point_at', 'recovery_region',
        'schema_version', 'size_bytes', 'source_snapshot_at', 'verifier',
    ],
    backup_failed: [
        'backup_destination_id', 'backup_id', 'checked_at', 'dataset_id',
        'evidence_type', 'failure_code', 'operation_id', 'primary_region',
        'provider', 'recovery_region', 'schema_version', 'verifier',
    ],
    restore_drill: [
        'application_smoke_verified', 'audit_ledger_verified',
        'authorization_integrity_verified', 'backup_destination_id', 'backup_id',
        'booking_integrity_verified', 'checksum_sha256', 'completed_at',
        'content_integrity_verified', 'database_constraints_verified', 'dataset_id',
        'evidence_type', 'isolation_verified', 'membership_integrity_verified',
        'migration_state_verified', 'operation_id', 'payment_integrity_verified',
        'pitr_replay_verified', 'primary_region', 'production_access_blocked',
        'provider', 'recovery_point_at', 'recovery_region', 'row_counts_verified',
        'schema_verified', 'schema_version', 'started_at', 'target_environment',
        'users_integrity_verified', 'verifier',
    ],
};
const FAILURE_CODES = new Set([
    'archive_unreadable', 'backup_job_failed', 'checksum_mismatch',
    'encryption_unverified', 'object_lock_unverified', 'offsite_copy_failed',
    'cross_account_copy_failed', 'cross_region_copy_failed',
    'provider_unavailable', 'retention_unverified', 'rpo_missed',
]);
const COMMON_IDENTIFIERS = [
    'provider', 'verifier', 'dataset_id', 'backup_destination_id',
    'primary_region', 'recovery_region',
];

export function canonicalJson(value) {
    return JSON.stringify(normalize(value, 0));
}

export function signRecoveryAttestation(payload, keyId, privateKeyPem) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(String(keyId || ''))) {
        throw new Error('Recovery attestation key ID is invalid.');
    }
    if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('Recovery attestation payload must be one JSON object.');
    }
    validatePayload(payload);

    const canonical = canonicalJson(payload);
    if (Buffer.byteLength(canonical, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw new Error('Recovery attestation payload exceeds the safety limit.');
    }

    const privateKey = createPrivateKey(privateKeyPem);
    const details = privateKey.asymmetricKeyDetails || {};
    const strongRsa = privateKey.asymmetricKeyType === 'rsa'
        && Number(details.modulusLength || 0) >= 2_048;
    const strongEc = privateKey.asymmetricKeyType === 'ec'
        && ['prime256v1', 'secp256r1', 'secp384r1', 'secp521r1'].includes(details.namedCurve);
    if (!strongRsa && !strongEc) {
        throw new Error('Recovery attestation requires RSA-2048+ or a supported P-256+ EC private key.');
    }

    return {
        schema_version: 1,
        key_id: keyId,
        payload,
        signature: sign('sha256', Buffer.from(canonical, 'utf8'), privateKey).toString('base64'),
    };
}

function validatePayload(payload) {
    if (payload.schema_version !== 1 || !Object.hasOwn(PAYLOAD_KEYS, payload.evidence_type)) {
        throw new Error('Recovery attestation payload type or schema version is unsupported.');
    }

    const actualKeys = Object.keys(payload).sort();
    const expectedKeys = [...PAYLOAD_KEYS[payload.evidence_type]].sort();
    if (actualKeys.length !== expectedKeys.length
        || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        throw new Error('Recovery attestation payload has missing or unexpected fields.');
    }

    assertIdentifier(payload.operation_id, 'operation_id', 100);
    for (const field of COMMON_IDENTIFIERS) assertIdentifier(payload[field], field, 64);

    if (payload.evidence_type === 'pitr_observation') {
        assertRfc3339(payload.latest_recovery_point_at, 'latest_recovery_point_at');
        assertRfc3339(payload.checked_at, 'checked_at');
        assertBoolean(payload.continuous, 'continuous');
        assertBoolean(payload.restorable, 'restorable');
        return;
    }

    assertIdentifier(payload.backup_id, 'backup_id', 100);
    if (payload.evidence_type === 'backup_failed') {
        assertRfc3339(payload.checked_at, 'checked_at');
        if (!FAILURE_CODES.has(payload.failure_code)) {
            throw new Error('failure_code is unsupported.');
        }
        return;
    }

    assertChecksum(payload.checksum_sha256);
    assertRfc3339(payload.recovery_point_at, 'recovery_point_at');
    assertRfc3339(payload.completed_at, 'completed_at');
    if (payload.evidence_type === 'backup_verified') {
        assertRfc3339(payload.source_snapshot_at, 'source_snapshot_at');
        assertRfc3339(payload.immutable_until, 'immutable_until');
        assertIdentifier(payload.object_lock_mode, 'object_lock_mode', 24);
        assertInteger(payload.size_bytes, 'size_bytes', 1, Number.MAX_SAFE_INTEGER);
        for (const field of [
            'archive_readable', 'checksum_verified', 'encrypted', 'offsite',
            'cross_account', 'cross_region',
        ]) assertBoolean(payload[field], field);
        return;
    }

    assertRfc3339(payload.started_at, 'started_at');
    assertIdentifier(payload.target_environment, 'target_environment', 64);
    for (const field of [
        'isolation_verified', 'production_access_blocked', 'pitr_replay_verified',
        'schema_verified', 'row_counts_verified', 'migration_state_verified',
        'database_constraints_verified', 'booking_integrity_verified',
        'membership_integrity_verified', 'payment_integrity_verified',
        'users_integrity_verified', 'authorization_integrity_verified',
        'content_integrity_verified', 'audit_ledger_verified',
        'application_smoke_verified',
    ]) assertBoolean(payload[field], field);
}

function assertIdentifier(value, field, maximum) {
    if (typeof value !== 'string'
        || Buffer.byteLength(value, 'utf8') > maximum
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) {
        throw new Error(`${field} is invalid.`);
    }
}

function assertInteger(value, field, minimum, maximum) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${field} is outside its accepted boundary.`);
    }
}

function assertBoolean(value, field) {
    if (typeof value !== 'boolean') throw new Error(`${field} must be boolean.`);
}

function assertChecksum(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
        throw new Error('checksum_sha256 must contain exactly 64 hexadecimal characters.');
    }
}

function assertRfc3339(value, field) {
    if (typeof value !== 'string' || value.endsWith('-00:00')) {
        throw new Error(`${field} must be a strict RFC3339 timestamp.`);
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!match) throw new Error(`${field} must be a strict RFC3339 timestamp.`);

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = Number(match[8] || 0);
    const offsetMinute = Number(match[9] || 0);
    const daysInMonth = month >= 1 && month <= 12
        ? new Date(Date.UTC(year, month, 0)).getUTCDate()
        : 0;
    const valid = year >= 1970
        && day >= 1
        && day <= daysInMonth
        && hour <= 23
        && minute <= 59
        && second <= 59
        && offsetHour <= 14
        && offsetMinute <= 59
        && (offsetHour < 14 || offsetMinute === 0);
    if (!valid) throw new Error(`${field} must be a strict RFC3339 timestamp.`);
}

async function readBounded(path, maximum, label) {
    const handle = await open(path, 'r');
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximum) {
            throw new Error(`${label} is empty, not a regular file, or exceeds ${maximum} bytes.`);
        }
        const buffer = Buffer.allocUnsafe(maximum + 1);
        const { bytesRead } = await handle.read(buffer, 0, maximum + 1, 0);
        if (bytesRead < 1 || bytesRead > maximum) {
            throw new Error(`${label} changed while being read or exceeds ${maximum} bytes.`);
        }

        return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
        await handle.close();
    }
}

async function main() {
    const [payloadPath, privateKeyPath, keyId, outputPath] = process.argv.slice(2);
    if (!payloadPath || !privateKeyPath || !keyId || !outputPath) {
        throw new Error('Usage: node scripts/sign-recovery-attestation.mjs PAYLOAD PRIVATE_KEY KEY_ID OUTPUT');
    }

    const payloadText = await readBounded(payloadPath, MAX_PAYLOAD_BYTES, 'Payload');
    const privateKeyPem = await readBounded(privateKeyPath, MAX_PRIVATE_KEY_BYTES, 'Private key');
    const payload = JSON.parse(payloadText);
    const envelope = signRecoveryAttestation(payload, keyId, privateKeyPem);

    await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
    console.log(`Signed recovery attestation written to ${outputPath}.`);
}

function normalize(value, depth) {
    if (depth > 16) throw new Error('Recovery attestation nesting exceeds the safety limit.');
    if (Array.isArray(value)) {
        if (value.length > 64) throw new Error('Recovery attestation collection exceeds the safety limit.');
        return value.map((item) => normalize(item, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length > 64) throw new Error('Recovery attestation collection exceeds the safety limit.');
        return Object.fromEntries(keys.sort().map((key) => {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(key)) {
                throw new Error('Recovery attestation contains an invalid object key.');
            }
            return [key, normalize(value[key], depth + 1)];
        }));
    }
    if (typeof value === 'string') {
        if (Buffer.byteLength(value, 'utf8') > 65_536) {
            throw new Error('Recovery attestation string exceeds the safety limit.');
        }
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) {
            throw new Error('Recovery attestation numbers must be safe integers.');
        }
        return value;
    }
    if (typeof value === 'boolean' || value === null) return value;

    throw new Error('Recovery attestation contains an unsupported value.');
}

const invokedDirectly = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : 'Recovery attestation signing failed.');
        process.exitCode = 1;
    });
}
