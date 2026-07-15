<?php

namespace App\Services\Gallery;

use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GallerySection;
use Throwable;

class GallerySearchSyncService
{
    public function syncItem(GalleryItem $item): void
    {
        if (config('scout.driver') === 'null') {
            return;
        }

        try {
            $item->loadMissing(['translations', 'location', 'sections']);

            if ($item->shouldBeSearchable()) {
                $item->searchable();
            } else {
                $item->unsearchable();
            }
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    public function syncSection(GallerySection $section): void
    {
        $section->items()
            ->select('gallery_items.*')
            ->with(['translations', 'location', 'sections'])
            ->orderBy('gallery_items.id')
            ->chunkById(200, fn ($items) => $items->each(
                fn (GalleryItem $item) => $this->syncItem($item),
            ), 'gallery_items.id', 'id');
    }
}
