<?php

namespace Tests\Unit;

use App\Support\TrustedProxyPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TrustedProxyPolicyTest extends TestCase
{
    #[DataProvider('boundedProxyProvider')]
    public function test_accepts_only_explicit_or_narrow_canonical_proxy_ranges(string $proxy): void
    {
        self::assertTrue(TrustedProxyPolicy::allows($proxy));
    }

    /** @return array<string, array{string}> */
    public static function boundedProxyProvider(): array
    {
        return [
            'single IPv4 load balancer' => ['10.0.0.7'],
            'canonical IPv4 subnet' => ['10.0.0.0/24'],
            'narrow canonical IPv4 subnet' => ['10.0.0.128/25'],
            'single IPv6 load balancer' => ['2001:db8::1'],
            'canonical IPv6 subnet' => ['2001:db8::/64'],
        ];
    }

    #[DataProvider('unsafeProxyProvider')]
    public function test_rejects_ambiguous_broad_or_noncanonical_proxy_ranges(string $proxy): void
    {
        self::assertFalse(TrustedProxyPolicy::allows($proxy));
    }

    /** @return array<string, array{string}> */
    public static function unsafeProxyProvider(): array
    {
        return [
            'wildcard' => ['*'],
            'entire IPv4 internet' => ['0.0.0.0/0'],
            'broad private IPv4 network' => ['10.0.0.0/8'],
            'noncanonical IPv4 network' => ['10.0.0.7/24'],
            'broad IPv6 network' => ['2001:db8::/48'],
            'noncanonical IPv6 network' => ['2001:db8::1/64'],
            'invalid prefix' => ['10.0.0.0/33'],
            'malformed value' => ['not-an-ip'],
        ];
    }
}
