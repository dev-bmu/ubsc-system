import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
    capacityEvidenceContractFromEnvironment,
    validateCapacityEvidence,
} from './validate-capacity-evidence.mjs';
import { readBoundedJson } from './capacity-file.mjs';

export function canonicalJson(value) {
    return JSON.stringify(normalize(value, 0));
}

export function signCapacityEvidence(payload, keyId, configuredKey, validationOptions = {}) {
    validateCapacityEvidence(payload, new Date(), validationOptions);

    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(String(keyId || ''))) {
        throw new Error('CAPACITY_EVIDENCE_KEY_ID is invalid.');
    }

    const key = decodeKey(configuredKey);
    if (key.length < 32 || key.length > 4_096) {
        throw new Error('Capacity evidence signing key must contain between 32 and 4096 bytes.');
    }

    return {
        schema_version: 1,
        key_id: keyId,
        payload,
        signature: createHmac('sha256', key).update(canonicalJson(payload)).digest('hex'),
    };
}

async function main() {
    const input = process.argv[2] || 'artifacts/capacity-evidence.json';
    const output = process.argv[3] || 'artifacts/capacity-evidence.signed.json';
    const payload = await readBoundedJson(input, 65_536, 'Capacity evidence file');
    const envelope = signCapacityEvidence(
        payload,
        process.env.CAPACITY_EVIDENCE_KEY_ID,
        process.env.CAPACITY_EVIDENCE_SIGNING_KEY,
        capacityEvidenceContractFromEnvironment(),
    );

    await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
    console.log(`Signed capacity evidence written to ${output}.`);
}

function decodeKey(value) {
    const configured = String(value || '');

    if (configured.startsWith('base64:')) {
        const encoded = configured.slice(7);
        if (!validBase64(encoded)) {
            throw new Error('Capacity evidence signing key has invalid base64 encoding.');
        }
        return Buffer.from(encoded, 'base64');
    }
    if (configured.startsWith('hex:')) {
        if (!/^(?:[a-fA-F0-9]{2})+$/.test(configured.slice(4))) {
            throw new Error('Capacity evidence signing key has invalid hex encoding.');
        }
        return Buffer.from(configured.slice(4), 'hex');
    }

    return Buffer.from(configured, 'utf8');
}

function validBase64(value) {
    return value.length > 0
        && value.length % 4 === 0
        && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function normalize(value, depth) {
    if (depth > 20) throw new Error('Capacity evidence nesting exceeds the safety limit.');
    if (Array.isArray(value)) return value.map((item) => normalize(item, depth + 1));
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(key)) {
                throw new Error('Capacity evidence contains an invalid object key.');
            }
            return [key, normalize(value[key], depth + 1)];
        }));
    }
    if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    throw new Error('Capacity evidence contains an unsupported value.');
}

const invokedDirectly = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) await main();
