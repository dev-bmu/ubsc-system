<?php

namespace App\Console\Commands;

use App\Services\Production\ApplicationNodeInventoryVerifier;
use App\Services\Production\HighAvailabilityContract;
use App\Services\Production\HighAvailabilityProbe;
use Illuminate\Console\Command;

final class CheckHighAvailability extends Command
{
    protected $signature = 'production:ha-check
        {--strict : Treat recommendations as deployment blockers}
        {--probe : Probe the configured writer and every managed Redis workload}
        {--expected-nodes= : Require exact convergence with fresh signed provider inventory}
        {--public-origin= : Require an exact match with the configured HTTPS application origin}
        {--expected-release= : Require an exact match with the immutable APP_RELEASE}';

    protected $description = 'Validate the UBSC database, load-balancer, and Redis high-availability contract';

    public function handle(
        HighAvailabilityContract $contract,
        HighAvailabilityProbe $probe,
        ApplicationNodeInventoryVerifier $nodeInventory,
    ): int {
        if (! $this->acceptanceTargetMatchesConfiguration($nodeInventory)) {
            return self::INVALID;
        }

        $report = $contract->report();
        $strict = (bool) $this->option('strict');

        $this->components->info('UBSC high-availability contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        $probeFailed = false;
        if ((bool) $this->option('probe')) {
            $probeReport = $probe->report();
            $this->newLine();
            $this->components->info('Live failover-endpoint probes');
            $this->table(
                ['Dependency', 'Status', 'Latency', 'Attempts'],
                array_map(static fn (array $check): array => [
                    $check['key'],
                    strtoupper($check['status']),
                    $check['latency_ms'].' ms',
                    $check['attempts'],
                ], $probeReport['checks']),
            );
            $probeFailed = ! $probeReport['healthy'];
        }

        $failed = $probeFailed || ($strict ? ! $report['strict_valid'] : ! $report['valid']);
        if ($failed) {
            $this->components->error(sprintf(
                'High-availability contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('High-availability contract passed.');

        return self::SUCCESS;
    }

    private function acceptanceTargetMatchesConfiguration(
        ApplicationNodeInventoryVerifier $nodeInventory,
    ): bool {
        $expectedNodes = $this->option('expected-nodes');
        if ($expectedNodes !== null) {
            $value = trim((string) $expectedNodes);
            if (preg_match('/\A[0-9]+\z/', $value) !== 1) {
                $this->components->error(
                    'The acceptance node count must be a positive integer.',
                );

                return false;
            }

            $inventory = $nodeInventory->verify((int) $value);
            if (! $inventory['valid']) {
                $this->components->error($inventory['message']);

                return false;
            }
        }

        $publicOrigin = $this->option('public-origin');
        if ($publicOrigin !== null) {
            $expected = $this->httpsOrigin((string) $publicOrigin);
            $configured = $this->httpsOrigin((string) config('app.url'));
            if ($expected === null
                || $configured === null
                || ! hash_equals($configured, $expected)) {
                $this->components->error(
                    'The acceptance origin must exactly match the configured HTTPS APP_URL origin.',
                );

                return false;
            }
        }

        $expectedRelease = $this->option('expected-release');
        if ($expectedRelease !== null) {
            $expected = trim((string) $expectedRelease);
            $configured = trim((string) config('monitoring.release'));
            if (preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._:-]{6,127}\z/', $expected) !== 1
                || preg_match('/replace|example|unknown|latest|placeholder/i', $expected) === 1
                || ! hash_equals($configured, $expected)) {
                $this->components->error(
                    'The acceptance release must exactly match the immutable APP_RELEASE.',
                );

                return false;
            }
        }

        return true;
    }

    private function httpsOrigin(string $value): ?string
    {
        if (filter_var($value, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($value);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || ! in_array((string) ($parts['path'] ?? ''), ['', '/'], true)) {
            return null;
        }

        $port = isset($parts['port']) && (int) $parts['port'] !== 443
            ? ':'.(int) $parts['port']
            : '';

        return 'https://'.strtolower((string) $parts['host']).$port;
    }
}
