<?php

namespace App\Console\Commands;

use App\Services\Monitoring\DataIntegrityMonitor;
use Illuminate\Console\Command;
use Throwable;

final class ScanDataIntegrity extends Command
{
    protected $signature = 'monitor:data-integrity
        {--json : Emit the complete machine-readable snapshot}
        {--fail-on=never : Return failure when status reaches critical or warning}';

    protected $description = 'Scan booking, membership, and payment invariants without modifying domain data';

    public function handle(DataIntegrityMonitor $monitor): int
    {
        $failOn = strtolower(trim((string) $this->option('fail-on')));

        if (! in_array($failOn, ['never', 'critical', 'warning'], true)) {
            $this->error('The --fail-on option must be never, critical, or warning.');

            return self::INVALID;
        }

        try {
            $snapshot = $monitor->refresh();
        } catch (Throwable $exception) {
            $this->error('Data-integrity scan failed: '.$exception->getMessage());

            return self::FAILURE;
        }

        if ((bool) $this->option('json')) {
            $this->line((string) json_encode(
                $snapshot,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
            ));
        } elseif (! $this->option('quiet')) {
            $this->info(sprintf(
                'Data integrity: %s (%d violations across %d checks, %.2f ms)',
                strtoupper((string) $snapshot['status']),
                (int) $snapshot['totals']['violations'],
                (int) $snapshot['totals']['checks'],
                (float) $snapshot['duration_ms'],
            ));

            $rows = [];
            foreach ($snapshot['domains'] as $domain => $summary) {
                $rows[] = [
                    $domain,
                    $summary['status'],
                    $summary['violations'],
                    $summary['critical'],
                    $summary['warning'],
                ];
            }

            $this->table(
                ['Domain', 'Status', 'Violations', 'Critical', 'Warning'],
                $rows,
            );
        }

        return $this->shouldFail((string) $snapshot['status'], $failOn)
            ? self::FAILURE
            : self::SUCCESS;
    }

    private function shouldFail(string $status, string $failOn): bool
    {
        if ($failOn === 'never') {
            return false;
        }

        $rank = [
            'healthy' => 0,
            'warning' => 1,
            'critical' => 2,
        ];

        return ($rank[$status] ?? 2) >= $rank[$failOn];
    }
}
