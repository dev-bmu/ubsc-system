<?php

namespace App\Console\Commands;

use App\Services\Production\CapacityPlanningContract;
use Illuminate\Console\Command;

final class CheckCapacityPlanning extends Command
{
    protected $signature = 'production:capacity-check
        {--strict : Treat advisory mode and every warning as a deployment blocker}
        {--live : Require fresh signed evidence, observation, and plan}';

    protected $description = 'Validate the production capacity-planning and autoscaling control plane';

    public function handle(CapacityPlanningContract $contract): int
    {
        $report = $contract->report((bool) $this->option('live'));
        $this->components->info('UBSC capacity-planning contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        $failed = $this->option('strict') ? ! $report['strict_valid'] : ! $report['valid'];
        if ($failed) {
            $this->components->error(sprintf(
                'Capacity contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('Capacity contract passed.');

        return self::SUCCESS;
    }
}
