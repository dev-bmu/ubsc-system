<?php

namespace Tests\Unit;

use App\Exceptions\DeploymentContractViolation;
use App\Services\Production\DeploymentContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class DeploymentContractTest extends TestCase
{
    public function test_complete_zero_downtime_deployment_contract_passes(): void
    {
        $report = $this->contract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_single_node_or_overlapping_drain_budget_fails_closed(): void
    {
        $configuration = $this->configuration();
        $configuration['production']['application_instances'] = 1;
        $configuration['deployment']['orchestrator']['maximum_unavailable'] = 1;

        $report = $this->contract($configuration)->report();

        self::assertContains('rollout.serving_capacity', $this->failedCodes($report));
    }

    public function test_immutable_health_gated_drain_and_application_rollback_are_all_required(): void
    {
        $configuration = $this->configuration();
        $configuration['deployment']['orchestrator']['connection_draining'] = false;

        $report = $this->contract($configuration)->report();

        self::assertContains('rollout.safe_switch', $this->failedCodes($report));
    }

    public function test_schema_rollback_requires_expand_contract_and_previous_release_compatibility(): void
    {
        $configuration = $this->configuration();
        $configuration['deployment']['schema']['expand_contract_required'] = false;
        $configuration['deployment']['schema']['automatic_database_rollback'] = true;
        $configuration['deployment']['schema']['backward_compatible_releases'] = 1;

        $report = $this->contract($configuration)->report();
        $failed = $this->failedCodes($report);

        self::assertContains('rollback.window', $failed);
        self::assertContains('rollback.schema_safety', $failed);
    }

    public function test_public_edge_requires_managed_protection_and_end_to_end_tls(): void
    {
        $configuration = $this->configuration();
        $configuration['deployment']['edge']['waf_enabled'] = false;
        $configuration['deployment']['edge']['origin_tls'] = false;

        $report = $this->contract($configuration)->report();
        $failed = $this->failedCodes($report);

        self::assertContains('edge.managed_protection', $failed);
        self::assertContains('edge.secure_transport', $failed);
    }

    public function test_release_paths_and_local_health_probe_cannot_escape_the_node_boundary(): void
    {
        $configuration = $this->configuration();
        $configuration['deployment']['runtime']['releases_root'] = '/srv/ubsc/../other';
        $configuration['deployment']['runtime']['local_readiness_url'] = 'https://public.example.test/health/ready';

        $contract = $this->contract($configuration);
        $report = $contract->report();

        self::assertContains('runtime.release_layout', $this->failedCodes($report));

        $this->expectException(DeploymentContractViolation::class);
        $contract->assertSatisfied();
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): DeploymentContract
    {
        return new DeploymentContract(new Repository(
            $configuration ?? $this->configuration(),
        ));
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        return [
            'app' => ['env' => 'production'],
            'production' => ['application_instances' => 2],
            'high_availability' => [
                'load_balancer' => ['health_path' => '/health/ready'],
            ],
            'deployment' => [
                'enforce' => true,
                'strategy' => 'rolling',
                'orchestrator' => [
                    'provider' => 'managed-release-control',
                    'immutable_releases' => true,
                    'atomic_traffic_switch' => true,
                    'health_gated' => true,
                    'connection_draining' => true,
                    'automatic_application_rollback' => true,
                    'maximum_unavailable' => 1,
                    'minimum_healthy_instances' => 1,
                    'retained_releases' => 5,
                ],
                'schema' => [
                    'expand_contract_required' => true,
                    'backward_compatible_releases' => 2,
                    'automatic_database_rollback' => false,
                ],
                'edge' => [
                    'provider' => 'managed-edge',
                    'managed_dns' => true,
                    'cdn_enabled' => true,
                    'waf_enabled' => true,
                    'ddos_protection' => true,
                    'tls_termination' => true,
                    'origin_tls' => true,
                    'origin_access_restricted' => true,
                    'certificate_auto_renewal' => true,
                    'minimum_tls_version' => '1.2',
                    'health_path' => '/health/ready',
                ],
                'runtime' => [
                    'application_root' => '/srv/ubsc',
                    'releases_root' => '/srv/ubsc/releases',
                    'current_link' => '/srv/ubsc/current',
                    'local_readiness_url' => 'http://127.0.0.1:8080/health/ready',
                    'lock_timeout_seconds' => 1_800,
                    'connection_drain_seconds' => 30,
                    'command_timeout_seconds' => 900,
                ],
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
