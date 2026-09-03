<?php

namespace App\Console\Commands;

use App\Services\Production\DeploymentContract;
use Illuminate\Console\Command;

final class CheckDeployment extends Command
{
    protected $signature = 'production:deployment-check
        {--strict : Treat warnings as deployment blockers}';

    protected $description = 'Validate atomic rollout, rollback, schema compatibility, and public-edge contracts';

    public function handle(DeploymentContract $contract): int
    {
        $report = $contract->report();

        $this->components->info('UBSC deployment and edge contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        $failed = (bool) $this->option('strict')
            ? ! $report['strict_valid']
            : ! $report['valid'];

        if ($failed) {
            $this->components->error(sprintf(
                'Deployment contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('Deployment and edge contract passed.');

        return self::SUCCESS;
    }
}
