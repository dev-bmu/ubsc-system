<?php

namespace App\Console\Commands;

use App\Enums\GalleryItemStatus;
use App\Models\Gallery\GalleryItem;
use App\Services\Gallery\GalleryPublicationService;
use Illuminate\Console\Command;

class PublishScheduledGalleryItems extends Command
{
    protected $signature = 'gallery:publish-scheduled';

    protected $description = 'Publish due facility gallery items safely';

    public function handle(GalleryPublicationService $publication): int
    {
        $published = 0;
        $failed = 0;

        GalleryItem::query()
            ->where('status', GalleryItemStatus::Scheduled->value)
            ->whereNotNull('publish_at')
            ->where('publish_at', '<=', now())
            ->orderBy('publish_at')
            ->chunkById(50, function ($items) use ($publication, &$published, &$failed) {
                foreach ($items as $item) {
                    try {
                        $publication->publish($item);
                        $published++;
                    } catch (\Throwable $exception) {
                        report($exception);
                        $failed++;
                    }
                }
            });

        $this->info("Published {$published}; failed {$failed}.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
