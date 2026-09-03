import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readBoundedJson } from './capacity-file.mjs';
import { isRfc3339 } from './capacity-contract.mjs';

export function validateCapacityEvidence(evidence, now = new Date(), options = {}) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error('Capacity evidence verification clock is invalid.');
    }
    const contract = normalizeContract(options);
    const fields = [
        'schema_version', 'test_id', 'generated_at', 'profile', 'capacity_scope',
        'environment', 'release', 'infrastructure_profile', 'source_provider',
        'application_instances', 'base_origin', 'requested_start_rps',
        'requested_target_rps', 'observed_requests_per_second', 'p95_ms',
        'p99_ms', 'error_rate_percent', 'target_hold_seconds',
        'target_hold_requests_per_second', 'target_hold_p95_ms',
        'target_hold_p99_ms', 'target_hold_error_rate_percent',
        'dropped_iterations', 'thresholds_passed', 'reached_target',
        'qualifies_as_capacity_evidence', 'tested_requests_per_second',
        'recommended_operational_rps', 'operational_headroom_percent',
    ];
    assertOnlyFields(evidence, fields, 'Capacity evidence');
    assertRequiredFields(evidence, fields, 'Capacity evidence');
    const generatedAt = new Date(
        typeof evidence.generated_at === 'string' ? evidence.generated_at : 'invalid',
    );
    const ageMs = now.getTime() - generatedAt.getTime();
    const maximumAgeMs = 24 * 60 * 60 * 1_000;
    const maximumClockSkewMs = 5 * 60 * 1_000;
    let origin;

    try {
        origin = new URL(String(evidence.base_origin || ''));
    } catch {
        origin = null;
    }

    const requestedTargetRps = evidence.requested_target_rps;
    const requestedStartRps = evidence.requested_start_rps;
    const observedRps = evidence.observed_requests_per_second;
    const aggregateP95 = evidence.p95_ms;
    const aggregateP99 = evidence.p99_ms;
    const aggregateErrorRate = evidence.error_rate_percent;
    const holdSeconds = evidence.target_hold_seconds;
    const holdRps = evidence.target_hold_requests_per_second;
    const holdP95 = evidence.target_hold_p95_ms;
    const holdP99 = evidence.target_hold_p99_ms;
    const holdErrorRate = evidence.target_hold_error_rate_percent;

    const applicationInstances = evidence.application_instances;
    const headroomPercent = evidence.operational_headroom_percent;

    if (evidence.schema_version !== 3
        || evidence.profile !== 'capacity'
        || evidence.capacity_scope !== contract.expectedScope
        || !validIdentifier(evidence.test_id, 100)
        || !validIdentifier(evidence.environment, 32)
        || !validIdentifier(evidence.release, 128)
        || !validIdentifier(evidence.infrastructure_profile, 128)
        || !validIdentifier(evidence.source_provider, 64)
        || evidence.qualifies_as_capacity_evidence !== true
        || evidence.thresholds_passed !== true
        || evidence.reached_target !== true
        || !Number.isInteger(evidence.dropped_iterations)
        || evidence.dropped_iterations !== 0
        || !isRfc3339(evidence.generated_at)
        || !Number.isFinite(generatedAt.getTime())
        || ageMs < -maximumClockSkewMs
        || ageMs > maximumAgeMs
        || !(origin instanceof URL)
        || origin.protocol !== 'https:'
        || origin.username !== ''
        || origin.password !== ''
        || origin.pathname !== '/'
        || origin.search !== ''
        || origin.hash !== ''
        || !integerBetween(requestedTargetRps, 1, 1_000_000)
        || !integerBetween(requestedStartRps, 1, 1_000_000)
        || !decimalBetween(observedRps, 0.001, 1_000_000, 3)
        || !decimalBetween(aggregateP95, 0.001, 300_000, 2)
        || !decimalBetween(aggregateP99, 0.001, 300_000, 2)
        || !decimalBetween(aggregateErrorRate, 0, 100, 4)
        || !Number.isInteger(holdSeconds)
        || holdSeconds < 1
        || holdSeconds > 86_400
        || !decimalBetween(holdRps, 1, 1_000_000, 3)
        || !decimalBetween(holdP95, 0.001, 300_000, 2)
        || !decimalBetween(holdP99, 0.001, 300_000, 2)
        || !decimalBetween(holdErrorRate, 0, 100, 4)
        || !Number.isInteger(applicationInstances)
        || applicationInstances < 1
        || applicationInstances > 1_000
        || (contract.expectedApplicationInstances !== null
            && applicationInstances !== contract.expectedApplicationInstances)
        || !Number.isInteger(headroomPercent)
        || headroomPercent < 10
        || headroomPercent > 60
        || headroomPercent !== contract.operationalHeadroomPercent
        || requestedStartRps > requestedTargetRps
        || aggregateP99 < aggregateP95
        || aggregateP95 >= contract.p95LimitMs
        || aggregateP99 >= contract.p99LimitMs
        || aggregateErrorRate >= contract.maximumErrorRatePercent
        || holdSeconds < contract.minimumHoldSeconds
        || holdRps < requestedTargetRps * 0.95
        || holdP95 >= contract.p95LimitMs
        || holdP99 < holdP95
        || holdP99 >= contract.p99LimitMs
        || holdErrorRate >= contract.maximumErrorRatePercent) {
        throw new Error('Capacity evidence is incomplete, stale, or did not pass every safety gate.');
    }

    const testedRps = evidence.tested_requests_per_second;
    const operationalRps = evidence.recommended_operational_rps;

    if (!integerBetween(testedRps, 1, 1_000_000)
        || !integerBetween(operationalRps, 1, 1_000_000)
        || testedRps > requestedTargetRps
        || testedRps > holdRps
        || operationalRps !== Math.max(1, Math.floor(testedRps * ((100 - headroomPercent) / 100)))) {
        throw new Error('Capacity evidence contains an invalid RPS recommendation.');
    }

    const tested = Math.floor(testedRps);
    const recommendation = Math.floor(operationalRps);

    return {
        tested,
        recommendation,
        line: `${performanceEvidenceKey(contract.expectedScope)}=${tested}`,
    };
}

export function capacityEvidenceContractFromEnvironment(environment = process.env) {
    return normalizeContract({
        expectedScope: environment.CAPACITY_EVIDENCE_EXPECTED_SCOPE || 'public_read',
        p95LimitMs: optionalNumber(environment.CAPACITY_EVIDENCE_P95_LIMIT_MS),
        p99LimitMs: optionalNumber(environment.CAPACITY_EVIDENCE_P99_LIMIT_MS),
        maximumErrorRatePercent: optionalNumber(environment.CAPACITY_EVIDENCE_MAX_ERROR_PERCENT),
        minimumHoldSeconds: optionalNumber(environment.CAPACITY_EVIDENCE_MIN_HOLD_SECONDS),
        operationalHeadroomPercent: optionalNumber(environment.CAPACITY_OPERATIONAL_HEADROOM_PERCENT),
        expectedApplicationInstances: optionalNumber(environment.CAPACITY_EVIDENCE_EXPECTED_INSTANCES),
    });
}

function normalizeContract(options) {
    const contract = {
        expectedScope: options.expectedScope ?? 'public_read',
        p95LimitMs: options.p95LimitMs ?? 300,
        p99LimitMs: options.p99LimitMs ?? 800,
        maximumErrorRatePercent: options.maximumErrorRatePercent ?? 1,
        minimumHoldSeconds: options.minimumHoldSeconds ?? 300,
        operationalHeadroomPercent: options.operationalHeadroomPercent ?? 25,
        expectedApplicationInstances: options.expectedApplicationInstances ?? null,
    };
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(String(contract.expectedScope))
        || !integerBetween(contract.p95LimitMs, 1, 300_000)
        || !integerBetween(contract.p99LimitMs, contract.p95LimitMs, 300_000)
        || !numberBetween(contract.maximumErrorRatePercent, 0.01, 100)
        || !integerBetween(contract.minimumHoldSeconds, 180, 3_600)
        || !integerBetween(contract.operationalHeadroomPercent, 10, 60)
        || (contract.expectedApplicationInstances !== null
            && !integerBetween(contract.expectedApplicationInstances, 1, 1_000))) {
        throw new Error('Capacity evidence verification contract is invalid.');
    }

    return contract;
}

function optionalNumber(value) {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim();
    const number = Number(normalized);

    return /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(number)
        ? number
        : Number.NaN;
}

function performanceEvidenceKey(scope) {
    return ({
        public_read: 'PERFORMANCE_PUBLIC_READ_TESTED_RPS',
        booking_checkout: 'PERFORMANCE_BOOKING_TESTED_RPS',
        admin: 'PERFORMANCE_ADMIN_TESTED_RPS',
        authentication: 'PERFORMANCE_AUTH_TESTED_RPS',
        write: 'PERFORMANCE_WRITE_TESTED_RPS',
    })[scope] || `PERFORMANCE_${scope.toUpperCase()}_TESTED_RPS`;
}

function assertOnlyFields(value, allowed, label) {
    if (!value || Array.isArray(value) || typeof value !== 'object'
        || Object.keys(value).some((field) => !allowed.includes(field))) {
        throw new Error(`${label} contains unsupported fields.`);
    }
}

function assertRequiredFields(value, required, label) {
    if (required.some((field) => !Object.hasOwn(value, field))) {
        throw new Error(`${label} is missing required fields.`);
    }
}

function validIdentifier(value, maximum) {
    if (typeof value !== 'string') return false;
    const normalized = value;

    return normalized.length > 0
        && normalized.length <= maximum
        && /^[a-zA-Z0-9][a-zA-Z0-9_.:/+\-]{0,127}$/.test(normalized);
}

function numberBetween(value, minimum, maximum) {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= minimum
        && value <= maximum;
}

function integerBetween(value, minimum, maximum) {
    return typeof value === 'number'
        && Number.isSafeInteger(value)
        && value >= minimum
        && value <= maximum;
}

function decimalBetween(value, minimum, maximum, places) {
    if (!numberBetween(value, minimum, maximum)) return false;

    return Math.abs(value - (Math.round(value * (10 ** places)) / (10 ** places))) <= 1e-9;
}

async function main() {
    const path = process.argv[2] || 'artifacts/capacity-evidence.json';
    const evidence = await readBoundedJson(path, 65_536, 'Capacity evidence file');
    const { tested, recommendation, line } = validateCapacityEvidence(
        evidence,
        new Date(),
        capacityEvidenceContractFromEnvironment(),
    );

    console.log(line);

    if (process.env.GITHUB_OUTPUT) {
        const { appendFile } = await import('node:fs/promises');
        await appendFile(process.env.GITHUB_OUTPUT, `tested_rps=${tested}\nrecommended_operational_rps=${recommendation}\n`, 'utf8');
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
        const { appendFile } = await import('node:fs/promises');
        await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            `\n## Public-read capacity evidence\n\n\`${line}\`\n\nProven: ${tested} req/s. Recommended operating ceiling: ${recommendation} req/s (${100 - Number(evidence.operational_headroom_percent)}%). Global capacity remains unset until a representative mixed-workload test passes.\n`,
            'utf8',
        );
    }
}

const invokedDirectly = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
    await main();
}
