<?php

namespace App\Console\Commands;

use App\Services\Monitoring\ReadinessService;
use App\Services\Production\ProductionRuntimeContract;
use Illuminate\Console\Command;

final class CheckProductionContract extends Command
{
    protected $signature = 'production:check
        {--strict : Treat recommendations as deployment blockers}
        {--probe : Perform bounded repeatable dependency probes}
        {--json : Emit the contract report as JSON; cannot be combined with --probe}';

    protected $description = 'Validate the active UBSC production topology contract';

    public function handle(
        ProductionRuntimeContract $contract,
        ReadinessService $readiness,
    ): int {
        $report = $contract->report();
        $strict = (bool) $this->option('strict');

        if ((bool) $this->option('json')) {
            if ((bool) $this->option('probe')) {
                $this->components->error('--json cannot be combined with --probe.');

                return self::INVALID;
            }

            $this->line(json_encode($report, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

            return ($strict ? $report['strict_valid'] : $report['valid'])
                ? self::SUCCESS
                : self::FAILURE;
        }

        $this->components->info(sprintf(
            'UBSC production contract [%s]',
            (string) ($report['topology'] ?: 'unresolved'),
        ));
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(
                static fn (array $check): array => [
                    strtoupper($check['status']),
                    $check['code'],
                    $check['message'],
                ],
                $report['checks'],
            ),
        );

        $probeFailed = false;
        if ((bool) $this->option('probe')) {
            $dependencyReport = $readiness->report(true);
            $this->newLine();
            $this->components->info('Bounded dependency probes');
            $this->table(
                ['Requirement', 'Dependency', 'Status', 'Latency', 'Attempts'],
                array_map(static fn (array $check): array => [
                    $check['required'] ? 'required' : 'advisory',
                    $check['key'],
                    $check['status'],
                    $check['latency_ms'] === null ? '-' : $check['latency_ms'].' ms',
                    $check['attempts'],
                ], $dependencyReport['checks']),
            );
            $probeFailed = ! $dependencyReport['ready']
                || ($strict && ($dependencyReport['degraded'] ?? false));
        }

        $failed = $probeFailed || ($strict ? ! $report['strict_valid'] : ! $report['valid']);

        if ($failed) {
            $this->components->error(sprintf(
                'Production contract failed with %d failure(s) and %d warning(s).',
                $report['failures'],
                $report['warnings'],
            ));

            return self::FAILURE;
        }

        $this->components->info('Production contract passed.');

        return self::SUCCESS;
    }
}
