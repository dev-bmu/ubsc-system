<?php

namespace App\Services\Gallery;

use App\Enums\GalleryItemStatus;
use App\Models\Gallery\GallerySection;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class GalleryFeaturedAutofillService
{
    public function __construct(
        private readonly GalleryAuditService $audit,
        private readonly GalleryCacheService $cache,
    ) {}

    /**
     * Fill only missing or ineligible featured positions. Existing eligible
     * editorial choices retain their exact position.
     *
     * @return array<int, array{position: int, item_uuid: string}>
     */
    public function refill(GallerySection $section, ?User $actor = null): array
    {
        return DB::transaction(function () use ($section, $actor) {
            $lockedSection = GallerySection::query()->lockForUpdate()->findOrFail($section->id);
            $now = now();

            $placements = DB::table('gallery_item_section as placement')
                ->join('gallery_items as item', 'item.id', '=', 'placement.gallery_item_id')
                ->where('placement.gallery_section_id', $lockedSection->id)
                ->select([
                    'placement.gallery_item_id',
                    'placement.featured_position',
                    'placement.sort_order',
                    'item.uuid',
                    'item.status',
                    'item.published_at',
                    'item.derivatives',
                ])
                ->orderBy('placement.sort_order')
                ->orderByDesc('item.published_at')
                ->orderByDesc('item.id')
                ->get();

            $eligible = $placements->filter(fn ($row) => $row->status === GalleryItemStatus::Published->value
                && $row->published_at !== null
                && CarbonImmutable::parse($row->published_at)->lessThanOrEqualTo($now)
                && $row->derivatives !== null
            );
            $eligibleIds = $eligible->pluck('gallery_item_id')->map(fn ($id) => (int) $id);

            DB::table('gallery_item_section')
                ->where('gallery_section_id', $lockedSection->id)
                ->whereNotNull('featured_position')
                ->when(
                    $eligibleIds->isNotEmpty(),
                    fn ($query) => $query->whereNotIn('gallery_item_id', $eligibleIds->all()),
                    fn ($query) => $query,
                )
                ->update(['featured_position' => null, 'updated_at' => $now]);

            $featured = $eligible
                ->filter(fn ($row) => $row->featured_position !== null)
                ->filter(fn ($row) => (int) $row->featured_position <= $lockedSection->quota)
                ->sortBy('featured_position');
            $usedPositions = $featured->pluck('featured_position')->map(fn ($position) => (int) $position);
            $usedItems = $featured->pluck('gallery_item_id')->map(fn ($id) => (int) $id);
            $missingPositions = collect(range(1, $lockedSection->quota))->diff($usedPositions)->values();
            $candidates = $eligible
                ->reject(fn ($row) => $usedItems->contains((int) $row->gallery_item_id))
                ->values();
            $filled = [];

            foreach ($missingPositions as $index => $position) {
                $candidate = $candidates->get($index);

                if (! $candidate) {
                    break;
                }

                DB::table('gallery_item_section')
                    ->where('gallery_section_id', $lockedSection->id)
                    ->where('gallery_item_id', $candidate->gallery_item_id)
                    ->update([
                        'featured_position' => $position,
                        'assigned_by' => $actor?->id,
                        'updated_at' => $now,
                    ]);

                $filled[] = [
                    'position' => (int) $position,
                    'item_uuid' => $candidate->uuid,
                ];
            }

            if ($filled !== []) {
                $this->audit->record(null, 'featured_slots_auto_filled', null, [
                    'section' => $lockedSection->key,
                    'items' => $filled,
                ], $actor);
            }

            if ($filled !== [] || $missingPositions->isNotEmpty()) {
                $this->cache->invalidate();
            }

            return $filled;
        });
    }

    /**
     * @param  iterable<int, int>  $sectionIds
     */
    public function refillMany(iterable $sectionIds, ?User $actor = null): void
    {
        GallerySection::query()
            ->whereIn('id', collect($sectionIds)->unique()->values())
            ->each(fn (GallerySection $section) => $this->refill($section, $actor));
    }
}
