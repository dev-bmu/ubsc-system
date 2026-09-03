<?php

namespace App\Console\Commands;

use App\Services\Production\ResilienceDrillContract;
use Illuminate\Console\Command;

final class CheckResilienceDrills extends Command
{
    protected $signature = 'production:resilience-check
        {--strict : Treat every warning as a deployment blocker}
        {--live : Require a fresh successful campaign and an intact evidence ledger}';

    protected $description = 'Validate controlled resilience engineering and signed game-day evidence';

    public function handle(ResilienceDrillContract $contract): int
    {
        $report = $contract->report((bool) $this->option('live'));
        $this->components->info('UBSC resilience-drill contract');
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
                'Resilience contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('Resilience contract passed.');

        return self::SUCCESS;
    }
}
