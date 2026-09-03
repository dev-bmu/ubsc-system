import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const acknowledgement = __ENV.LOAD_TEST_ACKNOWLEDGEMENT || '';
const profile = (__ENV.LOAD_TEST_PROFILE || 'smoke').toLowerCase();
const startRps = requiredBoundedInteger(
    __ENV.LOAD_TEST_START_RPS,
    'LOAD_TEST_START_RPS',
    1,
    2_000,
);
const targetRps = requiredBoundedInteger(
    __ENV.LOAD_TEST_TARGET_RPS,
    'LOAD_TEST_TARGET_RPS',
    startRps,
    2_000,
);
const applicationInstances = requiredBoundedInteger(
    __ENV.LOAD_TEST_APP_INSTANCES,
    'LOAD_TEST_APP_INSTANCES',
    1,
    1_000,
);
const operationalHeadroomPercent = boundedInteger(__ENV.LOAD_TEST_HEADROOM_PERCENT, 10, 60, 25);
const testId = requiredIdentifier(__ENV.LOAD_TEST_ID, 'LOAD_TEST_ID', 100);
const targetEnvironment = requiredIdentifier(__ENV.LOAD_TEST_ENVIRONMENT, 'LOAD_TEST_ENVIRONMENT', 32);
const release = requiredIdentifier(__ENV.LOAD_TEST_RELEASE, 'LOAD_TEST_RELEASE', 128);
const infrastructureProfile = requiredIdentifier(__ENV.LOAD_TEST_INFRASTRUCTURE_PROFILE, 'LOAD_TEST_INFRASTRUCTURE_PROFILE', 128);
const sourceProvider = requiredIdentifier(__ENV.LOAD_TEST_SOURCE_PROVIDER || 'github-actions', 'LOAD_TEST_SOURCE_PROVIDER', 64);
const safetyMaxVus = boundedInteger(
    __ENV.LOAD_TEST_MAX_VUS,
    Math.max(10, targetRps),
    5_000,
    Math.max(50, targetRps * 3),
);
const baseUrl = normalizedBaseUrl(__ENV.LOAD_TEST_BASE_URL || '');
const allowedOrigins = uniqueAllowedOrigins(__ENV.LOAD_TEST_ALLOWED_ORIGINS || '');
const publicPaths = uniquePaths(
    (__ENV.LOAD_TEST_PATHS || '/,/about,/pricing,/booking,/news').split(','),
);
const capacityTargetHoldStartsAtMs = 6 * 60 * 1_000;
const capacityTargetHoldEndsAtMs = 11 * 60 * 1_000;
const capacityTargetHoldSeconds = (
    capacityTargetHoldEndsAtMs - capacityTargetHoldStartsAtMs
) / 1_000;

if (acknowledgement !== 'I_HAVE_AUTHORIZATION') {
    throw new Error('LOAD_TEST_ACKNOWLEDGEMENT must equal I_HAVE_AUTHORIZATION.');
}

if (!allowedOrigins.includes(baseUrl)) {
    throw new Error('LOAD_TEST_BASE_URL is not present in LOAD_TEST_ALLOWED_ORIGINS.');
}

if (!['smoke', 'baseline', 'capacity'].includes(profile)) {
    throw new Error('LOAD_TEST_PROFILE must be smoke, baseline, or capacity.');
}

export const options = {
    discardResponseBodies: true,
    noConnectionReuse: false,
    userAgent: 'UBSC-Authorized-Capacity-Test/1.0',
    scenarios: scenario(profile),
    thresholds: thresholds(profile),
    summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
    const readiness = http.get(`${baseUrl}/health/ready`, {
        redirects: 0,
        responseType: 'text',
        tags: { surface: 'readiness', route: 'readiness' },
        timeout: '8s',
    });
    const ready = check(readiness, {
        'preflight readiness is HTTP 200': (response) => response.status === 200,
        'preflight readiness contract is valid': (response) => {
            try {
                return response.json('status') === 'ready';
            } catch {
                return false;
            }
        },
    });

    if (!ready) {
        fail('Target is not ready; capacity traffic was not started.');
    }

    return { scenarioStartedAtMs: Date.now() };
}

export default function (context) {
    const path = publicPaths[(__VU + __ITER) % publicPaths.length];
    const phase = requestPhase(context?.scenarioStartedAtMs);
    const response = http.get(`${baseUrl}${path}`, {
        redirects: 0,
        tags: { surface: 'public', phase, route: routeTag(path) },
        timeout: '10s',
    });

    check(response, {
        'public response is HTTP 200': (candidate) => candidate.status === 200,
        'public response is HTML': (candidate) => String(
            candidate.headers['Content-Type'] || '',
        ).toLowerCase().includes('text/html'),
    });

    if (profile === 'smoke') {
        sleep(0.25);
    }
}

export function handleSummary(data) {
    const httpRate = numberMetric(data, 'http_reqs{surface:public}', 'rate');
    const publicP95 = numberMetric(data, 'http_req_duration{surface:public}', 'p(95)');
    const publicP99 = numberMetric(data, 'http_req_duration{surface:public}', 'p(99)');
    const publicErrorRate = numberMetric(data, 'http_req_failed{surface:public}', 'rate') * 100;
    const holdCount = numberMetric(
        data,
        'http_reqs{surface:public,phase:target_hold}',
        'count',
    );
    const holdRps = profile === 'capacity'
        ? holdCount / capacityTargetHoldSeconds
        : 0;
    const holdP95 = numberMetric(
        data,
        'http_req_duration{surface:public,phase:target_hold}',
        'p(95)',
    );
    const holdP99 = numberMetric(
        data,
        'http_req_duration{surface:public,phase:target_hold}',
        'p(99)',
    );
    const holdErrorRate = numberMetric(
        data,
        'http_req_failed{surface:public,phase:target_hold}',
        'rate',
    ) * 100;
    const droppedIterations = numberMetric(data, 'dropped_iterations', 'count');
    const thresholdsPassed = Object.values(data.metrics).every((metric) => (
        !metric.thresholds
        || Object.values(metric.thresholds).every((threshold) => threshold.ok !== false)
    ));
    const reachedTarget = profile !== 'capacity'
        || holdRps >= targetRps * 0.95;
    const qualifies = profile === 'capacity'
        && thresholdsPassed
        && reachedTarget
        && droppedIterations === 0;
    const testedRps = qualifies
        ? Math.max(1, Math.floor(Math.min(holdRps, targetRps)))
        : null;
    const evidence = {
        schema_version: 3,
        test_id: testId,
        generated_at: new Date().toISOString(),
        profile,
        capacity_scope: 'public_read',
        environment: targetEnvironment,
        release,
        infrastructure_profile: infrastructureProfile,
        source_provider: sourceProvider,
        application_instances: applicationInstances,
        base_origin: baseUrl,
        requested_start_rps: startRps,
        requested_target_rps: targetRps,
        observed_requests_per_second: round(httpRate, 3),
        p95_ms: round(publicP95, 2),
        p99_ms: round(publicP99, 2),
        error_rate_percent: round(publicErrorRate, 4),
        target_hold_seconds: profile === 'capacity' ? capacityTargetHoldSeconds : null,
        target_hold_requests_per_second: profile === 'capacity' ? round(holdRps, 3) : null,
        target_hold_p95_ms: profile === 'capacity' ? round(holdP95, 2) : null,
        target_hold_p99_ms: profile === 'capacity' ? round(holdP99, 2) : null,
        target_hold_error_rate_percent: profile === 'capacity'
            ? round(holdErrorRate, 4)
            : null,
        dropped_iterations: droppedIterations,
        thresholds_passed: thresholdsPassed,
        reached_target: reachedTarget,
        qualifies_as_capacity_evidence: qualifies,
        tested_requests_per_second: testedRps,
        recommended_operational_rps: testedRps === null
            ? null
            : Math.max(1, Math.floor(testedRps * ((100 - operationalHeadroomPercent) / 100))),
        operational_headroom_percent: operationalHeadroomPercent,
    };

    return {
        stdout: `${JSON.stringify(evidence, null, 2)}\n`,
        'artifacts/k6-summary.json': JSON.stringify(data, null, 2),
        'artifacts/capacity-evidence.json': `${JSON.stringify(evidence, null, 2)}\n`,
    };
}

function thresholds(selectedProfile) {
    const contract = {
        checks: ['rate>0.99'],
        http_req_failed: ['rate<0.01'],
        'http_req_failed{surface:public}': ['rate<0.01'],
        'http_reqs{surface:public}': ['rate>0'],
        'http_req_duration{surface:public}': ['p(95)<300', 'p(99)<800'],
        'http_req_duration{surface:readiness}': ['p(95)<500', 'p(99)<1000'],
        dropped_iterations: ['count==0'],
    };

    if (selectedProfile === 'capacity') {
        contract['http_reqs{surface:public,phase:target_hold}'] = ['count>0'];
        contract['http_req_failed{surface:public,phase:target_hold}'] = ['rate<0.01'];
        contract['http_req_duration{surface:public,phase:target_hold}'] = [
            'p(95)<300',
            'p(99)<800',
        ];
    }

    return contract;
}

function requestPhase(scenarioStartedAtMs) {
    if (profile !== 'capacity') {
        return profile;
    }

    const elapsedMs = Date.now() - Number(scenarioStartedAtMs || Date.now());

    return elapsedMs >= capacityTargetHoldStartsAtMs
        && elapsedMs < capacityTargetHoldEndsAtMs
        ? 'target_hold'
        : 'ramp';
}

function scenario(selectedProfile) {
    if (selectedProfile === 'smoke') {
        return {
            smoke: {
                executor: 'constant-vus',
                vus: 1,
                duration: '30s',
                gracefulStop: '10s',
            },
        };
    }

    if (selectedProfile === 'baseline') {
        return {
            baseline: {
                executor: 'constant-arrival-rate',
                rate: startRps,
                timeUnit: '1s',
                duration: '2m',
                preAllocatedVUs: Math.max(10, startRps * 2),
                maxVUs: safetyMaxVus,
                gracefulStop: '30s',
            },
        };
    }

    return {
        capacity: {
            executor: 'ramping-arrival-rate',
            startRate: startRps,
            timeUnit: '1s',
            preAllocatedVUs: Math.max(20, startRps * 2),
            maxVUs: safetyMaxVus,
            stages: [
                { target: startRps, duration: '1m' },
                { target: targetRps, duration: '5m' },
                { target: targetRps, duration: '5m' },
                { target: 0, duration: '30s' },
            ],
            gracefulStop: '30s',
        },
    };
}

function normalizedBaseUrl(value) {
    if (!value) {
        throw new Error('LOAD_TEST_BASE_URL is required.');
    }

    const normalized = String(value).trim().replace(/\/+$/, '');
    const match = normalized.match(/^(https?):\/\/([^/?#]+)$/i);

    if (!match || match[2].includes('@')) {
        throw new Error('LOAD_TEST_BASE_URL must be a credential-free HTTP(S) origin.');
    }

    const scheme = match[1].toLowerCase();
    const authority = match[2];
    const hostname = authority.startsWith('[')
        ? authority.slice(1, authority.indexOf(']'))
        : authority.split(':')[0];
    const local = ['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase());

    if (scheme !== 'https' && !(scheme === 'http' && local)) {
        throw new Error('Remote load tests require HTTPS.');
    }

    return `${scheme}://${authority}`;
}

function uniquePaths(values) {
    const paths = [...new Set(values.map((value) => value.trim()).filter(Boolean))];

    if (paths.length === 0 || paths.length > 20) {
        throw new Error('LOAD_TEST_PATHS must contain between one and twenty paths.');
    }

    for (const path of paths) {
        if (!/^\/[a-zA-Z0-9/_-]*$/.test(path)
            || path.startsWith('//')
            || path.includes('..')) {
            throw new Error(`Unsafe load-test path: ${path}`);
        }
    }

    return paths;
}

function routeTag(path) {
    return path === '/' ? 'home' : path.slice(1).replace(/[^a-z0-9-]/gi, '-').slice(0, 40);
}

function boundedInteger(value, minimum, maximum, fallback) {
    const parsed = Number(value);
    const safeFallback = Math.min(maximum, Math.max(minimum, Math.trunc(fallback)));

    return Number.isFinite(parsed)
        ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
        : safeFallback;
}

function requiredBoundedInteger(value, name, minimum, maximum) {
    const normalized = String(value || '').trim();
    const parsed = Number(normalized);

    if (!/^[0-9]+$/.test(normalized)
        || !Number.isSafeInteger(parsed)
        || parsed < minimum
        || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
    }

    return parsed;
}

function uniqueAllowedOrigins(value) {
    const origins = [...new Set(
        String(value).split(',').map((origin) => origin.trim()).filter(Boolean),
    )].map(normalizedBaseUrl);

    if (origins.length < 1 || origins.length > 10) {
        throw new Error('LOAD_TEST_ALLOWED_ORIGINS must contain between one and ten exact origins.');
    }

    return origins;
}

function requiredIdentifier(value, name, maximum) {
    const normalized = String(value || '').trim();

    if (!normalized
        || normalized.length > maximum
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/+\-]{0,127}$/.test(normalized)) {
        throw new Error(`${name} is required and must be a bounded identifier.`);
    }

    return normalized;
}

function numberMetric(data, name, key) {
    const value = data.metrics?.[name]?.values?.[key];

    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function round(value, precision) {
    const factor = 10 ** precision;

    return Math.round(value * factor) / factor;
}
