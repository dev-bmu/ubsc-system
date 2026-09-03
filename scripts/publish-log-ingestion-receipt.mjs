#!/usr/bin/env node

import { createSign, randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import process from 'node:process';

const [
    operationId = '',
    sourceEventSha256 = '',
    privateKeyPath = '',
    keyId = '',
    outputPath = '',
] = process.argv.slice(2);
const baseUrl = new URL(process.env.UBSC_LOG_RECEIPT_BASE_URL || '');
const provider = (process.env.UBSC_LOG_RECEIPT_PROVIDER || '').trim().toLowerCase();
const environment = (process.env.UBSC_LOG_RECEIPT_ENVIRONMENT || '').trim().toLowerCase();
const release = (process.env.UBSC_LOG_RECEIPT_RELEASE || '').trim();
const retentionDays = Number.parseInt(process.env.UBSC_LOG_RETENTION_DAYS || '90', 10);

if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
    || !['', '/'].includes(baseUrl.pathname) || baseUrl.search || baseUrl.hash) {
    throw new Error('UBSC_LOG_RECEIPT_BASE_URL must be a credential-free HTTPS origin.');
}
for (const [label, value, maximum] of [
    ['operation ID', operationId, 100],
    ['provider', provider, 64],
    ['environment', environment, 32],
    ['release', release, 128],
    ['key ID', keyId, 32],
]) {
    if (!new RegExp(`^[a-zA-Z0-9][a-zA-Z0-9_.:+/-]{0,${maximum - 1}}$`).test(value)) {
        throw new Error(`The log receipt ${label} is invalid.`);
    }
}
if (!/^[a-f0-9]{64}$/.test(sourceEventSha256)) {
    throw new Error('The retained source-event SHA-256 is invalid.');
}
if (!Number.isSafeInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650) {
    throw new Error('UBSC_LOG_RETENTION_DAYS must be between 30 and 3650.');
}

const privateKey = await readFile(privateKeyPath, 'utf8');
if (privateKey.length > 65536 || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('A bounded PEM private signing key is required.');
}

const ingestedAt = new Date();
const retentionUntil = new Date(ingestedAt.getTime());
retentionUntil.setUTCDate(retentionUntil.getUTCDate() + retentionDays);
const payload = {
    schema_version: 1,
    receipt_id: randomUUID(),
    operation_id: operationId,
    event: 'observability.canary',
    provider,
    environment,
    release,
    ingested_at: ingestedAt.toISOString(),
    retention_until: retentionUntil.toISOString(),
    source_event_sha256: sourceEventSha256,
};
const canonicalPayload = canonicalJson(payload);
const signer = createSign('SHA256');
signer.update(canonicalPayload);
signer.end();
const envelope = {
    schema_version: 1,
    key_id: keyId,
    payload,
    signature: signer.sign(privateKey).toString('base64'),
};
const body = JSON.stringify(envelope);
if (Buffer.byteLength(body) > 32768) {
    throw new Error('The signed log receipt exceeds its transport boundary.');
}

if (outputPath) {
    const handle = await open(outputPath, 'wx', 0o600);
    try {
        await handle.writeFile(`${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
        await handle.sync();
    } finally {
        await handle.close();
    }
    process.stdout.write(`Provider-signed log receipt written to ${outputPath}.\n`);
    process.exit(0);
}

const endpoint = new URL('/monitoring/log-receipts', baseUrl);
const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'UBSC-OffHost-Log-Receipt/1.0',
    },
    body,
    signal: AbortSignal.timeout(8000),
});
if (![200, 202].includes(response.status)) {
    await response.body?.cancel();
    throw new Error(`Log receipt ingestion returned HTTP ${response.status}.`);
}
const result = await response.json();
if (result?.accepted !== true || typeof result?.duplicate !== 'boolean') {
    throw new Error('Log receipt ingestion returned an invalid acknowledgement.');
}

process.stdout.write(`Provider-signed log receipt accepted for ${operationId}.\n`);

function canonicalJson(value, depth = 0) {
    if (depth > 12) throw new Error('Log receipt nesting exceeds the safety limit.');
    if (Array.isArray(value)) {
        if (value.length > 32) throw new Error('Log receipt collection exceeds the safety limit.');
        return `[${value.map((item) => canonicalJson(item, depth + 1)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        if (keys.length > 32) throw new Error('Log receipt collection exceeds the safety limit.');
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`).join(',')}}`;
    }
    if (typeof value === 'string') {
        if (value.length > 4096) throw new Error('Log receipt string exceeds the safety limit.');
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) throw new Error('Log receipt numbers must be safe integers.');
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean' || value === null) return JSON.stringify(value);
    throw new Error('Log receipt contains an unsupported value.');
}
