<?php

namespace App\Console\Commands;

use App\Services\Monitoring\PerformanceCapacityMonitor;
use Illuminate\Console\Command;

final class RecommendQueueWorkerCapacity extends Command
{
    protected $signature = 'background-jobs:capacity-plan {--json : Emit machine-readable JSON}';

    protected $description = 'Show the non-authoritative worker sizing advisory from measured queue demand';

    public function handle(PerformanceCapacityMonitor $monitor): int
    {
        $items = (array) data_get($monitor->summary(), 'queues.items', []);
        $rows = collect($items)->map(static function (array $item): array {
            $workers = (array) ($item['workers'] ?? []);

            return [
                'lane' => (string) ($item['label'] ?? $item['key'] ?? 'Unknown'),
                'connection' => (string) ($item['connection'] ?? ''),
                'queue' => (string) ($item['queue'] ?? ''),
                'jobs_per_minute' => (float) ($item['jobs_per_minute'] ?? 0),
                'runtime_p95_ms' => $item['p95_runtime_ms'] ?? null,
                'depth' => $item['depth'] ?? null,
                'minimum' => (int) ($workers['configured_minimum'] ?? 0),
                'recommended' => (int) ($workers['recommended'] ?? 0),
                'maximum' => (int) ($workers['configured_maximum'] ?? 0),
                'automation_eligible' => (bool) ($workers['automation_eligible'] ?? false),
                'capacity_limited' => (bool) ($workers['capacity_limited'] ?? false),
                'reason' => (string) ($workers['reason'] ?? 'No capacity evidence.'),
            ];
        })->values()->all();

        if ($this->option('json')) {
            $this->line((string) json_encode([
                'schema_version' => 1,
                'generated_at' => now()->toIso8601String(),
                'authority' => 'advisory_only',
                'message' => 'Use capacity:plan for signed provider-consumable desired state.',
                'rows' => $rows,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

            return self::SUCCESS;
        }

        $this->table(
            ['Lane', 'Connection / queue', 'Jobs/min', 'P95 runtime', 'Depth', 'Min', 'Recommended', 'Max', 'Limited', 'Automatic'],
            array_map(static fn (array $row): array => [
                $row['lane'],
                $row['connection'].' / '.$row['queue'],
                number_format($row['jobs_per_minute'], 2, '.', ''),
                $row['runtime_p95_ms'] === null ? 'collecting' : $row['runtime_p95_ms'].' ms',
                $row['depth'] ?? 'unknown',
                $row['minimum'],
                $row['recommended'],
                $row['maximum'],
                $row['capacity_limited'] ? 'yes' : 'no',
                $row['automation_eligible'] ? 'eligible' : 'no',
            ], $rows),
        );

        return self::SUCCESS;
    }
}
