import { createPrivateKey, sign } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MAX_PAYLOAD_BYTES = 65_536;
const MAX_PRIVATE_KEY_BYTES = 16_384;
const EVENT_TYPES = new Set([
    'topology_observation',
    'failover_completed',
    'failover_failed',
    'failback_completed',
    'drill_completed',
]);
const PAYLOAD_KEYS = [
    'schema_version',
    'event_type',
    'operation_id',
    'provider',
    'observer',
    'cluster_id',
    'dataset_id',
    'environment',
    'primary_region',
    'writer_endpoint_id',
    'reader_endpoint_id',
    'writer_instance_id',
    'previous_writer_instance_id',
    'topology_epoch',
    'observed_at',
    'replica_count',
    'healthy_replica_count',
    'synchronous_replica_count',
    'maximum_replica_lag_ms',
    'single_writer',
    'writer_writable',
    'quorum_healthy',
    'stale_writers_fenced',
    'replicas_read_only',
    'gtid_enabled',
    'row_binlog',
    'automatic_failover',
    'cross_az',
    'reader_endpoint_healthy',
    'promotion_caught_up',
    'data_loss_bytes',
    'change_reference',
];
const IDENTIFIER_FIELDS = [
    'operation_id',
    'provider',
    'observer',
    'cluster_id',
    'dataset_id',
    'environment',
    'primary_region',
    'writer_endpoint_id',
    'reader_endpoint_id',
    'writer_instance_id',
];
const BOOLEAN_FIELDS = [
    'single_writer',
    'writer_writable',
    'quorum_healthy',
    'stale_writers_fenced',
    'replicas_read_only',
    'gtid_enabled',
    'row_binlog',
    'automatic_failover',
    'cross_az',
    'reader_endpoint_healthy',
    'promotion_caught_up',
];

export function canonicalJson(value) {
    return JSON.stringify(normalize(value, 0));
}

export function signDatabaseReplicationAttestation(payload, keyId, privateKeyPem) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(String(keyId || ''))) {
        throw new Error('Database replication attestation key ID is invalid.');
    }
    if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('Database replication payload must be one JSON object.');
    }
    validatePayload(payload);

    const canonical = canonicalJson(payload);
    if (Buffer.byteLength(canonical, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw new Error('Database replication payload exceeds the safety limit.');
    }

    const privateKey = createPrivateKey(privateKeyPem);
    const details = privateKey.asymmetricKeyDetails || {};
    const strongRsa = privateKey.asymmetricKeyType === 'rsa'
        && Number(details.modulusLength || 0) >= 2_048;
    const strongEc = privateKey.asymmetricKeyType === 'ec'
        && ['prime256v1', 'secp256r1', 'secp384r1', 'secp521r1'].includes(details.namedCurve);
    if (!strongRsa && !strongEc) {
        throw new Error('Replication attestation requires RSA-2048+ or a supported P-256+ EC key.');
    }

    return {
        schema_version: 1,
        key_id: keyId,
        payload,
        signature: sign('sha256', Buffer.from(canonical, 'utf8'), privateKey).toString('base64'),
    };
}

function validatePayload(payload) {
    const actualKeys = Object.keys(payload).sort();
    const expectedKeys = [...PAYLOAD_KEYS].sort();
    if (actualKeys.length !== expectedKeys.length
        || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        throw new Error('Database replication payload has missing or unexpected fields.');
    }
    if (payload.schema_version !== 1 || !EVENT_TYPES.has(payload.event_type)) {
        throw new Error('Database replication payload type or schema version is unsupported.');
    }

    for (const field of IDENTIFIER_FIELDS) assertIdentifier(payload[field], field);
    if (payload.previous_writer_instance_id !== null) {
        assertIdentifier(payload.previous_writer_instance_id, 'previous_writer_instance_id');
    }
    if (typeof payload.change_reference !== 'string'
        || Buffer.byteLength(payload.change_reference, 'utf8') > 100) {
        throw new Error('change_reference is invalid.');
    }
    if (payload.event_type !== 'topology_observation') {
        assertIdentifier(payload.change_reference, 'change_reference');
    }
    if (['failover_completed', 'failback_completed'].includes(payload.event_type)
        && (payload.previous_writer_instance_id === null
            || payload.previous_writer_instance_id === payload.writer_instance_id)) {
        throw new Error('A completed writer transition requires a distinct previous writer.');
    }

    assertRfc3339(payload.observed_at);
    assertInteger(payload.topology_epoch, 'topology_epoch', 1, Number.MAX_SAFE_INTEGER);
    assertInteger(payload.replica_count, 'replica_count', 0, 1_000);
    assertInteger(
        payload.healthy_replica_count,
        'healthy_replica_count',
        0,
        payload.replica_count,
    );
    assertInteger(
        payload.synchronous_replica_count,
        'synchronous_replica_count',
        0,
        payload.healthy_replica_count,
    );
    assertInteger(
        payload.maximum_replica_lag_ms,
        'maximum_replica_lag_ms',
        0,
        86_400_000,
    );
    assertInteger(payload.data_loss_bytes, 'data_loss_bytes', 0, Number.MAX_SAFE_INTEGER);

    for (const field of BOOLEAN_FIELDS) {
        if (typeof payload[field] !== 'boolean') {
            throw new Error(`${field} must be boolean.`);
        }
    }
}

function assertIdentifier(value, field) {
    if (typeof value !== 'string'
        || Buffer.byteLength(value, 'utf8') > 100
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)) {
        throw new Error(`${field} is invalid.`);
    }
}

function assertInteger(value, field, minimum, maximum) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${field} is outside its accepted boundary.`);
    }
}

function assertRfc3339(value) {
    if (typeof value !== 'string' || value.endsWith('-00:00')) {
        throw new Error('observed_at must be a strict RFC3339 timestamp.');
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!match) throw new Error('observed_at must be a strict RFC3339 timestamp.');

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
    if (!valid) throw new Error('observed_at must be a strict RFC3339 timestamp.');
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
        throw new Error('Usage: node scripts/sign-database-replication-attestation.mjs PAYLOAD PRIVATE_KEY KEY_ID OUTPUT');
    }

    const payloadText = await readBounded(payloadPath, MAX_PAYLOAD_BYTES, 'Payload');
    const privateKeyPem = await readBounded(privateKeyPath, MAX_PRIVATE_KEY_BYTES, 'Private key');
    const envelope = signDatabaseReplicationAttestation(
        JSON.parse(payloadText),
        keyId,
        privateKeyPem,
    );
    await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
    console.log(`Signed database replication attestation written to ${outputPath}.`);
}

function normalize(value, depth) {
    if (depth > 16) throw new Error('Replication attestation nesting exceeds the safety limit.');
    if (Array.isArray(value)) {
        if (value.length > 64) throw new Error('Replication attestation collection exceeds the safety limit.');
        return value.map((item) => normalize(item, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length > 64) throw new Error('Replication attestation collection exceeds the safety limit.');
        return Object.fromEntries(keys.sort().map((key) => {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(key)) {
                throw new Error('Replication attestation contains an invalid object key.');
            }
            return [key, normalize(value[key], depth + 1)];
        }));
    }
    if (typeof value === 'string') {
        if (Buffer.byteLength(value, 'utf8') > 65_536) {
            throw new Error('Replication attestation string exceeds the safety limit.');
        }
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) {
            throw new Error('Replication attestation numbers must be safe integers.');
        }
        return value;
    }
    if (typeof value === 'boolean' || value === null) return value;

    throw new Error('Replication attestation contains an unsupported value.');
}

const invokedDirectly = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : 'Replication attestation signing failed.');
        process.exitCode = 1;
    });
}
