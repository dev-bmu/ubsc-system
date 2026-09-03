import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { canonicalJson, signCapacityEvidence } from '../../scripts/sign-capacity-evidence.mjs';

const payload = {
    schema_version: 3,
    test_id: 'github-12345-1',
    generated_at: new Date().toISOString(),
    profile: 'capacity',
    capacity_scope: 'public_read',
    environment: 'production',
    release: 'release-2026.08.24-a1b2c3d',
    infrastructure_profile: 'ubsc-web-2x-2cpu-4gb',
    source_provider: 'github-actions',
    application_instances: 2,
    base_origin: 'https://staging.ubsportcenter.co.id',
    requested_start_rps: 2,
    requested_target_rps: 20,
    observed_requests_per_second: 15.4,
    p95_ms: 245,
    p99_ms: 620,
    error_rate_percent: 0.2,
    target_hold_seconds: 300,
    target_hold_requests_per_second: 19.8,
    target_hold_p95_ms: 240,
    target_hold_p99_ms: 610,
    target_hold_error_rate_percent: 0.2,
    dropped_iterations: 0,
    thresholds_passed: true,
    reached_target: true,
    qualifies_as_capacity_evidence: true,
    tested_requests_per_second: 19,
    recommended_operational_rps: 14,
    operational_headroom_percent: 25,
};

test('signs stable canonical evidence without exposing the key', () => {
    const key = 'capacity-evidence-test-key-at-least-thirty-two-bytes';
    const envelope = signCapacityEvidence(payload, 'ci-v1', key);

    assert.equal(envelope.signature, createHmac('sha256', key).update(canonicalJson(payload)).digest('hex'));
    assert.equal(JSON.stringify(envelope).includes(key), false);
});

test('rejects undersized signing keys', () => {
    assert.throws(() => signCapacityEvidence(payload, 'ci-v1', 'too-short'));
    assert.throws(() => signCapacityEvidence(payload, 'ci-v1', `base64:${'!'.repeat(44)}`), /base64/);
});
