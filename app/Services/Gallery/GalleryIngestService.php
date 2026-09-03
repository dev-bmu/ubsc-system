<?php

namespace App\Services\Gallery;

use App\Enums\GalleryItemStatus;
use App\Enums\GalleryMediaType;
use App\Jobs\ProcessGalleryMedia;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryUploadBatch;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GalleryIngestService
{
    public function __construct(
        private readonly GalleryPlacementService $placements,
        private readonly GalleryAuditService $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{item: GalleryItem, duplicate: GalleryItem|null}
     */
    public function ingest(
        UploadedFile $file,
        array $data,
        User $actor,
        ?GalleryUploadBatch $batch = null,
        ?UploadedFile $poster = null,
        ?UploadedFile $subtitle = null,
        ?string $precomputedHash = null,
        ?string $detectedMime = null,
    ): array {
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension());
        $mime = strtolower($detectedMime ?: (string) $file->getMimeType());
        $mediaType = $this->mediaTypeFrom($mime, $extension);
        $this->assertSupported($extension, $mediaType);
        $this->assertSize((int) $file->getSize(), $mediaType);
        $hash = strtolower($precomputedHash ?: hash_file('sha256', $file->getRealPath()));
        $duplicate = GalleryItem::query()->where('source_sha256', $hash)->first();

        if ($duplicate && ! filter_var($data['allow_duplicate'] ?? false, FILTER_VALIDATE_BOOL)) {
            throw ValidationException::withMessages([
                'media' => "File identik sudah ada dengan UUID {$duplicate->uuid}. Gunakan item tersebut atau izinkan duplikat.",
            ]);
        }

        if ($batch && ($batch->user_id !== $actor->id || $batch->expires_at?->isPast())) {
            throw ValidationException::withMessages([
                'batch_uuid' => 'Sesi upload tidak tersedia atau telah kedaluwarsa.',
            ]);
        }

        $title = trim((string) ($data['title'] ?? ''))
            ?: $this->titleFromFilename($file->getClientOriginalName());
        $arenaType = trim((string) ($data['arena_type'] ?? ''));
        $altText = trim((string) ($data['alt_text'] ?? ''))
            ?: "{$title}, {$arenaType} di UB Sport Center";

        $item = DB::transaction(function () use (
            $file,
            $data,
            $actor,
            $batch,
            $poster,
            $subtitle,
            $extension,
            $mime,
            $mediaType,
            $hash,
            $title,
            $arenaType,
            $altText,
        ) {
            if ($batch) {
                $lockedBatch = GalleryUploadBatch::query()->lockForUpdate()->findOrFail($batch->id);

                if ($lockedBatch->items()->count() >= $lockedBatch->file_count) {
                    throw ValidationException::withMessages([
                        'batch_uuid' => 'Jumlah file pada batch ini sudah terpenuhi.',
                    ]);
                }
            }

            $rightsConfirmed = filter_var($data['rights_confirmed'] ?? false, FILTER_VALIDATE_BOOL);
            $item = GalleryItem::create([
                'upload_batch_id' => $batch?->id,
                'media_type' => $mediaType,
                'status' => GalleryItemStatus::Processing,
                'location_id' => (int) $data['location_id'],
                'captured_at' => $data['captured_at'] ?? null,
                'credit' => $data['credit'] ?? 'UB Sport Center',
                'source_sha256' => $hash,
                'source_mime' => $mime,
                'source_bytes' => $file->getSize(),
                'focal_x' => (float) ($data['focal_x'] ?? 0.5),
                'focal_y' => (float) ($data['focal_y'] ?? 0.5),
                'poster_second' => $data['poster_second'] ?? null,
                'rights_confirmed_at' => $rightsConfirmed ? now() : null,
                'rights_confirmed_by' => $rightsConfirmed ? $actor->id : null,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);

            $item->translations()->create([
                'locale' => 'id',
                'title' => $title,
                'arena_type' => $arenaType,
                'alt_text' => $altText,
                'caption' => $data['caption'] ?? null,
                'search_aliases' => $data['search_aliases'] ?? [],
            ]);

            if (! empty($data['title_en'])) {
                $item->translations()->create([
                    'locale' => 'en',
                    'title' => $data['title_en'],
                    'arena_type' => $data['arena_type_en'],
                    'alt_text' => $data['alt_text_en'],
                    'caption' => $data['caption_en'] ?? null,
                    'search_aliases' => [],
                ]);
            }

            $item->addMedia($file)
                ->usingFileName(Str::uuid().".{$extension}")
                ->withCustomProperties([
                    'original_name' => $file->getClientOriginalName(),
                    'sha256' => $hash,
                ])
                ->toMediaCollection('source');

            if ($poster) {
                $item->addMedia($poster)
                    ->usingFileName(Str::uuid().'.'.strtolower($poster->getClientOriginalExtension()))
                    ->toMediaCollection('poster-source');
            }

            if ($subtitle) {
                $item->addMedia($subtitle)
                    ->usingFileName("{$item->uuid}.vtt")
                    ->toMediaCollection('subtitles');
            }

            $this->placements->sync($item, $data['sections'], $actor);
            $this->audit->record($item, 'created', null, [
                'media_type' => $mediaType->value,
                'title' => $title,
                'source_sha256' => $hash,
            ], $actor);

            return $item;
        });

        ProcessGalleryMedia::dispatch($item->id)->onQueue(
            $mediaType === GalleryMediaType::Video
                ? (string) config('background_jobs.queues.media_video', 'media-video')
                : (string) config('background_jobs.queues.media_image', 'media-image'),
        );

        return ['item' => $item, 'duplicate' => $duplicate];
    }

    public function mediaTypeFrom(string $mime, string $extension): GalleryMediaType
    {
        return str_starts_with(strtolower($mime), 'video/')
            || in_array(strtolower($extension), ['mp4', 'mov'], true)
                ? GalleryMediaType::Video
                : GalleryMediaType::Image;
    }

    public function assertSize(int $bytes, GalleryMediaType $mediaType): void
    {
        $limit = (int) config(
            $mediaType === GalleryMediaType::Video
                ? 'facility-gallery.video.max_bytes'
                : 'facility-gallery.image.max_bytes',
        );

        if ($bytes > $limit) {
            $label = $mediaType === GalleryMediaType::Video ? '250 MB' : '20 MB';
            throw ValidationException::withMessages([
                'media' => "Ukuran maksimum {$mediaType->value} adalah {$label}.",
            ]);
        }
    }

    private function assertSupported(string $extension, GalleryMediaType $mediaType): void
    {
        $allowed = $mediaType === GalleryMediaType::Video
            ? ['mp4', 'mov']
            : ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

        if (! in_array($extension, $allowed, true)) {
            throw ValidationException::withMessages([
                'media' => 'Format file tidak didukung.',
            ]);
        }
    }

    private function titleFromFilename(string $filename): string
    {
        return Str::of(pathinfo($filename, PATHINFO_FILENAME))
            ->replace(['-', '_'], ' ')
            ->squish()
            ->title()
            ->value();
    }
}
