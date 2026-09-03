import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const clamp = (value, minimum, maximum, fallback) => {
    const parsed = Number(value);

    return Number.isFinite(parsed)
        ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
        : fallback;
};

const sleep = (milliseconds) => new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
});

const baseUrl = normalizeBaseUrl(process.env.UBSC_BASE_URL);
const timeoutMs = clamp(process.env.UPTIME_TIMEOUT_MS, 1_000, 30_000, 8_000);
const maxLatencyMs = clamp(process.env.UPTIME_MAX_LATENCY_MS, 250, 30_000, 5_000);
const attempts = clamp(process.env.UPTIME_ATTEMPTS, 1, 5, 3);
const outputPath = resolve(process.env.UPTIME_RESULT_PATH || 'artifacts/uptime-result.json');
const endpointPaths = [...new Set((process.env.UPTIME_PATHS || '/up,/health/ready,/')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))];

if (endpointPaths.length === 0 || endpointPaths.length > 10) {
    throw new Error('UPTIME_PATHS must contain between one and ten paths.');
}

const startedAt = new Date();
const checks = [];

for (const endpointPath of endpointPaths) {
    checks.push(await probeEndpoint(endpointPath));
}

const healthy = checks.every((check) => check.healthy);
const result = {
    schema_version: 1,
    status: healthy ? 'operational' : 'outage',
    checked_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
    base_origin: baseUrl.origin,
    checks,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8' });
await writeStepSummary(result);
await writeActionOutput('probe_status', result.status);

console.log(JSON.stringify(result));
process.exitCode = healthy ? 0 : 1;

async function probeEndpoint(endpointPath) {
    const url = endpointUrl(endpointPath);
    let lastFailure = 'Probe did not run.';
    let lastStatus = null;
    let lastLatency = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const requestStartedAt = performance.now();

        try {
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                cache: 'no-store',
                headers: {
                    accept: endpointPath === '/health/ready'
                        ? 'application/json'
                        : 'text/html,application/json;q=0.9,*/*;q=0.1',
                    'user-agent': 'UBSC-External-Availability/1.0',
                    'x-ubsc-synthetic-check': 'external-availability',
                },
                signal: AbortSignal.timeout(timeoutMs),
            });
            const latencyMs = Math.max(0, Math.round(performance.now() - requestStartedAt));
            lastStatus = response.status;
            lastLatency = latencyMs;
            const validPayload = await validatePayload(endpointPath, response);

            if (response.ok && validPayload && latencyMs <= maxLatencyMs) {
                return {
                    path: endpointPath,
                    healthy: true,
                    status_code: response.status,
                    latency_ms: latencyMs,
                    attempts: attempt,
                    failure: null,
                };
            }

            lastFailure = !response.ok
                ? `Unexpected HTTP status ${response.status}.`
                : (!validPayload
                    ? 'Response payload did not satisfy the endpoint contract.'
                    : `Latency exceeded ${maxLatencyMs} ms.`);
        } catch (error) {
            lastLatency = Math.max(0, Math.round(performance.now() - requestStartedAt));
            lastFailure = error instanceof Error && error.name === 'TimeoutError'
                ? `Request exceeded ${timeoutMs} ms.`
                : 'Network request failed.';
        }

        if (attempt < attempts) {
            await sleep(Math.min(4_000, 500 * (2 ** (attempt - 1))));
        }
    }

    return {
        path: endpointPath,
        healthy: false,
        status_code: lastStatus,
        latency_ms: lastLatency,
        attempts,
        failure: lastFailure,
    };
}

async function validatePayload(endpointPath, response) {
    if (endpointPath !== '/health/ready' || !response.ok) {
        await response.body?.cancel();

        return true;
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.toLowerCase().includes('application/json')) {
        return false;
    }

    try {
        const payload = await response.json();

        return payload?.status === 'ready' && typeof payload?.checked_at === 'string';
    } catch {
        return false;
    }
}

function normalizeBaseUrl(value) {
    if (!value) {
        throw new Error('UBSC_BASE_URL is required.');
    }

    const url = new URL(value);
    const allowHttp = process.env.UPTIME_ALLOW_HTTP === 'true';
    const localHttp = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

    if (url.username || url.password) {
        throw new Error('UBSC_BASE_URL must not contain credentials.');
    }

    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (allowHttp || localHttp))) {
        throw new Error('External probes require HTTPS.');
    }

    url.pathname = '/';
    url.search = '';
    url.hash = '';

    return url;
}

function endpointUrl(endpointPath) {
    const url = new URL(endpointPath, baseUrl);

    if (url.origin !== baseUrl.origin) {
        throw new Error('Every uptime path must remain on UBSC_BASE_URL.');
    }

    return url;
}

async function writeActionOutput(key, value) {
    if (process.env.GITHUB_OUTPUT) {
        await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, { encoding: 'utf8' });
    }
}

async function writeStepSummary(result) {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }

    const rows = result.checks.map((check) => [
        check.path,
        check.healthy ? 'operational' : 'outage',
        check.status_code ?? 'network',
        check.latency_ms === null ? 'n/a' : `${check.latency_ms} ms`,
        check.attempts,
    ].join(' | '));
    const markdown = [
        `## UBSC external availability: ${result.status}`,
        '',
        'Path | Status | HTTP | Latency | Attempts',
        '--- | --- | ---: | ---: | ---:',
        ...rows,
        '',
    ].join('\n');

    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, { encoding: 'utf8' });
}
