<?php

namespace Tests\Unit;

use App\Services\Capacity\CapacityEnvelopeSigner;
use Tests\TestCase;

final class CapacityEnvelopeSignerTest extends TestCase
{
    public function test_canonical_signature_matches_the_provider_node_runtime_fixture(): void
    {
        config()->set('capacity_planning.plan.active_key_id', 'plan-v1');
        config()->set('capacity_planning.plan.signing_keys', [
            'plan-v1' => 'cross-runtime-capacity-signing-key-2026-v1',
        ]);
        $payload = [
            'schema_version' => 1,
            'a' => 1,
            'b' => ['x' => true, 'y' => 1.5],
        ];
        $signer = app(CapacityEnvelopeSigner::class);
        $signature = $signer->sign('plan', $payload);

        $this->assertSame(
            '{"a":1,"b":{"x":true,"y":1.5},"schema_version":1}',
            $signer->canonicalJson($payload),
        );
        $this->assertSame(
            '4d826aabf3956aa480e1343e3ce64551698e431577907bb7392bf382bf70885b',
            $signature['signature'],
        );
        $this->assertTrue($signer->verify('plan', $payload, 'plan-v1', $signature['signature']));
    }

    public function test_malformed_encoded_keys_are_rejected_consistently_with_the_provider_runtime(): void
    {
        config()->set('capacity_planning.plan.active_key_id', 'plan-v1');
        config()->set('capacity_planning.plan.signing_keys', [
            'plan-v1' => 'base64:'.str_repeat('!', 44),
        ]);

        $this->assertFalse(app(CapacityEnvelopeSigner::class)->hasActiveKey('plan'));

        config()->set('capacity_planning.plan.signing_keys', [
            'plan-v1' => 'hex:abc',
        ]);
        $this->assertFalse(app(CapacityEnvelopeSigner::class)->hasActiveKey('plan'));
    }

    public function test_canonical_numeric_fixture_exactly_matches_the_node_runtime(): void
    {
        config()->set('capacity_planning.plan.active_key_id', 'plan-v1');
        config()->set('capacity_planning.plan.signing_keys', [
            'plan-v1' => 'cross-runtime-capacity-canonical-key-v1',
        ]);
        $signer = app(CapacityEnvelopeSigner::class);
        $payload = ['z' => 0.0001, 'n' => 0, 'i' => 2, 'a' => 1.25];

        $this->assertSame(
            '{"a":1.25,"i":2,"n":0,"z":0.0001}',
            $signer->canonicalJson($payload),
        );
        $this->assertSame(
            'fdc20b967d8c84f63a43002529f7df9db1950c7d580ddc16ea73c635ee1e1ce1',
            $signer->sign('plan', $payload)['signature'],
        );
    }

    public function test_key_ids_with_dots_resolve_as_literal_ring_entries(): void
    {
        config()->set('capacity_planning.plan.active_key_id', 'plan.v2');
        config()->set('capacity_planning.plan.signing_keys', [
            'plan.v2' => 'literal-dotted-capacity-key-id-2026-v2',
        ]);
        $signer = app(CapacityEnvelopeSigner::class);
        $payload = ['schema_version' => 1, 'status' => 'hold'];
        $signed = $signer->sign('plan', $payload);

        $this->assertSame('plan.v2', $signed['key_id']);
        $this->assertTrue($signer->verify('plan', $payload, 'plan.v2', $signed['signature']));
    }
}
