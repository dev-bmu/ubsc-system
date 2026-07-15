<?php

namespace App\Services\Gallery;

use App\Enums\GalleryItemStatus;
use App\Models\Gallery\GalleryItem;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;

class GalleryPublicationService
{
    public function __construct(
        private readonly GalleryReadinessService $readiness,
        private readonly GalleryAuditService $audit,
        private readonly GalleryFeaturedAutofillService $autofill,
        private readonly GalleryCacheService $cache,
    ) {}

    public function submitForReview(GalleryItem $item, User $actor): GalleryItem
    {
        return $this->transition($item, GalleryItemStatus::ReadyForReview, $actor);
    }

    public function schedule(GalleryItem $item, string $localDateTime, User $actor): GalleryItem
    {
        $publishAt = CarbonImmutable::parse(
            $localDateTime,
            config('facility-gallery.timezone', 'Asia/Jakarta'),
        )->utc();

        if ($publishAt->lessThanOrEqualTo(now()->addMinute())) {
            throw ValidationException::withMessages([
                'publish_at' => 'Jadwal harus lebih dari satu menit dari sekarang.',
            ]);
        }

        return DB::transaction(function () use ($item, $actor, $publishAt) {
            $locked = GalleryItem::query()->lockForUpdate()->findOrFail($item->id);
            $this->assertReady($locked);
            if ($locked->status !== GalleryItemStatus::Scheduled) {
                $this->assertTransition($locked, GalleryItemStatus::Scheduled);
            }
            $before = $this->snapshot($locked);

            $locked->forceFill([
                'status' => GalleryItemStatus::Scheduled,
                'publish_at' => $publishAt,
                'updated_by' => $actor->id,
                'lock_version' => $locked->lock_version + 1,
            ])->save();

            $this->audit->record($locked, 'scheduled', $before, $this->snapshot($locked), $actor);

            return $locked->fresh(['translations', 'sections', 'location', 'media']);
        });
    }

    public function publish(GalleryItem $item, ?User $actor = null): GalleryItem
    {
        $published = DB::transaction(function () use ($item, $actor) {
            $locked = GalleryItem::query()->lockForUpdate()->findOrFail($item->id);
            $this->assertReady($locked);

            if ($locked->status !== GalleryItemStatus::Published) {
                $this->assertTransition($locked, GalleryItemStatus::Published);
            }

            $before = $this->snapshot($locked);
            $locked->forceFill([
                'status' => GalleryItemStatus::Published,
                'publish_at' => null,
                'published_at' => $locked->published_at ?? now(),
                'updated_by' => $actor?->id ?? $locked->updated_by,
                'lock_version' => $locked->lock_version + 1,
            ])->save();

            $this->audit->record($locked, 'published', $before, $this->snapshot($locked), $actor);

            return $locked->fresh(['translations', 'sections', 'location', 'media']);
        });

        $this->autofill->refillMany($published->sections->pluck('id'), $actor);
        $this->cache->invalidate();

        return $published;
    }

    public function unpublish(GalleryItem $item, User $actor): GalleryItem
    {
        $sectionIds = $item->sections()->pluck('gallery_sections.id');
        $unpublished = $this->transition($item, GalleryItemStatus::Unpublished, $actor);
        $this->autofill->refillMany($sectionIds, $actor);
        $this->cache->invalidate();

        return $unpublished;
    }

    public function moveToDraft(GalleryItem $item, User $actor): GalleryItem
    {
        return $this->transition($item, GalleryItemStatus::Draft, $actor);
    }

    public function returnToReview(GalleryItem $item, User $actor): GalleryItem
    {
        return $this->transition($item, GalleryItemStatus::ReadyForReview, $actor);
    }

    private function transition(
        GalleryItem $item,
        GalleryItemStatus $target,
        User $actor,
    ): GalleryItem {
        return DB::transaction(function () use ($item, $target, $actor) {
            $locked = GalleryItem::query()->lockForUpdate()->findOrFail($item->id);

            if (in_array($target, [
                GalleryItemStatus::ReadyForReview,
                GalleryItemStatus::Published,
            ], true)) {
                $this->assertReady($locked);
            }

            $this->assertTransition($locked, $target);
            $before = $this->snapshot($locked);

            $locked->forceFill([
                'status' => $target,
                'publish_at' => null,
                'updated_by' => $actor->id,
                'lock_version' => $locked->lock_version + 1,
            ])->save();

            $this->audit->record(
                $locked,
                'status_changed',
                $before,
                $this->snapshot($locked),
                $actor,
            );

            return $locked->fresh(['translations', 'sections', 'location', 'media']);
        });
    }

    private function assertReady(GalleryItem $item): void
    {
        $errors = $this->readiness->errors($item);

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function assertTransition(GalleryItem $item, GalleryItemStatus $target): void
    {
        if (! $item->status->canTransitionTo($target)) {
            throw new LogicException(
                "Status {$item->status->value} tidak dapat dipindahkan ke {$target->value}.",
            );
        }
    }

    private function snapshot(GalleryItem $item): array
    {
        return [
            'status' => $item->status->value,
            'publish_at' => $item->publish_at?->toIso8601String(),
            'published_at' => $item->published_at?->toIso8601String(),
            'lock_version' => $item->lock_version,
        ];
    }
}
