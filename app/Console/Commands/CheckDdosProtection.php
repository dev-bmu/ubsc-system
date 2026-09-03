<?php

namespace App\Console\Commands;

use App\Services\Production\DdosProtectionContract;
use Illuminate\Console\Command;

final class CheckDdosProtection extends Command
{
    protected $signature = 'production:ddos-check
        {--strict : Treat warnings as deployment blockers}
        {--verification-config : Emit only the allowlisted non-secret verifier configuration as JSON}';

    protected $description = 'Validate layered application, origin, edge, telemetry, and DDoS response contracts';

    public function handle(DdosProtectionContract $contract): int
    {
        $report = $contract->report();

        $failed = (bool) $this->option('strict')
            ? ! $report['strict_valid']
            : ! $report['valid'];

        if ((bool) $this->option('verification-config')) {
            if ($failed) {
                return self::FAILURE;
            }

            $publicOrigin = $contract->configuredPublicOrigin();
            if ($publicOrigin === null) {
                return self::FAILURE;
            }

            $this->line(json_encode([
                'schema' => 'ubsc.ddos-verification-config.v2',
                'provider' => (string) config('deployment.edge.provider'),
                'provider_hook' => (string) config('ddos_protection.verification.provider_hook'),
                'provider_zone_fingerprint' => (string) config('ddos_protection.verification.provider_zone_fingerprint'),
                'public_origin' => $publicOrigin,
                'edge_response_header' => (string) config('ddos_protection.verification.edge_response_header'),
                'timeout_seconds' => (int) config('ddos_protection.verification.command_timeout_seconds'),
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }

        $this->components->info('UBSC layered DDoS protection contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        if ($failed) {
            $this->components->error(sprintf(
                'DDoS protection contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('Layered DDoS protection contract passed.');

        return self::SUCCESS;
    }
}
