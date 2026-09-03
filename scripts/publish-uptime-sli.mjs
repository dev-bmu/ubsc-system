import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const resultPath = process.env.UPTIME_RESULT_PATH || 'artifacts/uptime-result.json';
const baseUrl = new URL(process.env.UBSC_BASE_URL || '');
const keyId = process.env.UBSC_EXTERNAL_SLI_KEY_ID?.trim() || '';
const encodedKey = process.env.UBSC_EXTERNAL_SLI_SIGNING_KEY || '';
const probeId = `github-${process.env.GITHUB_RUN_ID || 'manual'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;

if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password) {
    throw new Error('UBSC_BASE_URL must be a credential-free HTTPS origin.');
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(keyId)) {
    throw new Error('UBSC_EXTERNAL_SLI_KEY_ID is missing or invalid.');
}

const key = encodedKey.startsWith('base64:')
    ? Buffer.from(encodedKey.slice(7), 'base64')
    : Buffer.from(encodedKey, 'utf8');
if (key.byteLength < 32) {
    throw new Error('UBSC_EXTERNAL_SLI_SIGNING_KEY must contain at least 32 bytes.');
}

const body = await readFile(resultPath, 'utf8');
const timestamp = Math.floor(Date.now() / 1000).toString();
const bodyHash = createHash('sha256').update(body).digest('hex');
const canonical = `v1\n${timestamp}\n${probeId}\n${bodyHash}`;
const signature = createHmac('sha256', key).update(canonical).digest('hex');
const endpoint = new URL('/monitoring/external-sli', baseUrl);
const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'UBSC-External-Availability/1.0',
        'x-ubsc-synthetic-id': probeId,
        'x-ubsc-synthetic-key-id': keyId,
        'x-ubsc-synthetic-timestamp': timestamp,
        'x-ubsc-synthetic-signature': `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(8_000),
});

if (![200, 202].includes(response.status)) {
    await response.body?.cancel();
    throw new Error(`External SLI ingestion returned HTTP ${response.status}.`);
}

const receipt = await response.json();
if (receipt?.accepted !== true || !['operational', 'outage'].includes(receipt?.status)) {
    throw new Error('External SLI ingestion returned an invalid receipt.');
}

console.log(`Authenticated external SLI receipt accepted (${receipt.status}).`);
