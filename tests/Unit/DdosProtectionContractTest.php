<?php

namespace Tests\Unit;

use App\Exceptions\DdosProtectionContractViolation;
use App\Services\Production\DdosProtectionContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class DdosProtectionContractTest extends TestCase
{
    public function test_complete_layered_contract_passes(): void
    {
        $report = $this->contract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_application_requires_isolated_state_global_fuses_and_bounded_inputs(): void
    {
        $configuration = $this->configuration();
        $configuration['cache']['limiter'] = 'redis';
        $configuration['ddos_protection']['application']['limits']['web']['global_per_second'] = 50;
        unset(
            $configuration['ddos_protection']['application']['resource_envelope']['route_body_bytes'][
                'admin.gallery.upload-sessions.chunks.store'
            ],
        );

        $failed = $this->failedCodes($this->contract($configuration)->report());

        self::assertContains('application.isolated_limiter_state', $failed);
        self::assertContains('application.layered_limits', $failed);
        self::assertContains('application.resource_bounds', $failed);
    }

    public function test_declared_edge_cannot_replace_origin_isolation_or_spoof_proof_identity(): void
    {
        $configuration = $this->configuration();
        $configuration['ddos_protection']['edge']['automatic_l7_mitigation'] = false;
        $configuration['ddos_protection']['origin']['public_direct_access_disabled'] = false;
        $configuration['security']['trusted_proxies'] = '*';

        $failed = $this->failedCodes($this->contract($configuration)->report());

        self::assertContains('edge.automatic_mitigation', $failed);
        self::assertContains('origin.no_bypass', $failed);
        self::assertContains('origin.authenticated_client_identity', $failed);
    }

    public function test_client_identity_rejects_broad_or_noncanonical_proxy_networks(): void
    {
        foreach (['10.0.0.0/8', '10.0.0.7/24', '2001:db8::/48', '2001:db8::1/64'] as $proxy) {
            $configuration = $this->configuration();
            $configuration['security']['trusted_proxies'] = $proxy;

            self::assertContains(
                'origin.authenticated_client_identity',
                $this->failedCodes($this->contract($configuration)->report()),
                "Unsafe trusted proxy [{$proxy}] was accepted.",
            );
        }
    }

    public function test_operations_and_live_provider_verification_fail_closed(): void
    {
        $configuration = $this->configuration();
        $configuration['ddos_protection']['operations']['emergency_mode'] = false;
        $configuration['ddos_protection']['verification']['provider_hook'] = '/usr/local/libexec/provider/verify';
        $configuration['ddos_protection']['verification']['edge_response_header'] = 'replace-me';

        $contract = $this->contract($configuration);
        $failed = $this->failedCodes($contract->report());

        self::assertContains('operations.response_readiness', $failed);
        self::assertContains('verification.provider_state', $failed);

        $this->expectException(DdosProtectionContractViolation::class);
        $contract->assertSatisfied();
    }

    public function test_live_provider_verification_requires_the_exact_origin_and_zone_fingerprint(): void
    {
        $configuration = $this->configuration();
        $configuration['app']['url'] = 'http://ubsportcenter.co.id';
        $configuration['seo']['canonical_origin'] = 'https://other.example';
        $configuration['ddos_protection']['verification']['provider_zone_fingerprint'] = str_repeat('0', 64);

        self::assertContains(
            'verification.provider_state',
            $this->failedCodes($this->contract($configuration)->report()),
        );

        $configuration = $this->configuration();
        $configuration['seo']['canonical_origin'] = 'https://other.example';

        self::assertContains(
            'verification.provider_state',
            $this->failedCodes($this->contract($configuration)->report()),
        );
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): DdosProtectionContract
    {
        return new DdosProtectionContract(new Repository(
            $configuration ?? $this->configuration(),
        ));
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        return [
            'app' => [
                'env' => 'production',
                'url' => 'https://ubsportcenter.co.id',
            ],
            'seo' => ['canonical_origin' => 'https://ubsportcenter.co.id'],
            'ddos_protection' => [
                'enforce' => true,
                'application' => [
                    'enabled' => true,
                    'resource_envelope' => [
                        'enabled' => true,
                        'maximum_request_target_bytes' => 4_096,
                        'maximum_query_bytes' => 2_048,
                        'maximum_query_parameters' => 100,
                        'maximum_query_depth' => 8,
                        'maximum_header_count' => 96,
                        'maximum_header_bytes' => 32_768,
                        'maximum_cookie_bytes' => 8_192,
                        'default_body_bytes' => 2_097_152,
                        'route_body_bytes' => [
                            'profile.update' => 8_388_608,
                            'admin.gallery.upload-sessions.chunks.store' => 8_388_608,
                            'admin.gallery.items.store' => 25_165_824,
                            'admin.facilities.store' => 134_217_728,
                            'admin.facilities.update' => 134_217_728,
                            'admin.facilities.gallery.add' => 134_217_728,
                            'admin.news.store' => 50_331_648,
                            'admin.news.update' => 50_331_648,
                            'admin.reels.store' => 67_108_864,
                            'admin.reels.update' => 67_108_864,
                            'monitoring.external-sli.ingest' => 16_384,
                            'monitoring.log-receipts.ingest' => 32_768,
                            'admin.*' => 16_777_216,
                        ],
                    ],
                    'limits' => [
                        'web' => [
                            'per_ip_per_second' => 40,
                            'per_ip_per_minute' => 1_200,
                            'per_network_per_minute' => 12_000,
                            'global_per_second' => 600,
                            'global_per_minute' => 24_000,
                        ],
                    ],
                ],
                'edge' => [
                    'always_on' => true,
                    'anycast_or_global_scrubbing' => true,
                    'automatic_l3_l4_mitigation' => true,
                    'automatic_l7_mitigation' => true,
                    'managed_waf_rules' => true,
                    'adaptive_rate_limiting' => true,
                    'bot_management' => true,
                    'static_asset_caching' => true,
                    'private_html_cache_bypass' => true,
                ],
                'origin' => [
                    'public_direct_access_disabled' => true,
                    'public_dns_disclosure_prevented' => true,
                    'authentication_mode' => 'private_network',
                    'allowed_authentication_modes' => [
                        'private_network', 'mtls', 'provider_authenticated_pull',
                    ],
                ],
                'client_identity' => [
                    'provider_header' => 'x-verified-client-ip',
                    'edge_strips_spoofed_headers' => true,
                    'load_balancer_replaces_forwarded_for' => true,
                ],
                'telemetry' => [
                    'security_event_stream' => true,
                    'attack_alerting' => true,
                    'origin_saturation_alerting' => true,
                    'cost_anomaly_alerting' => true,
                ],
                'operations' => [
                    'emergency_mode' => true,
                    'provider_escalation' => true,
                    'runbook' => 'docs/DDOS_RESPONSE_OPERATIONS.md',
                    'maximum_provider_response_seconds' => 900,
                    'exercise_interval_days' => 90,
                ],
                'verification' => [
                    'mode' => 'provider_api',
                    'provider_hook' => '/usr/local/libexec/ubsc-verify-ddos-provider',
                    'provider_zone_fingerprint' => hash('sha256', 'zone-production-01'),
                    'edge_response_header' => 'x-edge-request-id',
                ],
            ],
            'cache' => [
                'default' => 'redis',
                'limiter' => 'traffic',
                'stores' => [
                    'redis' => [
                        'driver' => 'redis',
                        'connection' => 'cache',
                        'lock_connection' => 'coordination',
                    ],
                    'traffic' => [
                        'driver' => 'redis',
                        'connection' => 'traffic',
                    ],
                ],
            ],
            'session' => ['connection' => 'session'],
            'queue' => [
                'default' => 'redis',
                'connections' => ['redis' => ['connection' => 'queue']],
            ],
            'deployment' => [
                'edge' => [
                    'provider' => 'managed-edge-provider',
                    'managed_dns' => true,
                    'cdn_enabled' => true,
                    'waf_enabled' => true,
                    'ddos_protection' => true,
                    'origin_access_restricted' => true,
                ],
            ],
            'high_availability' => [
                'load_balancer' => ['forwarded_for_mode' => 'replace'],
            ],
            'security' => ['trusted_proxies' => '10.0.0.0/24,10.0.1.0/24'],
            'observability' => [
                'signals' => ['centralized_security_events' => true],
            ],
        ];
    }

    /**
     * @param  array{checks:list<array{code:string,status:string,message:string}>}  $report
     * @return list<string>
     */
    private function failedCodes(array $report): array
    {
        return array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));
    }
}
