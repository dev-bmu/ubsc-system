<?php

namespace App\Services\Production;

use App\Exceptions\DeploymentContractViolation;
use Illuminate\Contracts\Config\Repository;

final class DeploymentContract
{
    public function __construct(private readonly Repository $config) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('deployment.enforce', false);
    }

    /**
     * @return array{
     *   valid:bool,
     *   strict_valid:bool,
     *   failures:int,
     *   warnings:int,
     *   checks:list<array{code:string,status:string,message:string}>
     * }
     */
    public function report(): array
    {
        $checks = [];
        $production = (string) $this->config->get('app.env', 'production') === 'production';
        $enforced = $this->shouldEnforce();

        $this->add(
            $checks,
            'contract.enforcement',
            $enforced ? 'pass' : ($production ? 'fail' : 'warning'),
            $enforced
                ? 'The production deployment contract is enforced.'
                : ($production
                    ? 'DEPLOYMENT_CONTRACT_ENFORCE must be enabled in production.'
                    : 'Deployment enforcement is intentionally disabled outside production.'),
        );

        $strategy = (string) $this->config->get('deployment.strategy', '');
        $validStrategy = in_array($strategy, ['rolling', 'blue_green'], true);
        $this->add(
            $checks,
            'rollout.strategy',
            $validStrategy ? 'pass' : 'fail',
            $validStrategy
                ? "The {$strategy} strategy preserves serving capacity during releases."
                : 'Use an explicit rolling or blue_green deployment strategy.',
        );

        $orchestrator = (string) $this->config->get('deployment.orchestrator.provider', '');
        $this->add(
            $checks,
            'rollout.orchestrator',
            $this->validIdentity($orchestrator) ? 'pass' : 'fail',
            $this->validIdentity($orchestrator)
                ? 'A non-placeholder deployment orchestrator is declared.'
                : 'Declare the deployment platform or provider that owns drain, cutover, and rollback.',
        );

        $safeSwitch = (bool) $this->config->get('deployment.orchestrator.immutable_releases', false)
            && (bool) $this->config->get('deployment.orchestrator.atomic_traffic_switch', false)
            && (bool) $this->config->get('deployment.orchestrator.health_gated', false)
            && (bool) $this->config->get('deployment.orchestrator.connection_draining', false)
            && (bool) $this->config->get('deployment.orchestrator.automatic_application_rollback', false);
        $this->add(
            $checks,
            'rollout.safe_switch',
            $safeSwitch ? 'pass' : 'fail',
            $safeSwitch
                ? 'Immutable releases use an atomic, health-gated, drained switch with application rollback.'
                : 'Require immutable releases, atomic traffic switching, health gates, connection draining, and application rollback.',
        );

        $instances = max(1, (int) $this->config->get('production.application_instances', 1));
        $minimumHealthy = (int) $this->config->get(
            'deployment.orchestrator.minimum_healthy_instances',
            1,
        );
        $maximumUnavailable = (int) $this->config->get(
            'deployment.orchestrator.maximum_unavailable',
            0,
        );
        $availabilitySafe = $instances >= 2
            && $minimumHealthy >= 1
            && $minimumHealthy < $instances
            && $maximumUnavailable >= 1
            && $maximumUnavailable <= ($instances - $minimumHealthy);
        $this->add(
            $checks,
            'rollout.serving_capacity',
            $availabilitySafe ? 'pass' : 'fail',
            $availabilitySafe
                ? "At least {$minimumHealthy} of {$instances} nodes remain healthy while at most {$maximumUnavailable} is unavailable."
                : 'A rollout must keep at least one healthy node and may never drain more nodes than the declared availability budget.',
        );

        $retained = (int) $this->config->get('deployment.orchestrator.retained_releases', 0);
        $compatible = (int) $this->config->get(
            'deployment.schema.backward_compatible_releases',
            0,
        );
        $rollbackWindowSafe = $retained >= 3 && $compatible >= 2 && $retained > $compatible;
        $this->add(
            $checks,
            'rollback.window',
            $rollbackWindowSafe ? 'pass' : 'fail',
            $rollbackWindowSafe
                ? "{$retained} immutable releases are retained with a {$compatible}-release schema compatibility window."
                : 'Retain at least three releases and keep the schema compatible with at least the previous two.',
        );

        $schemaSafe = (bool) $this->config->get(
            'deployment.schema.expand_contract_required',
            false,
        ) && ! (bool) $this->config->get(
            'deployment.schema.automatic_database_rollback',
            false,
        );
        $this->add(
            $checks,
            'rollback.schema_safety',
            $schemaSafe ? 'pass' : 'fail',
            $schemaSafe
                ? 'Expand-contract migrations allow safe code rollback without blind database reversal.'
                : 'Require expand-contract migrations and prohibit automatic database rollback.',
        );

        $edgeProvider = (string) $this->config->get('deployment.edge.provider', '');
        $managedEdge = $this->validIdentity($edgeProvider)
            && (bool) $this->config->get('deployment.edge.managed_dns', false)
            && (bool) $this->config->get('deployment.edge.cdn_enabled', false)
            && (bool) $this->config->get('deployment.edge.waf_enabled', false)
            && (bool) $this->config->get('deployment.edge.ddos_protection', false);
        $this->add(
            $checks,
            'edge.managed_protection',
            $managedEdge ? 'pass' : 'fail',
            $managedEdge
                ? 'Managed DNS, CDN, WAF, and DDoS protection are declared at the public edge.'
                : 'Production requires a named managed edge with DNS, CDN, WAF, and DDoS protection.',
        );

        $minimumTls = (string) $this->config->get('deployment.edge.minimum_tls_version', '');
        $secureTransport = (bool) $this->config->get('deployment.edge.tls_termination', false)
            && (bool) $this->config->get('deployment.edge.origin_tls', false)
            && (bool) $this->config->get('deployment.edge.origin_access_restricted', false)
            && (bool) $this->config->get('deployment.edge.certificate_auto_renewal', false)
            && in_array($minimumTls, ['1.2', '1.3'], true);
        $this->add(
            $checks,
            'edge.secure_transport',
            $secureTransport ? 'pass' : 'fail',
            $secureTransport
                ? "TLS {$minimumTls}+ protects both public and restricted origin transport with automatic renewal."
                : 'Require TLS 1.2 or newer, automatic certificate renewal, origin TLS, and an origin restricted to the trusted edge.',
        );

        $healthPath = (string) $this->config->get('deployment.edge.health_path', '');
        $loadBalancerPath = (string) $this->config->get(
            'high_availability.load_balancer.health_path',
            '',
        );
        $healthPathSafe = $healthPath === '/health/ready'
            && $loadBalancerPath === $healthPath;
        $this->add(
            $checks,
            'edge.readiness_routing',
            $healthPathSafe ? 'pass' : 'fail',
            $healthPathSafe
                ? 'The edge and load balancer remove nodes using the dependency-aware readiness route.'
                : 'EDGE_HEALTH_PATH and LOAD_BALANCER_HEALTH_PATH must both be /health/ready.',
        );

        $pathsSafe = $this->runtimePathsAreSafe();
        $localReadinessSafe = $this->localReadinessIsLoopback();
        $this->add(
            $checks,
            'runtime.release_layout',
            $pathsSafe && $localReadinessSafe ? 'pass' : 'fail',
            $pathsSafe && $localReadinessSafe
                ? 'Release paths are bounded and post-cutover readiness is checked through a loopback-only endpoint.'
                : 'Use absolute bounded release paths and a loopback /health/ready URL for node acceptance.',
        );

        $lockTimeout = (int) $this->config->get('deployment.runtime.lock_timeout_seconds', 0);
        $drainSeconds = (int) $this->config->get('deployment.runtime.connection_drain_seconds', 0);
        $commandTimeout = (int) $this->config->get('deployment.runtime.command_timeout_seconds', 0);
        $timeoutsSafe = $lockTimeout >= 300
            && $lockTimeout <= 7_200
            && $drainSeconds >= 15
            && $drainSeconds <= 300
            && $commandTimeout >= 300
            && $commandTimeout <= $lockTimeout;
        $this->add(
            $checks,
            'runtime.bounded_operations',
            $timeoutsSafe ? 'pass' : 'fail',
            $timeoutsSafe
                ? 'Deployment locking, draining, and command execution use bounded operational windows.'
                : 'Use a 5-120 minute lock, 15-300 second drain, and a command timeout between 5 minutes and the lock lease.',
        );

        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $warnings = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'warning',
        ));

        return [
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => $checks,
        ];
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();

        if ($report['valid']) {
            return;
        }

        $codes = array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));

        throw DeploymentContractViolation::fromCodes($codes);
    }

    private function runtimePathsAreSafe(): bool
    {
        $applicationRoot = rtrim((string) $this->config->get(
            'deployment.runtime.application_root',
            '',
        ), '/');
        $releasesRoot = rtrim((string) $this->config->get(
            'deployment.runtime.releases_root',
            '',
        ), '/');
        $currentLink = rtrim((string) $this->config->get(
            'deployment.runtime.current_link',
            '',
        ), '/');

        foreach ([$applicationRoot, $releasesRoot, $currentLink] as $path) {
            if (! str_starts_with($path, '/')
                || str_contains($path, "\0")
                || preg_match('#(?:^|/)\.\.(?:/|$)#', $path) === 1) {
                return false;
            }
        }

        return strlen($applicationRoot) >= 5
            && $releasesRoot !== $applicationRoot
            && $currentLink !== $applicationRoot
            && $releasesRoot !== $currentLink
            && str_starts_with($releasesRoot.'/', $applicationRoot.'/')
            && str_starts_with($currentLink.'/', $applicationRoot.'/');
    }

    private function localReadinessIsLoopback(): bool
    {
        $url = (string) $this->config->get('deployment.runtime.local_readiness_url', '');
        $parts = parse_url($url);

        if (! is_array($parts)
            || ($parts['scheme'] ?? null) !== 'http'
            || ($parts['path'] ?? null) !== '/health/ready'
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            return false;
        }

        return in_array($parts['host'] ?? '', ['127.0.0.1', '::1', 'localhost'], true);
    }

    private function validIdentity(string $value): bool
    {
        return preg_match('/\A[a-z0-9][a-z0-9._:-]{2,95}\z/', $value) === 1
            && preg_match('/replace|example|placeholder|unknown|local-only/i', $value) !== 1;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }
}
