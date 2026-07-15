<?php

namespace App\Console\Commands;

use App\Models\Gallery\GalleryAnalyticsEvent;
use App\Models\Gallery\GalleryOperationRequest;
use App\Models\Gallery\GalleryUploadBatch;
use App\Models\Gallery\GalleryUploadSession;
use App\Services\Gallery\GalleryAnalyticsAggregationService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneGalleryOperationalData extends Command
{
    protected $signature = 'gallery:prune';

    protected $description = 'Prune expired gallery analytics and upload sessions';

    public function handle(GalleryAnalyticsAggregationService $analytics): int
    {
        $analyticsCutoff = now()->subDays(
            (int) config('facility-gallery.analytics_retention_days', 90),
        );

        GalleryAnalyticsEvent::query()
            ->where('occurred_at', '<', $analyticsCutoff)
            ->selectRaw('DATE(occurred_at) as event_date')
            ->distinct()
            ->pluck('event_date')
            ->each(fn ($date) => $analytics->aggregateDate(
                CarbonImmutable::parse($date, config('facility-gallery.timezone', 'Asia/Jakarta')),
            ));

        $events = GalleryAnalyticsEvent::query()
            ->where('occurred_at', '<', $analyticsCutoff)
            ->delete();

        $batches = GalleryUploadBatch::query()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->where('status', 'active')
            ->update(['status' => 'expired']);

        $operations = GalleryOperationRequest::query()
            ->where('expires_at', '<', now())
            ->delete();

        $uploadSessions = 0;
        GalleryUploadSession::query()
            ->where('expires_at', '<', now())
            ->whereNotIn('status', ['completed'])
            ->chunkById(100, function ($sessions) use (&$uploadSessions) {
                foreach ($sessions as $session) {
                    Storage::disk(config('facility-gallery.staging_disk', 'local'))
                        ->deleteDirectory("facility-gallery-staging/{$session->uuid}");
                    $session->delete();
                    $uploadSessions++;
                }
            });

        $this->info("Pruned {$events} analytics events, {$operations} operation keys, and {$uploadSessions} upload sessions; expired {$batches} batches.");

        return self::SUCCESS;
    }
}
