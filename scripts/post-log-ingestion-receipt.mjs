#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const [envelopePath = ''] = process.argv.slice(2);
const baseUrl = new URL(process.env.UBSC_LOG_RECEIPT_BASE_URL || '');
const attempts = Number.parseInt(process.env.UBSC_LOG_RECEIPT_POST_ATTEMPTS || '3', 10);
const maximumBytes = Number.parseInt(process.env.UBSC_LOG_RECEIPT_MAX_BYTES || '32768', 10);

if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
    || !['', '/'].includes(baseUrl.pathname) || baseUrl.search || baseUrl.hash) {
    throw new Error('UBSC_LOG_RECEIPT_BASE_URL must be a credential-free HTTPS origin.');
}
if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error('UBSC_LOG_RECEIPT_POST_ATTEMPTS must be between 1 and 5.');
}
if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 4096 || maximumBytes > 131072) {
    throw new Error('UBSC_LOG_RECEIPT_MAX_BYTES is outside the safety boundary.');
}

const metadata = await stat(envelopePath);
if (!metadata.isFile() || metadata.size < 128 || metadata.size > maximumBytes) {
    throw new Error('The durable log-receipt envelope has an invalid size.');
}
const body = await readFile(envelopePath, 'utf8');
const envelope = JSON.parse(body);
assertEnvelope(envelope);

const endpoint = new URL('/monitoring/log-receipts', baseUrl);
let lastFailure = 'Log receipt delivery failed.';
for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
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

        if ([200, 202].includes(response.status)) {
            const result = await response.json();
            if (result?.accepted !== true || typeof result?.duplicate !== 'boolean') {
                throw new Error('Log receipt ingestion returned an invalid acknowledgement.');
            }
            process.stdout.write(
                `Provider-signed log receipt acknowledged for ${envelope.payload.operation_id}.\n`,
            );
            process.exit(0);
        }

        await response.body?.cancel();
        if ([400, 401, 403, 413, 415, 422].includes(response.status)) {
            throw new PermanentDeliveryError(
                `Log receipt ingestion permanently rejected HTTP ${response.status}.`,
            );
        }
        lastFailure = `Log receipt ingestion returned retryable HTTP ${response.status}.`;
    } catch (error) {
        if (error instanceof PermanentDeliveryError) throw error;
        lastFailure = error instanceof Error ? error.message : lastFailure;
    }

    if (attempt < attempts) {
        await delay(250 * (2 ** (attempt - 1)));
    }
}

throw new Error(`${lastFailure} The durable envelope remains safe to replay.`);

class PermanentDeliveryError extends Error {}

function assertEnvelope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !hasExactKeys(value, ['key_id', 'payload', 'schema_version', 'signature'])
        || value.schema_version !== 1
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(value.key_id)
        || typeof value.signature !== 'string'
        || value.signature.length > 2048
        || !value.payload
        || typeof value.payload !== 'object'
        || Array.isArray(value.payload)
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(value.payload.operation_id || '')) {
        throw new Error('The durable log-receipt envelope is invalid.');
    }
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    return actual.length === expected.length
        && actual.every((key, index) => key === expected[index]);
}
