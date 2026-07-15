<?php

namespace App\Console\Commands;

use App\Services\Gallery\GalleryAnalyticsAggregationService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Throwable;

class AggregateGalleryAnalytics extends Command
{
    protected $signature = 'gallery:aggregate-analytics {--date= : Date in YYYY-MM-DD, defaults to yesterday}';

    protected $description = 'Build idempotent daily gallery analytics aggregates';

    public function handle(GalleryAnalyticsAggregationService $analytics): int
    {
        try {
            $timezone = config('facility-gallery.timezone', 'Asia/Jakarta');
            $date = $this->option('date')
                ? CarbonImmutable::createFromFormat('!Y-m-d', (string) $this->option('date'), $timezone)
                : CarbonImmutable::now($timezone)->subDay()->startOfDay();

            if (! $date) {
                throw new \InvalidArgumentException('Invalid date.');
            }

            $count = $analytics->aggregateDate($date);
            $this->info("Aggregated {$count} events for {$date->toDateString()}.");

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
