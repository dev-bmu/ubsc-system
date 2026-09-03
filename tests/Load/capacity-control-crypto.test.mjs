import assert from 'node:assert/strict';
import test from 'node:test';

import { signCapacityObservation } from '../../scripts/sign-capacity-observation.mjs';
import { verifyCapacityPlan } from '../../scripts/verify-capacity-plan.mjs';
import { createHmac } from 'node:crypto';
import { canonicalJson } from '../../scripts/sign-capacity-evidence.mjs';

const key = 'capacity-plan-and-observation-test-key-2026-v1';
const now = new Date('2026-08-24T10:00:00.000Z');

test('canonical numeric fixture exactly matches the PHP runtime', () => {
    const canonical = canonicalJson({ z: 0.0001, n: 0, i: 2, a: 1.25 });

    assert.equal(canonical, '{"a":1.25,"i":2,"n":0,"z":0.0001}');
    assert.equal(
        createHmac('sha256', 'cross-runtime-capacity-canonical-key-v1')
            .update(canonical)
            .digest('hex'),
        'fdc20b967d8c84f63a43002529f7df9db1950c7d580ddc16ea73c635ee1e1ce1',
    );
});

test('signs a bounded provider observation', () => {
    const observation = {
        schema_version: 2,
        observation_id: '11111111-1111-4111-8111-111111111111',
        observed_at: now.toISOString(),
        provider: 'kubernetes',
        environment: 'production',
        release: 'release-2026.08.24-a1b2c3d',
        infrastructure_profile: 'ubsc-web-2x-2cpu-4gb',
        targets: { web: {
            kind: 'web',
            state_token: 'a'.repeat(64),
            current_instances: 2,
            ready_instances: 2,
            cpu_utilization_percent: 42,
            memory_utilization_percent: 48,
        } },
    };
    const envelope = signCapacityObservation(observation, 'platform-v1', key);

    assert.match(envelope.signature, /^[a-f0-9]{64}$/);
    assert.throws(
        () => signCapacityObservation({ ...observation, provider_token: 'must-not-be-signed' }, 'platform-v1', key),
        /unsupported fields/,
    );
    assert.throws(
        () => signCapacityObservation({ ...observation, observed_at: Date.now() }, 'platform-v1', key),
        /malformed/,
    );
    assert.throws(
        () => signCapacityObservation({ ...observation, observed_at: '2026-08-24 10:00:00' }, 'platform-v1', key),
        /malformed/,
    );
    assert.throws(
        () => signCapacityObservation({ ...observation, observed_at: '2026-02-30T10:00:00Z' }, 'platform-v1', key),
        /malformed/,
    );
    assert.throws(
        () => signCapacityObservation({ ...observation, provider: 123 }, 'platform-v1', key),
        /malformed/,
    );
    const overPrecise = structuredClone(observation);
    overPrecise.targets.web.cpu_utilization_percent = 0.000001;
    assert.throws(
        () => signCapacityObservation(overPrecise, 'platform-v1', key),
        /malformed/,
    );
    assert.throws(
        () => signCapacityObservation(observation, 'platform-v1', `base64:${'!'.repeat(44)}`),
        /base64/,
    );
    assert.throws(
        () => signCapacityObservation(observation, 'platform-v1', key, ['web', 'queue:critical']),
        /managed targets/,
    );

    const outage = structuredClone(observation);
    outage.observation_id = '44444444-4444-4444-8444-444444444444';
    outage.targets.web.current_instances = 0;
    outage.targets.web.ready_instances = 0;
    outage.targets.web.cpu_utilization_percent = 0;
    outage.targets.web.memory_utilization_percent = 0;
    assert.match(
        signCapacityObservation(outage, 'platform-v1', key).signature,
        /^[a-f0-9]{64}$/,
    );
});

test('verifies a fresh bounded plan and rejects a tampered desired state', () => {
    const payload = {
        schema_version: 3,
        plan_id: '22222222-2222-4222-8222-222222222222',
        input_hash: 'd'.repeat(64),
        generated_at: '2026-08-24T09:59:30.000Z',
        expires_at: '2026-08-24T10:01:00.000Z',
        environment: 'production',
        release: 'release-2026.08.24-a1b2c3d',
        infrastructure_profile: 'ubsc-web-2x-2cpu-4gb',
        provider: 'kubernetes',
        mode: 'signed_plan',
        status: 'actionable',
        targets: {
            web: {
                kind: 'web', state_token: 'b'.repeat(64),
                current_instances: 2, ready_instances: 2,
                minimum_instances: 2, maximum_instances: 20,
                raw_recommendation: 4, desired_instances: 3,
                load_percent: 82, cpu_utilization_percent: 82,
                memory_utilization_percent: 50,
                action: 'scale_up', automation_eligible: true,
                capacity_limited: false, reasons: ['bounded_scale_up'],
            },
        },
        reasons: [], guardrails: {
            safe: true,
            status: 'pass',
            reason: 'database_guardrails_passed',
            connection_utilization_percent: null,
            lock_waits_current: null,
            slow_queries_per_minute: null,
        },
        observation_id: '11111111-1111-4111-8111-111111111111',
        evidence_id: '33333333-3333-4333-8333-333333333333',
        evidence_ids: { public_read: '33333333-3333-4333-8333-333333333333' },
    };
    const envelope = {
        schema_version: 1,
        key_id: 'plan-v1',
        payload,
        signature: createHmac('sha256', key).update(canonicalJson(payload)).digest('hex'),
    };
    const options = {
        keyId: 'plan-v1', key, environment: 'production',
        release: payload.release, infrastructureProfile: payload.infrastructure_profile,
        provider: 'kubernetes', expectedTargets: ['web'],
        expectedEvidenceScopes: ['public_read'],
        expectedBounds: {
            web: { minimum_instances: 2, maximum_instances: 20 },
        },
        scaleDownThresholdPercent: 35,
        maximumScaleUpStep: 4,
        maximumScaleUpPercent: 50,
        maximumScaleDownStep: 1,
    };

    assert.deepEqual(verifyCapacityPlan(envelope, options, now).actions, {
        web: {
            action: 'scale_up',
            current_instances: 2,
            desired_instances: 3,
            minimum_instances: 2,
            maximum_instances: 20,
            load_percent: 82,
            cpu_utilization_percent: 82,
            memory_utilization_percent: 50,
            state_token: 'b'.repeat(64),
        },
    });
    assert.throws(
        () => verifyCapacityPlan(envelope, { keyId: 'plan-v1', key }, now),
        /complete independent capacity adapter contract/,
    );
    assert.throws(
        () => verifyCapacityPlan(envelope, { ...options, keyId: undefined }, now),
        /complete independent capacity adapter contract/,
    );
    assert.throws(
        () => verifyCapacityPlan(envelope, options, new Date('invalid')),
        /clock/,
    );
    assert.throws(
        () => verifyCapacityPlan(envelope, {
            ...options,
            infrastructureProfile: 'replace-with-immutable-capacity-profile',
        }, now),
        /adapter contract/,
    );
    const placeholderPayload = structuredClone(payload);
    placeholderPayload.infrastructure_profile = 'replace-with-immutable-capacity-profile';
    const placeholderEnvelope = {
        ...envelope,
        payload: placeholderPayload,
        signature: createHmac('sha256', key)
            .update(canonicalJson(placeholderPayload))
            .digest('hex'),
    };
    assert.throws(
        () => verifyCapacityPlan(placeholderEnvelope, options, now),
        /malformed/,
    );
    assert.equal(verifyCapacityPlan(envelope, {
        ...options,
        keyId: undefined,
        key: undefined,
        keys: {
            'plan-v1': key,
            'plan-v2': 'rotated-capacity-plan-test-key-2026-v2',
        },
    }, now).plan_id, payload.plan_id);

    const floorRecoveryPayload = structuredClone(payload);
    floorRecoveryPayload.plan_id = '55555555-5555-4555-8555-555555555555';
    Object.assign(floorRecoveryPayload.targets.web, {
        current_instances: 0,
        ready_instances: 0,
        raw_recommendation: 2,
        desired_instances: 2,
        load_percent: 0,
        cpu_utilization_percent: 0,
        memory_utilization_percent: 0,
        action: 'scale_up',
        reasons: ['minimum_capacity_floor_recovery'],
    });
    const floorRecoveryEnvelope = {
        ...envelope,
        payload: floorRecoveryPayload,
        signature: createHmac('sha256', key)
            .update(canonicalJson(floorRecoveryPayload))
            .digest('hex'),
    };
    assert.equal(
        verifyCapacityPlan(floorRecoveryEnvelope, options, now).actions.web.current_instances,
        0,
    );
    assert.throws(() => verifyCapacityPlan(envelope, {
        ...options,
        keyId: undefined,
        key: undefined,
        keys: { 'plan-v2': 'rotated-capacity-plan-test-key-2026-v2' },
    }, now), /not trusted/);
    const extendedPayload = { ...payload, debug_context: 'must-not-be-applied' };
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: extendedPayload,
        signature: createHmac('sha256', key).update(canonicalJson(extendedPayload)).digest('hex'),
    }, options, now), /unsupported fields/);
    const ambiguousTime = { ...payload, generated_at: '2026-08-24 09:59:30' };
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: ambiguousTime,
        signature: createHmac('sha256', key).update(canonicalJson(ambiguousTime)).digest('hex'),
    }, options, now), /malformed/);
    const impossibleTime = { ...payload, generated_at: '2026-02-30T09:59:30Z' };
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: impossibleTime,
        signature: createHmac('sha256', key).update(canonicalJson(impossibleTime)).digest('hex'),
    }, options, now), /malformed/);
    const overPreciseGuardrail = structuredClone(payload);
    overPreciseGuardrail.guardrails.connection_utilization_percent = 12.345;
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: overPreciseGuardrail,
        signature: createHmac('sha256', key).update(canonicalJson(overPreciseGuardrail)).digest('hex'),
    }, options, now), /guardrails/);
    const driftedBounds = structuredClone(payload);
    driftedBounds.targets.web.maximum_instances = 21;
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: driftedBounds,
        signature: createHmac('sha256', key).update(canonicalJson(driftedBounds)).digest('hex'),
    }, options, now), /adapter bounds/);
    const oversizedStep = structuredClone(payload);
    oversizedStep.targets.web.raw_recommendation = 6;
    oversizedStep.targets.web.desired_instances = 6;
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: oversizedStep,
        signature: createHmac('sha256', key).update(canonicalJson(oversizedStep)).digest('hex'),
    }, options, now), /unsafe/);
    const mismatchedEvidence = {
        ...payload,
        evidence_id: '44444444-4444-4444-8444-444444444444',
    };
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: mismatchedEvidence,
        signature: createHmac('sha256', key).update(canonicalJson(mismatchedEvidence)).digest('hex'),
    }, options, now), /primary evidence/);
    const duplicatedEvidence = {
        ...payload,
        evidence_ids: {
            public_read: payload.evidence_id,
            write: payload.evidence_id,
        },
    };
    assert.throws(() => verifyCapacityPlan({
        ...envelope,
        payload: duplicatedEvidence,
        signature: createHmac('sha256', key).update(canonicalJson(duplicatedEvidence)).digest('hex'),
    }, { ...options, expectedEvidenceScopes: ['public_read', 'write'] }, now), /evidence map/);

    const orderedEvidence = structuredClone(payload);
    orderedEvidence.evidence_ids = {
        write: '66666666-6666-4666-8666-666666666666',
        admin: '77777777-7777-4777-8777-777777777777',
    };
    orderedEvidence.evidence_id = orderedEvidence.evidence_ids.admin;
    const orderedEvidenceEnvelope = {
        ...envelope,
        payload: orderedEvidence,
        signature: createHmac('sha256', key)
            .update(canonicalJson(orderedEvidence))
            .digest('hex'),
    };
    assert.equal(verifyCapacityPlan(orderedEvidenceEnvelope, {
        ...options,
        expectedEvidenceScopes: ['write', 'admin'],
    }, now).plan_id, orderedEvidence.plan_id);
    envelope.payload.targets.web.desired_instances = 20;
    assert.throws(() => verifyCapacityPlan(envelope, options, now), /signature/);
});

test('rejects scale-down when the target is not fully ready', () => {
    const payload = {
        schema_version: 3, plan_id: '22222222-2222-4222-8222-222222222222',
        input_hash: 'e'.repeat(64),
        generated_at: '2026-08-24T09:59:30.000Z', expires_at: '2026-08-24T10:01:00.000Z',
        environment: 'production', release: 'release-2026.08.24-a1b2c3d',
        infrastructure_profile: 'ubsc-web-2x-2cpu-4gb', provider: 'kubernetes',
        mode: 'signed_plan', status: 'actionable',
        observation_id: '11111111-1111-4111-8111-111111111111',
        evidence_id: '33333333-3333-4333-8333-333333333333',
        evidence_ids: { public_read: '33333333-3333-4333-8333-333333333333' },
        guardrails: {
            safe: true,
            status: 'pass',
            reason: 'database_guardrails_passed',
            connection_utilization_percent: null,
            lock_waits_current: null,
            slow_queries_per_minute: null,
        }, reasons: [],
        targets: { web: {
            kind: 'web', state_token: 'c'.repeat(64),
            current_instances: 4, ready_instances: 3,
            minimum_instances: 2, maximum_instances: 20, raw_recommendation: 2,
            load_percent: 20, cpu_utilization_percent: 20,
            memory_utilization_percent: 20,
            desired_instances: 3, action: 'scale_down', automation_eligible: true,
            capacity_limited: false, reasons: [],
        } },
    };
    const envelope = { schema_version: 1, key_id: 'plan-v1', payload,
        signature: createHmac('sha256', key).update(canonicalJson(payload)).digest('hex') };
    const options = {
        keyId: 'plan-v1',
        key,
        environment: payload.environment,
        release: payload.release,
        infrastructureProfile: payload.infrastructure_profile,
        provider: payload.provider,
        expectedTargets: ['web'],
        expectedEvidenceScopes: ['public_read'],
        expectedBounds: {
            web: { minimum_instances: 2, maximum_instances: 20 },
        },
        scaleDownThresholdPercent: 35,
        maximumScaleUpStep: 4,
        maximumScaleUpPercent: 50,
        maximumScaleDownStep: 1,
    };

    assert.throws(() => verifyCapacityPlan(envelope, options, now), /unsafe/);

    payload.targets.web.ready_instances = 4;
    payload.targets.web.memory_utilization_percent = 50;
    envelope.signature = createHmac('sha256', key).update(canonicalJson(payload)).digest('hex');
    assert.throws(() => verifyCapacityPlan(envelope, options, now), /unsafe/);

    payload.targets.web.memory_utilization_percent = 20;
    payload.targets.web.raw_recommendation = 4;
    envelope.signature = createHmac('sha256', key).update(canonicalJson(payload)).digest('hex');
    assert.throws(() => verifyCapacityPlan(envelope, options, now), /unsafe/);
});
