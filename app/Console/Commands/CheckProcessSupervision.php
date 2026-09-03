<?php

namespace App\Console\Commands;

use App\Services\Production\ProcessRuntimeProbe;
use App\Services\Production\ProcessSupervisionContract;
use App\Services\Production\ScheduledTaskSafetyContract;
use Illuminate\Console\Command;

final class CheckProcessSupervision extends Command
{
    protected $signature = 'production:process-check
        {--strict : Treat recommendations as deployment blockers}
        {--profile= : Validate one bundled database or redis profile}
        {--live : Read scheduler and queue-worker dead-man heartbeats}
        {--json : Emit a machine-readable report}';

    protected $description = 'Validate process supervision, scheduler locks, and optional live worker heartbeats';

    public function handle(
        ProcessSupervisionContract $supervision,
        ScheduledTaskSafetyContract $scheduledTasks,
        ProcessRuntimeProbe $runtime,
    ): int {
        $profile = trim((string) $this->option('profile'));
        $static = $profile === ''
            ? $supervision->configuredReport()
            : $supervision->bundledReport($profile);
        $schedule = $scheduledTasks->report();
        $runtimeReport = (bool) $this->option('live') ? $runtime->report() : null;
        $checks = [
            ...$static['checks'],
            ...$schedule['checks'],
            ...($runtimeReport['checks'] ?? []),
        ];
        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $warnings = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'warning',
        ));
        $report = [
            'profile' => $static['profile'],
            'source' => $static['source'],
            'live' => $runtimeReport !== null,
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => $checks,
        ];

        if ((bool) $this->option('json')) {
            $this->line(json_encode(
                $report,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
            ));
        } else {
            $this->components->info('UBSC process-supervision contract');
            $this->line(sprintf(
                'Profile: %s | source: %s | live probe: %s',
                $report['profile'],
                $report['source'],
                $report['live'] ? 'yes' : 'no',
            ));
            $this->table(
                ['Status', 'Check', 'Result'],
                array_map(static fn (array $check): array => [
                    strtoupper($check['status']),
                    $check['code'],
                    $check['message'],
                ], $checks),
            );
        }

        $failed = (bool) $this->option('strict')
            ? ! $report['strict_valid']
            : ! $report['valid'];

        if ($failed) {
            if (! (bool) $this->option('json')) {
                $this->components->error(sprintf(
                    'Process-supervision contract failed with %d failure(s) and %d warning(s).',
                    $failures,
                    $warnings,
                ));
            }

            return self::FAILURE;
        }

        if (! (bool) $this->option('json')) {
            $this->components->info('Process-supervision contract passed.');
        }

        return self::SUCCESS;
    }
}
