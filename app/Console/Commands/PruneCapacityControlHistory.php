<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class PruneCapacityControlHistory extends Command
{
    protected $signature = 'capacity:prune';

    protected $description = 'Prune bounded signed capacity evidence, observations, plans, and inactive anti-flap state';

    public function handle(): int
    {
        $batch = (int) config('capacity_planning.retention.prune_batch_size', 1_000);
        $maxBatches = (int) config('capacity_planning.retention.prune_max_batches', 10);
        $evidence = $this->prune(
            'capacity_load_evidence',
            'imported_at',
            now((string) config('app.timezone', 'UTC'))->subDays((int) config('capacity_planning.retention.evidence_days', 365)),
            $batch,
            $maxBatches,
        );
        $observations = $this->prune(
            'capacity_platform_observations',
            'recorded_at',
            now((string) config('app.timezone', 'UTC'))->subDays((int) config('capacity_planning.retention.observation_days', 14)),
            $batch,
            $maxBatches,
        );
        $plans = $this->prune(
            'capacity_scaling_plans',
            'recorded_at',
            now((string) config('app.timezone', 'UTC'))->subDays((int) config('capacity_planning.retention.decision_days', 30)),
            $batch,
            $maxBatches,
        );
        $states = $this->pruneScalingStates(
            now((string) config('app.timezone', 'UTC'))->subDays((int) config('capacity_planning.retention.decision_days', 30)),
            $batch,
            $maxBatches,
        );

        if (! $this->output->isQuiet()) {
            $this->components->info("Pruned {$evidence} load evidence record(s), {$observations} platform observation(s), {$plans} plan(s), and {$states} inactive scaling state(s).");
        }

        return self::SUCCESS;
    }

    private function prune(
        string $table,
        string $column,
        \DateTimeInterface $before,
        int $batch,
        int $maxBatches,
    ): int {
        $total = 0;
        $batches = 0;
        do {
            $ids = DB::table($table)
                ->where($column, '<', $before)
                ->orderBy($column)
                ->orderBy('id')
                ->limit($batch)
                ->pluck('id');
            if ($ids->isEmpty()) {
                break;
            }

            $deleted = DB::table($table)->whereIn('id', $ids)->delete();
            $total += $deleted;
            $batches++;
        } while ($deleted === $batch && $batches < $maxBatches);

        return $total;
    }

    private function pruneScalingStates(
        \DateTimeInterface $before,
        int $batch,
        int $maxBatches,
    ): int {
        $total = 0;
        $batches = 0;
        do {
            $keys = DB::table('capacity_scaling_states')
                ->where('updated_at', '<', $before)
                ->orderBy('updated_at')
                ->orderBy('target_key')
                ->limit($batch)
                ->pluck('target_key');
            if ($keys->isEmpty()) {
                break;
            }

            // Recheck the cutoff during deletion. A concurrent planner may
            // have refreshed one of the selected namespaces after the read.
            $deleted = DB::table('capacity_scaling_states')
                ->where('updated_at', '<', $before)
                ->whereIn('target_key', $keys)
                ->delete();
            $total += $deleted;
            $batches++;
        } while ($keys->count() === $batch && $batches < $maxBatches);

        return $total;
    }
}
