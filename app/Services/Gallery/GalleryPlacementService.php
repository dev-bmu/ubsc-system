<?php

namespace App\Services\Gallery;

use App\Enums\GalleryItemStatus;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GallerySection;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GalleryPlacementService
{
    public function __construct(
        private readonly GalleryAuditService $audit,
        private readonly GalleryFeaturedAutofillService $autofill,
        private readonly GalleryCacheService $cache,
        private readonly GallerySearchSyncService $search,
    ) {}

    /**
     * @param  array<int, string>  $sectionKeys
     */
    public function sync(GalleryItem $item, array $sectionKeys, User $actor): void
    {
        $sections = GallerySection::query()->whereIn('key', $sectionKeys)->get();

        if ($sections->count() !== count(array_unique($sectionKeys))) {
            throw ValidationException::withMessages([
                'sections' => 'Salah satu section tidak valid.',
            ]);
        }

        $affectedSectionIds = $item->sections()->pluck('gallery_sections.id')
            ->merge($sections->pluck('id'))
            ->unique()
            ->values();

        DB::transaction(function () use ($item, $sections, $actor) {
            $before = $item->sections()->pluck('key')->sort()->values()->all();
            $sync = [];

            foreach ($sections as $section) {
                $existing = DB::table('gallery_item_section')
                    ->where('gallery_item_id', $item->id)
                    ->where('gallery_section_id', $section->id)
                    ->first();

                $sortOrder = $existing?->sort_order
                    ?? ((int) DB::table('gallery_item_section')
                        ->where('gallery_section_id', $section->id)
                        ->max('sort_order') + 1);

                $sync[$section->id] = [
                    'featured_position' => $existing?->featured_position,
                    'sort_order' => $sortOrder,
                    'assigned_by' => $actor->id,
                ];
            }

            $item->sections()->sync($sync);
            $item->forceFill([
                'updated_by' => $actor->id,
                'lock_version' => $item->lock_version + 1,
            ])->save();

            $this->audit->record($item, 'sections_synced', ['sections' => $before], [
                'sections' => $sections->pluck('key')->sort()->values()->all(),
            ], $actor);
        });

        $this->autofill->refillMany($affectedSectionIds, $actor);
        $this->cache->invalidate();
        $this->search->syncItem($item->fresh(['translations', 'location', 'sections']));
    }

    /**
     * @param  array<int, string>  $orderedItemUuids
     */
    public function curate(GallerySection $section, array $orderedItemUuids, User $actor): void
    {
        $orderedItemUuids = array_values(array_unique($orderedItemUuids));

        if (count($orderedItemUuids) > $section->quota) {
            throw ValidationException::withMessages([
                'items' => "Maksimal {$section->quota} item untuk section {$section->name}.",
            ]);
        }

        $items = GalleryItem::query()
            ->whereIn('uuid', $orderedItemUuids)
            ->where('status', GalleryItemStatus::Published->value)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->whereNotNull('derivatives')
            ->whereHas('sections', fn ($query) => $query->whereKey($section->id))
            ->get()
            ->keyBy('uuid');

        if ($items->count() !== count($orderedItemUuids)) {
            throw ValidationException::withMessages([
                'items' => 'Semua item kurasi harus terdaftar pada section ini.',
            ]);
        }

        DB::transaction(function () use ($section, $orderedItemUuids, $items, $actor) {
            DB::table('gallery_item_section')
                ->where('gallery_section_id', $section->id)
                ->update(['featured_position' => null]);

            foreach ($orderedItemUuids as $index => $uuid) {
                DB::table('gallery_item_section')
                    ->where('gallery_section_id', $section->id)
                    ->where('gallery_item_id', $items[$uuid]->id)
                    ->update([
                        'featured_position' => $index + 1,
                        'sort_order' => $index + 1,
                        'assigned_by' => $actor->id,
                        'updated_at' => now(),
                    ]);
            }

            $this->audit->record(null, 'section_curated', null, [
                'section' => $section->key,
                'items' => $orderedItemUuids,
            ], $actor);
        });

        $this->cache->invalidate();
        $this->search->syncSection($section);
    }

    public function activate(GallerySection $section, User $actor): GallerySection
    {
        $this->autofill->refill($section, $actor);

        $eligibleCount = GalleryItem::query()
            ->where('status', GalleryItemStatus::Published->value)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->whereNotNull('derivatives')
            ->whereHas('sections', function ($query) use ($section) {
                $query->whereKey($section->id)
                    ->whereNotNull('gallery_item_section.featured_position');
            })
            ->count();

        if ($eligibleCount < $section->quota) {
            throw ValidationException::withMessages([
                'section' => "Section memerlukan {$section->quota} item terbit sebelum diaktifkan.",
            ]);
        }

        $before = $section->only(['is_active', 'activated_at']);
        $section->forceFill([
            'is_active' => true,
            'activated_at' => now(),
        ])->save();

        $this->cache->invalidate();
        $this->search->syncSection($section);

        $this->audit->record(null, 'section_activated', $before, [
            'section' => $section->key,
            'is_active' => true,
        ], $actor);

        return $section;
    }

    public function deactivate(GallerySection $section, User $actor): GallerySection
    {
        $section->forceFill(['is_active' => false])->save();
        $this->cache->invalidate();
        $this->search->syncSection($section);
        $this->audit->record(null, 'section_deactivated', null, [
            'section' => $section->key,
            'is_active' => false,
        ], $actor);

        return $section;
    }
}
