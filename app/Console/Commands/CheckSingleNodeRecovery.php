<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\DisasterRecoveryMonitor;
use App\Services\Monitoring\ExternalAvailabilityConfiguration;
use App\Services\Monitoring\MonitoringBackupMonitor;
use App\Services\Production\ProductionTopologyResolver;
use Illuminate\Console\Command;

final class CheckSingleNodeRecovery extends Command
{
    protected $signature = 'production:single-recovery-check
        {--json : Emit a machine-readable report}';

    protected $description = 'Require fresh backup, PITR, restore-drill, and external-monitoring evidence for single_node';

    public function handle(
        ProductionTopologyResolver $topology,
        MonitoringBackupMonitor $backups,
        DisasterRecoveryMonitor $recovery,
        ExternalAvailabilityConfiguration $external,
    ): int {
        $checks = [];

        if (! $topology->isSingleNode()) {
            $checks[] = [
                'code' => 'topology.single_node',
                'status' => 'fail',
                'message' => 'This verifier is valid only when PRODUCTION_TOPOLOGY is single_node.',
            ];
        } else {
            $backup = $backups->summary();
            $recoverySummary = $recovery->summary();
            $externalSummary = $external->summary();
            $this->operational(
                $checks,
                'recovery.backup_fresh',
                (bool) ($backup['configured'] ?? false),
                (string) ($backup['status'] ?? ''),
                'The latest verified off-site backup is current and operational.',
                (string) ($backup['message'] ?? 'Verified backup evidence is unavailable.'),
            );
            foreach ([
                'pitr' => 'Point-in-time recovery evidence is current and operational.',
                'restore_drill' => 'The latest isolated restore drill is current and operational.',
            ] as $key => $success) {
                $signal = data_get($recoverySummary, 'signals.'.$key, []);
                $signal = is_array($signal) ? $signal : [];
                $this->operational(
                    $checks,
                    'recovery.'.$key,
                    (bool) ($signal['configured'] ?? false),
                    (string) ($signal['status'] ?? ''),
                    $success,
                    (string) ($signal['message'] ?? 'Recovery evidence is unavailable.'),
                );
            }

            $externalReady = (bool) ($externalSummary['external_monitoring_configured'] ?? false)
                && (string) ($externalSummary['status'] ?? '')
                    === MonitoringStatus::Operational->value;
            $checks[] = [
                'code' => 'monitoring.external',
                'status' => $externalReady ? 'pass' : 'fail',
                'message' => $externalReady
                    ? 'Authenticated external availability evidence is current and operational.'
                    : (string) ($externalSummary['message']
                        ?? 'Authenticated external availability evidence is unavailable.'),
            ];
        }

        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $report = [
            'topology' => $topology->current()?->value,
            'valid' => $failures === 0,
            'failures' => $failures,
            'checks' => $checks,
        ];

        if ((bool) $this->option('json')) {
            $this->line(json_encode(
                $report,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
            ));
        } else {
            $this->components->info('UBSC single-node recovery gate');
            $this->table(
                ['Status', 'Check', 'Result'],
                array_map(static fn (array $check): array => [
                    strtoupper($check['status']),
                    $check['code'],
                    $check['message'],
                ], $checks),
            );
        }

        if ($failures > 0) {
            if (! (bool) $this->option('json')) {
                $this->components->error('Single-node recovery evidence is incomplete or stale.');
            }

            return self::FAILURE;
        }

        if (! (bool) $this->option('json')) {
            $this->components->info('Single-node recovery evidence passed.');
        }

        return self::SUCCESS;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function operational(
        array &$checks,
        string $code,
        bool $configured,
        string $status,
        string $success,
        string $failure,
    ): void {
        $passed = $configured && $status === MonitoringStatus::Operational->value;
        $checks[] = [
            'code' => $code,
            'status' => $passed ? 'pass' : 'fail',
            'message' => $passed ? $success : $failure,
        ];
    }
}
