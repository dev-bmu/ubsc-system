import { createHmac, timingSafeEqual } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from './sign-capacity-evidence.mjs';
import { readBoundedJson } from './capacity-file.mjs';
import { isRfc3339 } from './capacity-contract.mjs';

export function verifyCapacityPlan(envelope, options = {}, now = new Date()) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error('Capacity plan verification clock is invalid.');
    }
    const expectedTargets = normalizeExpectedTargets(options.expectedTargets);
    const expectedEvidenceScopes = normalizeExpectedScopes(options.expectedEvidenceScopes);
    const expectedBounds = normalizeExpectedBounds(options.expectedBounds, expectedTargets);
    if (!validIdentifier(options.environment, 32)
        || !validIdentifier(options.release, 128)
        || !validIdentifier(options.infrastructureProfile, 128)
        || !validIdentifier(options.provider, 64)
        || expectedTargets.length < 1
        || expectedEvidenceScopes.length < 1
        || Object.keys(expectedBounds).length !== expectedTargets.length
        || (options.keys === undefined && !validIdentifier(options.keyId, 32))
        || options.scaleDownThresholdPercent === undefined
        || options.maximumScaleUpStep === undefined
        || options.maximumScaleUpPercent === undefined
        || options.maximumScaleDownStep === undefined) {
        throw new Error('The complete independent capacity adapter contract is required.');
    }
    const payload = envelope?.payload;
    const scaleDownThreshold = Number(options.scaleDownThresholdPercent);
    const maximumScaleUpStep = Number(options.maximumScaleUpStep);
    const maximumScaleUpPercent = Number(options.maximumScaleUpPercent);
    const maximumScaleDownStep = Number(options.maximumScaleDownStep);
    if (!integerBetween(scaleDownThreshold, 10, 60)) {
        throw new Error('Adapter scale-down threshold is invalid.');
    }
    if (!integerBetween(maximumScaleUpStep, 1, 100)
        || !integerBetween(maximumScaleUpPercent, 10, 200)
        || !integerBetween(maximumScaleDownStep, 1, 20)) {
        throw new Error('Adapter scaling step contract is invalid.');
    }
    assertOnlyFields(envelope, [
        'schema_version', 'key_id', 'payload', 'signature', 'persisted', 'reused',
    ], 'Signed capacity plan envelope');
    assertRequiredFields(envelope, ['schema_version', 'key_id', 'payload', 'signature'], 'Signed capacity plan envelope');
    assertExactFields(payload, [
        'schema_version', 'plan_id', 'input_hash', 'generated_at', 'expires_at', 'environment',
        'release', 'infrastructure_profile', 'provider', 'mode', 'status',
        'observation_id', 'evidence_id', 'evidence_ids', 'guardrails', 'targets',
        'reasons',
    ], 'Signed capacity plan payload');
    if (envelope?.schema_version !== 1
        || !payload
        || payload.schema_version !== 3
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(payload.plan_id || ''))
        || !/^[a-f0-9]{64}$/.test(String(payload.input_hash || ''))
        || !validIdentifier(payload.environment, 32)
        || !validIdentifier(payload.release, 128)
        || !validIdentifier(payload.infrastructure_profile, 128)
        || !validIdentifier(payload.provider, 64)
        || !isRfc3339(payload.generated_at)
        || !isRfc3339(payload.expires_at)
        || payload.mode !== 'signed_plan'
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(String(envelope.key_id || ''))
        || !/^[a-f0-9]{64}$/.test(String(envelope.signature || ''))) {
        throw new Error('Signed capacity plan envelope is malformed.');
    }
    if ((envelope.persisted !== undefined && typeof envelope.persisted !== 'boolean')
        || (envelope.reused !== undefined && typeof envelope.reused !== 'boolean')
        || !uuid(payload.observation_id)
        || !uuid(payload.evidence_id)
        || !validReasons(payload.reasons)) {
        throw new Error('Signed capacity plan metadata is malformed.');
    }
    if (!payload.evidence_ids || Array.isArray(payload.evidence_ids)
        || typeof payload.evidence_ids !== 'object'
        || Object.keys(payload.evidence_ids).length < 1
        || Object.keys(payload.evidence_ids).length > 32
        || Object.entries(payload.evidence_ids).some(([scope, evidenceId]) => (
            !/^[a-z][a-z0-9_]{0,31}$/.test(scope) || !uuid(evidenceId)
        ))
        || new Set(Object.values(payload.evidence_ids)).size
            !== Object.values(payload.evidence_ids).length) {
        throw new Error('Signed capacity plan evidence map is malformed.');
    }
    if (!Object.values(payload.evidence_ids).includes(payload.evidence_id)) {
        throw new Error('Signed capacity plan primary evidence is not present in its evidence map.');
    }
    const canonicalEvidenceScopes = Object.keys(payload.evidence_ids).sort();
    const expectedPrimaryEvidence = payload.evidence_ids.public_read
        ?? payload.evidence_ids[canonicalEvidenceScopes[0]];
    if (payload.evidence_id !== expectedPrimaryEvidence) {
        throw new Error('Signed capacity plan primary evidence does not match the canonical scope order.');
    }
    const reportedEvidenceScopes = Object.keys(payload.evidence_ids).sort();
    if (expectedEvidenceScopes.length > 0
        && (reportedEvidenceScopes.length !== expectedEvidenceScopes.length
            || reportedEvidenceScopes.some((scope, index) => scope !== expectedEvidenceScopes[index]))) {
        throw new Error('Capacity plan evidence scopes do not match the adapter contract.');
    }

    assertExactFields(payload.guardrails, [
        'safe', 'status', 'reason', 'connection_utilization_percent',
        'lock_waits_current', 'slow_queries_per_minute',
    ], 'Signed capacity plan guardrails');
    if (typeof payload.guardrails.safe !== 'boolean'
        || !['pass', 'blocked'].includes(payload.guardrails.status)
        || payload.guardrails.safe !== (payload.guardrails.status === 'pass')
        || typeof payload.guardrails.reason !== 'string'
        || payload.guardrails.reason.length < 1
        || payload.guardrails.reason.length > 160
        || !decimalOrNull(payload.guardrails.connection_utilization_percent, 0, 100, 2)
        || !integerOrNull(payload.guardrails.lock_waits_current, 0, 1_000_000)
        || !decimalOrNull(payload.guardrails.slow_queries_per_minute, 0, 1_000_000, 3)) {
        throw new Error('Signed capacity plan guardrails are malformed.');
    }

    for (const [field, expected] of [
        ['environment', options.environment],
        ['release', options.release],
        ['infrastructure_profile', options.infrastructureProfile],
        ['provider', options.provider],
    ]) {
        if (expected && payload[field] !== expected) {
            throw new Error(`Capacity plan ${field} does not match the adapter contract.`);
        }
    }

    const configuredKey = selectVerificationKey(options, envelope.key_id);
    const key = decodeKey(configuredKey);
    if (key.length < 32 || key.length > 4_096) {
        throw new Error('Capacity plan verification key is invalid.');
    }
    const expected = createHmac('sha256', key).update(canonicalJson(payload)).digest();
    const supplied = Buffer.from(envelope.signature, 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        throw new Error('Capacity plan signature is invalid.');
    }

    const generatedAt = new Date(payload.generated_at || 'invalid');
    const expiresAt = new Date(payload.expires_at || 'invalid');
    const ttlMs = expiresAt.getTime() - generatedAt.getTime();
    if (!Number.isFinite(generatedAt.getTime())
        || !Number.isFinite(expiresAt.getTime())
        || generatedAt.getTime() > now.getTime() + 30_000
        || expiresAt.getTime() <= now.getTime()
        || ttlMs < 30_000
        || ttlMs > 300_000) {
        throw new Error('Capacity plan is expired or has an invalid validity window.');
    }

    if (!payload.targets || Array.isArray(payload.targets) || typeof payload.targets !== 'object'
        || Object.keys(payload.targets).length > 64
        || !['actionable', 'hold', 'blocked'].includes(payload.status)) {
        throw new Error('Capacity plan target map or status is invalid.');
    }
    if (payload.status === 'blocked') {
        throw new Error('Blocked capacity plans are never eligible for provider application.');
    }

    const reportedTargets = Object.keys(payload.targets).sort();
    if (!reportedTargets.includes('web')
        || (expectedTargets.length > 0
            && (reportedTargets.length !== expectedTargets.length
                || reportedTargets.some((target, index) => target !== expectedTargets[index])))) {
        throw new Error('Capacity plan does not cover the adapter managed-target contract.');
    }

    const actions = {};
    const expectedStateTokens = {};
    let hasAction = false;
    for (const [name, target] of Object.entries(payload.targets)) {
        assertExactFields(target, [
            'kind', 'state_token', 'current_instances', 'ready_instances', 'minimum_instances',
            'maximum_instances', 'raw_recommendation', 'desired_instances',
            'load_percent', 'cpu_utilization_percent', 'memory_utilization_percent',
            'action', 'automation_eligible', 'capacity_limited', 'reasons',
        ], `Capacity plan target ${name}`);
        if (!/^(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})$/.test(name)
            || !target
            || typeof target !== 'object'
            || (name === 'web' ? target.kind !== 'web' : target.kind !== 'queue')
            || !/^[a-f0-9]{64}$/.test(String(target.state_token || ''))
            || !integerBetween(target.minimum_instances, 0, 1_000)
            || (target.kind === 'web' && target.minimum_instances < 2)
            || !integerBetween(target.maximum_instances, target.minimum_instances, 1_000)
            || !integerBetween(target.current_instances, 0, 1_000)
            || !integerBetween(target.ready_instances, 0, target.current_instances)
            || !integerBetween(target.raw_recommendation, target.minimum_instances, target.maximum_instances)
            || !integerBetween(target.desired_instances, 0, Math.max(target.current_instances, target.maximum_instances))
            || !decimalOrNull(target.load_percent, 0, 1_000_000, 2)
            || !decimalBetween(target.cpu_utilization_percent, 0, 100, 2)
            || !decimalBetween(target.memory_utilization_percent, 0, 100, 2)
            || !['hold', 'scale_up', 'scale_down'].includes(target.action)
            || typeof target.automation_eligible !== 'boolean'
            || typeof target.capacity_limited !== 'boolean'
            || !validReasons(target.reasons)) {
            throw new Error(`Capacity plan target ${name} violates its bounded schema.`);
        }

        const bound = expectedBounds[name];
        if (bound && (target.minimum_instances !== bound.minimum_instances
            || target.maximum_instances !== bound.maximum_instances)) {
            throw new Error(`Capacity plan target ${name} does not match the adapter bounds.`);
        }

        const boundedScaleUpStep = Math.min(
            maximumScaleUpStep,
            Math.max(1, Math.ceil(Math.max(1, target.current_instances) * (maximumScaleUpPercent / 100))),
        );
        const floorRecovery = target.current_instances < target.minimum_instances
            && target.desired_instances === target.minimum_instances
            && target.reasons.includes('minimum_capacity_floor_recovery');
        const directionIsValid = target.action === 'hold'
            ? target.desired_instances === target.current_instances
            : (target.action === 'scale_up'
                ? target.desired_instances > target.current_instances
                    && target.raw_recommendation > target.current_instances
                    && target.desired_instances <= target.raw_recommendation
                    && target.desired_instances >= target.minimum_instances
                    && (floorRecovery
                        || (target.desired_instances - target.current_instances) <= boundedScaleUpStep)
                : target.desired_instances < target.current_instances
                    && target.raw_recommendation < target.current_instances
                    && target.desired_instances >= target.raw_recommendation
                    && (target.current_instances - target.desired_instances) <= maximumScaleDownStep);
        if (!directionIsValid
            || (target.action === 'scale_up' && target.desired_instances > target.maximum_instances)
            || (target.action === 'scale_down' && target.desired_instances < target.minimum_instances)
            || (target.action === 'hold' && target.desired_instances !== target.current_instances)
            || (target.action !== 'hold' && target.automation_eligible !== true)
            || (target.action !== 'hold' && target.ready_instances !== target.current_instances)
            || (target.action === 'scale_down'
                && (target.load_percent === null
                    || target.load_percent > scaleDownThreshold
                    || target.cpu_utilization_percent > scaleDownThreshold
                    || target.memory_utilization_percent > scaleDownThreshold))) {
            throw new Error(`Capacity plan target ${name} has an unsafe action transition.`);
        }

        hasAction ||= target.action !== 'hold';
        if (target.action !== 'hold') {
            actions[name] = {
                action: target.action,
                current_instances: target.current_instances,
                desired_instances: target.desired_instances,
                minimum_instances: target.minimum_instances,
                maximum_instances: target.maximum_instances,
                load_percent: target.load_percent,
                cpu_utilization_percent: target.cpu_utilization_percent,
                memory_utilization_percent: target.memory_utilization_percent,
                state_token: target.state_token,
            };
        }
        expectedStateTokens[name] = target.state_token;
    }

    if ((hasAction && payload.status !== 'actionable')
        || (!hasAction && payload.status === 'actionable')
        || (hasAction && (payload.guardrails.safe !== true || payload.guardrails.status !== 'pass'))) {
        throw new Error('Capacity plan aggregate status does not match its target actions.');
    }

    return {
        plan_id: payload.plan_id,
        input_hash: payload.input_hash,
        expires_at: payload.expires_at,
        status: payload.status,
        actions,
        expected_state_tokens: expectedStateTokens,
    };
}

async function main() {
    const path = process.argv[2];
    if (!path) throw new Error('Usage: node verify-capacity-plan.mjs PLAN_FILE');
    const envelope = await readBoundedJson(path, 262_144, 'Capacity plan file');
    const expectedTargets = String(process.env.CAPACITY_MANAGED_TARGETS || '')
        .split(',')
        .map((target) => target.trim())
        .filter(Boolean);
    const expectedEvidenceScopes = String(process.env.CAPACITY_REQUIRED_EVIDENCE_SCOPES || '')
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean);
    const requiredContract = {
        environment: process.env.CAPACITY_TARGET_ENVIRONMENT,
        release: process.env.APP_RELEASE,
        infrastructureProfile: process.env.CAPACITY_INFRASTRUCTURE_PROFILE,
        provider: process.env.CAPACITY_PLATFORM_PROVIDER,
        scaleDownThresholdPercent: process.env.CAPACITY_SCALE_DOWN_THRESHOLD_PERCENT,
        maximumScaleUpStep: process.env.CAPACITY_MAX_SCALE_UP_STEP,
        maximumScaleUpPercent: process.env.CAPACITY_MAX_SCALE_UP_PERCENT,
        maximumScaleDownStep: process.env.CAPACITY_MAX_SCALE_DOWN_STEP,
    };
    const expectedBounds = parseExpectedBounds(process.env.CAPACITY_TARGET_BOUNDS);
    const keys = parseVerificationKeys(process.env.CAPACITY_PLAN_VERIFYING_KEYS);
    if (expectedTargets.length < 1
        || expectedEvidenceScopes.length < 1
        || Object.values(requiredContract).some((value) => typeof value !== 'string' || value.trim() === '')) {
        throw new Error('The complete capacity adapter identity, key, threshold, managed targets, and evidence scopes are required.');
    }
    const result = verifyCapacityPlan(envelope, {
        ...requiredContract,
        keys,
        expectedTargets,
        expectedEvidenceScopes,
        expectedBounds,
    });
    console.log(JSON.stringify(result));
}

function integerBetween(value, minimum, maximum) {
    return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function integerOrNull(value, minimum, maximum) {
    return value === null || value === undefined || integerBetween(value, minimum, maximum);
}

function numberBetween(value, minimum, maximum) {
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function decimalBetween(value, minimum, maximum, places) {
    if (!numberBetween(value, minimum, maximum)) return false;

    return Math.abs(value - (Math.round(value * (10 ** places)) / (10 ** places))) <= 1e-9;
}

function decimalOrNull(value, minimum, maximum, places) {
    return value === null || value === undefined
        || decimalBetween(value, minimum, maximum, places);
}

function uuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function validIdentifier(value, maximum) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= maximum
        && !/(?:replace|example|unknown|placeholder)/i.test(value)
        && /^[a-zA-Z0-9][a-zA-Z0-9_.:/+\-]{0,127}$/.test(value);
}

function normalizeExpectedTargets(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)
        || value.length > 64
        || value.some((target) => !/^(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})$/.test(String(target)))) {
        throw new Error('Adapter managed-target configuration is invalid.');
    }

    const targets = [...new Set(value)].sort();
    if (targets.length !== value.length || (targets.length > 0 && !targets.includes('web'))) {
        throw new Error('Adapter managed-target configuration must be unique and include web.');
    }

    return targets;
}

function normalizeExpectedScopes(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)
        || value.length > 32
        || value.some((scope) => !/^[a-z][a-z0-9_]{0,31}$/.test(String(scope)))) {
        throw new Error('Adapter evidence-scope configuration is invalid.');
    }

    const scopes = [...new Set(value)].sort();
    if (scopes.length !== value.length) {
        throw new Error('Adapter evidence-scope configuration must be unique.');
    }

    return scopes;
}

function parseExpectedBounds(value) {
    let decoded;
    try {
        decoded = JSON.parse(String(value || ''));
    } catch {
        throw new Error('CAPACITY_TARGET_BOUNDS must be a JSON object.');
    }

    return normalizeExpectedBounds(decoded);
}

function normalizeExpectedBounds(value, expectedTargets = []) {
    if (value === undefined || value === null) return {};
    if (Array.isArray(value) || typeof value !== 'object') {
        throw new Error('Adapter target bounds are invalid.');
    }

    const entries = Object.entries(value);
    if (entries.length < 1
        || entries.length > 64
        || entries.some(([target, bounds]) => (
            !/^(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})$/.test(target)
            || !bounds
            || Array.isArray(bounds)
            || typeof bounds !== 'object'
            || Object.keys(bounds).length !== 2
            || !Object.hasOwn(bounds, 'minimum_instances')
            || !Object.hasOwn(bounds, 'maximum_instances')
            || !integerBetween(bounds.minimum_instances, target === 'web' ? 2 : 0, 1_000)
            || !integerBetween(bounds.maximum_instances, bounds.minimum_instances, 1_000)
        ))) {
        throw new Error('Adapter target bounds are invalid.');
    }

    const targets = entries.map(([target]) => target).sort();
    if (expectedTargets.length > 0
        && (targets.length !== expectedTargets.length
            || targets.some((target, index) => target !== expectedTargets[index]))) {
        throw new Error('Adapter target bounds do not cover the managed-target contract.');
    }

    return Object.fromEntries(entries);
}

function validReasons(value) {
    return Array.isArray(value)
        && value.length <= 32
        && value.every((reason) => typeof reason === 'string' && reason.length > 0 && reason.length <= 256);
}

function assertOnlyFields(value, allowed, label) {
    if (!value || Array.isArray(value) || typeof value !== 'object'
        || Object.keys(value).some((field) => !allowed.includes(field))) {
        throw new Error(`${label} contains unsupported fields.`);
    }
}

function assertRequiredFields(value, required, label) {
    if (!value || Array.isArray(value) || typeof value !== 'object'
        || required.some((field) => !Object.hasOwn(value, field))) {
        throw new Error(`${label} is missing required fields.`);
    }
}

function assertExactFields(value, fields, label) {
    assertOnlyFields(value, fields, label);
    assertRequiredFields(value, fields, label);
}

function decodeKey(value) {
    const configured = String(value || '');
    if (configured.startsWith('base64:')) {
        const encoded = configured.slice(7);
        if (!validBase64(encoded)) throw new Error('Invalid base64 plan key.');
        return Buffer.from(encoded, 'base64');
    }
    if (configured.startsWith('hex:')) {
        if (!/^(?:[a-fA-F0-9]{2})+$/.test(configured.slice(4))) throw new Error('Invalid hex plan key.');
        return Buffer.from(configured.slice(4), 'hex');
    }
    return Buffer.from(configured, 'utf8');
}

function selectVerificationKey(options, keyId) {
    if (options.keys !== undefined) {
        const keys = normalizeVerificationKeys(options.keys);
        if (!Object.hasOwn(keys, keyId)) {
            throw new Error('Capacity plan key ID is not trusted by this adapter.');
        }

        return keys[keyId];
    }

    if (options.keyId && keyId !== options.keyId) {
        throw new Error('Capacity plan key ID is invalid.');
    }

    return options.key;
}

function parseVerificationKeys(value) {
    let decoded;
    try {
        decoded = JSON.parse(String(value || ''));
    } catch {
        throw new Error('CAPACITY_PLAN_VERIFYING_KEYS must be a JSON object.');
    }

    return normalizeVerificationKeys(decoded);
}

function normalizeVerificationKeys(value) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw new Error('Capacity plan verification key ring is invalid.');
    }

    const entries = Object.entries(value);
    if (entries.length < 1
        || entries.length > 16
        || entries.some(([keyId, key]) => (
            !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/.test(keyId)
            || typeof key !== 'string'
            || key.length < 1
            || key.length > 8_192
        ))) {
        throw new Error('Capacity plan verification key ring is invalid.');
    }

    for (const [, configuredKey] of entries) {
        const decoded = decodeKey(configuredKey);
        if (decoded.length < 32 || decoded.length > 4_096) {
            throw new Error('Capacity plan verification key ring is invalid.');
        }
    }

    return Object.fromEntries(entries);
}

function validBase64(value) {
    return value.length > 0
        && value.length % 4 === 0
        && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

const invokedDirectly = process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) await main();
