<?php

namespace App\Console\Commands;

use App\Services\Monitoring\PerformanceMetricRepository;
use Illuminate\Console\Command;

class PrunePerformanceMetrics extends Command
{
    protected $signature = 'performance:prune
        {--limit= : Rows removed per table and batch}
        {--max-batches= : Maximum bounded batches per invocation}';

    protected $description = 'Prune expired aggregate performance buckets in bounded batches';

    public function handle(PerformanceMetricRepository $metrics): int
    {
        $limit = min(25_000, max(100, (int) ($this->option('limit')
            ?: config('performance.prune_batch_size', 5_000))));
        $maxBatches = min(20, max(1, (int) ($this->option('max-batches')
            ?: config('performance.prune_max_batches', 4))));
        $totals = ['request_buckets' => 0, 'queue_buckets' => 0];

        for ($batch = 0; $batch < $maxBatches; $batch++) {
            $pruned = $metrics->prune($limit);
            $totals['request_buckets'] += (int) $pruned['request_buckets'];
            $totals['queue_buckets'] += (int) $pruned['queue_buckets'];

            if ((int) $pruned['request_buckets'] < $limit
                && (int) $pruned['queue_buckets'] < $limit) {
                break;
            }
        }

        if (! $this->option('quiet')) {
            $this->components->info(sprintf(
                'Pruned %d request buckets and %d queue buckets.',
                $totals['request_buckets'],
                $totals['queue_buckets'],
            ));
        }

        return self::SUCCESS;
    }
}
