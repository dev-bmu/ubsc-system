import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from './sign-capacity-evidence.mjs';
import { readBoundedJson } from './capacity-file.mjs';
import { isRfc3339 } from './capacity-contract.mjs';

export function signCapacityObservation(payload, keyId, configuredKey, expectedTargets = []) {
    validateObservation(payload, expectedTargets);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(String(keyId || ''))) {
        throw new Error('CAPACITY_OBSERVATION_KEY_ID is invalid.');
    }

    const key = decodeKey(configuredKey);
    if (key.length < 32 || key.length > 4_096) {
        throw new Error('Capacity observation key must contain between 32 and 4096 bytes.');
    }

    return {
        schema_version: 1,
        key_id: keyId,
        payload,
        signature: createHmac('sha256', key).update(canonicalJson(payload)).digest('hex'),
    };
}

async function main() {
    const input = process.argv[2];
    const output = process.argv[3];
    if (!input || !output) throw new Error('Usage: node sign-capacity-observation.mjs INPUT OUTPUT');
    const payload = await readBoundedJson(input, 65_536, 'Capacity observation file');
    const expectedTargets = String(process.env.CAPACITY_MANAGED_TARGETS || '')
        .split(',')
        .map((target) => target.trim())
        .filter(Boolean);
    if (expectedTargets.length < 1) {
        throw new Error('CAPACITY_MANAGED_TARGETS is required when signing provider observations.');
    }
    const envelope = signCapacityObservation(
        payload,
        process.env.CAPACITY_OBSERVATION_KEY_ID,
        process.env.CAPACITY_OBSERVATION_SIGNING_KEY,
        expectedTargets,
    );

    await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
    console.log(`Signed platform observation written to ${output}.`);
}

function validateObservation(payload, expectedTargets = []) {
    assertExactFields(payload, [
        'schema_version', 'observation_id', 'observed_at', 'provider',
        'environment', 'release', 'infrastructure_profile', 'targets',
    ], 'Capacity platform observation');
    if (!payload || payload.schema_version !== 2
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(payload.observation_id || ''))
        || !validIdentifier(payload.provider, 64)
        || !validIdentifier(payload.environment, 32)
        || !validIdentifier(payload.release, 128)
        || !validIdentifier(payload.infrastructure_profile, 128)
        || !isRfc3339(payload.observed_at)
        || !Number.isFinite(new Date(payload.observed_at).getTime())
        || !payload.targets
        || Array.isArray(payload.targets)
        || typeof payload.targets !== 'object'
        || !payload.targets.web
        || Object.keys(payload.targets).length > 64) {
        throw new Error('Capacity platform observation is malformed.');
    }

    const normalizedExpected = normalizeExpectedTargets(expectedTargets);
    const reportedTargets = Object.keys(payload.targets).sort();
    if (normalizedExpected.length > 0
        && (reportedTargets.length !== normalizedExpected.length
            || reportedTargets.some((target, index) => target !== normalizedExpected[index]))) {
        throw new Error('Capacity observation does not cover the configured managed targets.');
    }

    for (const [name, target] of Object.entries(payload.targets)) {
        assertExactFields(target, [
            'kind', 'state_token', 'current_instances', 'ready_instances',
            'cpu_utilization_percent', 'memory_utilization_percent',
        ], `Capacity target ${name}`);
        if (!/^(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})$/.test(name)
            || !target
            || typeof target !== 'object'
            || Array.isArray(target)
            || (name === 'web' ? target.kind !== 'web' : target.kind !== 'queue')
            || !/^[a-f0-9]{64}$/.test(String(target.state_token || ''))
            || !integerBetween(target.current_instances, 0, 1_000)
            || !integerBetween(target.ready_instances, 0, target.current_instances)
            || !decimalBetween(target.cpu_utilization_percent, 0, 100, 2)
            || !decimalBetween(target.memory_utilization_percent, 0, 100, 2)) {
            throw new Error(`Capacity target ${name} is malformed.`);
        }
    }
}

function assertOnlyFields(value, allowed, label) {
    if (!value || Array.isArray(value) || typeof value !== 'object'
        || Object.keys(value).some((field) => !allowed.includes(field))) {
        throw new Error(`${label} contains unsupported fields.`);
    }
}

function assertExactFields(value, fields, label) {
    assertOnlyFields(value, fields, label);
    if (fields.some((field) => !Object.hasOwn(value, field))) {
        throw new Error(`${label} is missing required fields.`);
    }
}

function validIdentifier(value, maximum) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= maximum
        && /^[a-zA-Z0-9][a-zA-Z0-9_.:/+\-]{0,127}$/.test(value);
}

function integerBetween(value, minimum, maximum) {
    return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function numberBetween(value, minimum, maximum) {
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function decimalBetween(value, minimum, maximum, places) {
    if (!numberBetween(value, minimum, maximum)) return false;

    return Math.abs(value - (Math.round(value * (10 ** places)) / (10 ** places))) <= 1e-9;
}

function normalizeExpectedTargets(value) {
    if (!Array.isArray(value)
        || value.length > 64
        || value.some((target) => !/^(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})$/.test(String(target)))) {
        throw new Error('CAPACITY_MANAGED_TARGETS is invalid.');
    }
    const targets = [...new Set(value)].sort();
    if (targets.length !== value.length || (targets.length > 0 && !targets.includes('web'))) {
        throw new Error('CAPACITY_MANAGED_TARGETS must be unique and include web.');
    }
    return targets;
}

function decodeKey(value) {
    const configured = String(value || '');
    if (configured.startsWith('base64:')) {
        const encoded = configured.slice(7);
        if (!validBase64(encoded)) throw new Error('Invalid base64 observation key.');
        return Buffer.from(encoded, 'base64');
    }
    if (configured.startsWith('hex:')) {
        if (!/^(?:[a-fA-F0-9]{2})+$/.test(configured.slice(4))) throw new Error('Invalid hex observation key.');
        return Buffer.from(configured.slice(4), 'hex');
    }
    return Buffer.from(configured, 'utf8');
}

function validBase64(value) {
    return value.length > 0
        && value.length % 4 === 0
        && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

const invokedDirectly = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) await main();
