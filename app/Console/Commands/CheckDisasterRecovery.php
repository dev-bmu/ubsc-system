<?php

namespace App\Console\Commands;

use App\Services\Monitoring\DisasterRecoveryMonitor;
use App\Services\Production\DisasterRecoveryContract;
use Illuminate\Console\Command;

final class CheckDisasterRecovery extends Command
{
    protected $signature = 'production:recovery-check
        {--strict : Treat recommendations as deployment blockers}
        {--live : Require fresh PITR, immutable backup, restore-drill, and evidence signals}';

    protected $description = 'Validate PITR, immutable backup, and tested recovery contracts';

    public function handle(
        DisasterRecoveryContract $contract,
        DisasterRecoveryMonitor $monitor,
    ): int {
        $report = $contract->report();
        $strict = (bool) $this->option('strict');

        $this->components->info('UBSC disaster-recovery contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        $liveFailed = false;
        if ((bool) $this->option('live')) {
            $live = $monitor->summary();
            $this->newLine();
            $this->components->info('Observed recovery evidence');
            $this->table(
                ['Signal', 'Status', 'Last observed', 'Result'],
                collect((array) ($live['signals'] ?? []))->map(
                    static fn (array $signal, string $key): array => [
                        $key,
                        strtoupper((string) ($signal['status'] ?? 'unknown')),
                        (string) ($signal['observed_at'] ?? '-'),
                        (string) ($signal['message'] ?? ''),
                    ],
                )->values()->all(),
            );
            $liveFailed = ($live['status'] ?? 'unknown') !== 'operational';
        }

        $failed = $liveFailed || ($strict ? ! $report['strict_valid'] : ! $report['valid']);
        if ($failed) {
            $this->components->error('Disaster-recovery contract failed.');

            return self::FAILURE;
        }

        $this->components->info('Disaster-recovery contract passed.');

        return self::SUCCESS;
    }
}
