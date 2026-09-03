<?php

namespace App\Jobs;

use App\Enums\GalleryItemStatus;
use App\Enums\GalleryMediaType;
use App\Exceptions\GalleryCapabilityException;
use App\Models\Gallery\GalleryItem;
use App\Services\Gallery\GalleryAuditService;
use App\Services\Gallery\GalleryImageProcessor;
use App\Services\Gallery\GalleryReadinessService;
use App\Services\Gallery\GalleryVideoProcessor;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Throwable;

class ProcessGalleryMedia implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 1000;

    public bool $failOnTimeout = true;

    public int $uniqueFor = 3_600;

    public function __construct(public readonly int $galleryItemId)
    {
        $this->onConnection((string) config('background_jobs.media_connection', 'database-long'));
        $this->onQueue((string) config('background_jobs.queues.media_image', 'media-image'));
        $this->afterCommit();
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [15, 60, 300];
    }

    public function uniqueId(): string
    {
        return 'gallery-item:'.$this->galleryItemId;
    }

    public function middleware(): array
    {
        return [
            (new WithoutOverlapping("gallery-item:{$this->galleryItemId}"))
                ->releaseAfter(15)
                ->expireAfter(1_100),
        ];
    }

    public function handle(
        GalleryImageProcessor $images,
        GalleryVideoProcessor $videos,
        GalleryReadinessService $readiness,
        GalleryAuditService $audit,
    ): void {
        $item = GalleryItem::query()->with(['media', 'translations', 'sections', 'location'])->find($this->galleryItemId);

        if (! $item || $item->status === GalleryItemStatus::Published) {
            return;
        }

        $source = $item->getFirstMedia('source');

        if (! $source) {
            $this->markFailed($item, 'source_missing', 'File sumber media tidak ditemukan.', $audit);

            return;
        }

        $item->forceFill([
            'status' => GalleryItemStatus::Processing,
            'processing_error_code' => null,
            'processing_error_detail' => null,
        ])->save();

        try {
            if ($item->media_type === GalleryMediaType::Image) {
                $image = $images->processMedia($source, $item->uuid);
                $derivatives = ['image' => $image];
                $item->forceFill([
                    'source_width' => $image['width'],
                    'source_height' => $image['height'],
                ]);
            } else {
                $video = $videos->process($item, $source);
                $derivatives = ['video' => $video];
                $item->forceFill([
                    'source_width' => $video['width'],
                    'source_height' => $video['height'],
                    'duration_ms' => $video['duration_ms'],
                ]);
            }

            $item->forceFill([
                'derivatives' => $derivatives,
                'status' => GalleryItemStatus::Draft,
                'processing_error_code' => null,
                'processing_error_detail' => null,
                'lock_version' => $item->lock_version + 1,
            ])->save();

            if ($readiness->isReady($item->fresh(['media', 'translations', 'sections', 'location']))) {
                $item->forceFill(['status' => GalleryItemStatus::ReadyForReview])->save();
            }

            $this->updateBatch($item);
            $audit->record($item, 'media_processed', null, [
                'media_type' => $item->media_type->value,
                'source_width' => $item->source_width,
                'source_height' => $item->source_height,
                'duration_ms' => $item->duration_ms,
            ]);
        } catch (GalleryCapabilityException $exception) {
            $this->markFailed($item, $exception->capabilityCode, $exception->getMessage(), $audit);
        }
    }

    public function failed(?Throwable $exception): void
    {
        $item = GalleryItem::find($this->galleryItemId);

        if (! $item) {
            return;
        }

        $this->markFailed(
            $item,
            'processing_failed',
            $exception?->getMessage() ?: 'Pemrosesan media gagal setelah beberapa percobaan.',
            app(GalleryAuditService::class),
        );
    }

    private function markFailed(
        GalleryItem $item,
        string $code,
        string $detail,
        GalleryAuditService $audit,
    ): void {
        $item->forceFill([
            'status' => GalleryItemStatus::Failed,
            'processing_error_code' => $code,
            'processing_error_detail' => mb_substr($detail, 0, 4000),
            'lock_version' => $item->lock_version + 1,
        ])->save();

        $this->updateBatch($item);
        $audit->record($item, 'media_processing_failed', null, [
            'code' => $code,
            'detail' => mb_substr($detail, 0, 500),
        ]);
    }

    private function updateBatch(GalleryItem $item): void
    {
        $batch = $item->batch;

        if (! $batch) {
            return;
        }

        $failedCount = $batch->items()
            ->where('status', GalleryItemStatus::Failed->value)
            ->count();
        $completedCount = $batch->items()
            ->whereIn('status', [
                GalleryItemStatus::Draft->value,
                GalleryItemStatus::ReadyForReview->value,
                GalleryItemStatus::Scheduled->value,
                GalleryItemStatus::Published->value,
                GalleryItemStatus::Unpublished->value,
            ])
            ->count();
        $isComplete = ($completedCount + $failedCount) >= $batch->file_count;

        $batch->forceFill([
            'completed_count' => $completedCount,
            'failed_count' => $failedCount,
            'status' => $isComplete
                ? ($failedCount > 0 ? 'completed_with_errors' : 'completed')
                : 'processing',
        ])->save();
    }
}
