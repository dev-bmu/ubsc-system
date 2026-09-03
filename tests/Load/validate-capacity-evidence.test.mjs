import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCapacityEvidence } from '../../scripts/validate-capacity-evidence.mjs';

const now = new Date('2026-08-19T10:00:00.000Z');

function validEvidence() {
    return {
        schema_version: 3,
        test_id: 'github-12345-1',
        generated_at: '2026-08-19T09:55:00.000Z',
        profile: 'capacity',
        capacity_scope: 'public_read',
        environment: 'production',
        release: 'release-2026.08.19-a1b2c3d',
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
}

test('accepts fresh HTTPS evidence from the sustained target hold', () => {
    assert.deepEqual(validateCapacityEvidence(validEvidence(), now), {
        tested: 19,
        recommendation: 14,
        line: 'PERFORMANCE_PUBLIC_READ_TESTED_RPS=19',
    });
});

test('rejects an invalid verifier clock', () => {
    assert.throws(
        () => validateCapacityEvidence(validEvidence(), new Date('invalid')),
        /clock/,
    );
});

for (const [name, mutate] of [
    ['legacy schema', (value) => { value.schema_version = 2; }],
    ['non-HTTPS origin', (value) => { value.base_origin = 'http://staging.ubsportcenter.co.id'; }],
    ['stale evidence', (value) => { value.generated_at = '2026-08-17T09:55:00.000Z'; }],
    ['short hold', (value) => { value.target_hold_seconds = 299; }],
    ['missed target', (value) => { value.target_hold_requests_per_second = 18; }],
    ['excessive P95', (value) => { value.target_hold_p95_ms = 300; }],
    ['excessive P99', (value) => { value.target_hold_p99_ms = 800; }],
    ['excessive errors', (value) => { value.target_hold_error_rate_percent = 1; }],
    ['dropped iterations', (value) => { value.dropped_iterations = 1; }],
    ['numeric string', (value) => { value.requested_target_rps = '20'; }],
    ['numeric instance count', (value) => { value.application_instances = '2'; }],
    ['non-string timestamp', (value) => { value.generated_at = Date.now(); }],
    ['non-RFC3339 timestamp', (value) => { value.generated_at = '2026-08-19 09:55:00'; }],
    ['impossible RFC3339 calendar date', (value) => { value.generated_at = '2026-02-30T09:55:00Z'; }],
    ['unknown RFC3339 offset', (value) => { value.generated_at = '2026-08-19T09:55:00-00:00'; }],
    ['non-canonical numeric precision', (value) => { value.error_rate_percent = 0.00001; }],
    ['inflated recommendation', (value) => { value.recommended_operational_rps = 15; }],
    ['unexpected metadata', (value) => { value.customer_email = 'must-not-be-stored@example.test'; }],
]) {
    test(`rejects ${name}`, () => {
        const evidence = validEvidence();
        mutate(evidence);

        assert.throws(() => validateCapacityEvidence(evidence, now));
    });
}

test('validates a non-public scope only against its explicit protected contract', () => {
    const evidence = validEvidence();
    evidence.capacity_scope = 'booking_checkout';
    evidence.p95_ms = 700;
    evidence.p99_ms = 1_400;
    evidence.target_hold_p95_ms = 700;
    evidence.target_hold_p99_ms = 1_400;

    assert.throws(() => validateCapacityEvidence(evidence, now));
    assert.deepEqual(validateCapacityEvidence(evidence, now, {
        expectedScope: 'booking_checkout',
        p95LimitMs: 800,
        p99LimitMs: 1_500,
        maximumErrorRatePercent: 1,
        minimumHoldSeconds: 300,
        operationalHeadroomPercent: 25,
        expectedApplicationInstances: 2,
    }), {
        tested: 19,
        recommendation: 14,
        line: 'PERFORMANCE_BOOKING_TESTED_RPS=19',
    });

    assert.throws(() => validateCapacityEvidence(evidence, now, {
        expectedScope: 'booking_checkout',
        p95LimitMs: 800,
        p99LimitMs: 1_500,
        expectedApplicationInstances: 3,
    }), /incomplete/);
});
