<?php

namespace App\Http\Controllers\Admin;

use App\Enums\GalleryItemStatus;
use App\Enums\GalleryMediaType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreGalleryItemRequest;
use App\Http\Requests\Admin\UpdateGalleryItemRequest;
use App\Jobs\ProcessGalleryMedia;
use App\Jobs\PurgeGalleryMedia;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryUploadBatch;
use App\Services\Gallery\GalleryAuditService;
use App\Services\Gallery\GalleryCacheService;
use App\Services\Gallery\GalleryFeaturedAutofillService;
use App\Services\Gallery\GalleryIngestService;
use App\Services\Gallery\GalleryPlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GalleryItemController extends Controller
{
    public function store(
        StoreGalleryItemRequest $request,
        GalleryIngestService $ingest,
    ): JsonResponse {
        $file = $request->file('media');
        $batch = $request->filled('batch_uuid')
            ? GalleryUploadBatch::query()->where('uuid', (string) $request->string('batch_uuid'))->firstOrFail()
            : null;
        $result = $ingest->ingest(
            $file,
            $request->validated(),
            $request->user(),
            $batch,
            $request->file('poster'),
            $request->file('subtitle'),
        );
        $item = $result['item'];

        return response()->json([
            'message' => 'Media diterima dan masuk antrean pemrosesan.',
            'uuid' => $item->uuid,
            'status' => $item->status->value,
            'duplicate_of' => $result['duplicate']?->uuid,
        ], 201);
    }

    public function update(
        UpdateGalleryItemRequest $request,
        GalleryItem $galleryItem,
        GalleryPlacementService $placements,
        GalleryAuditService $audit,
        GalleryCacheService $cache,
    ): RedirectResponse {
        $actor = $request->user();
        $posterChanged = $request->hasFile('poster');

        DB::transaction(function () use (
            $request,
            $galleryItem,
            $placements,
            $audit,
            $actor,
            $posterChanged,
        ) {
            $locked = GalleryItem::query()->lockForUpdate()->findOrFail($galleryItem->id);

            if ($locked->lock_version !== $request->integer('lock_version')) {
                throw ValidationException::withMessages([
                    'lock_version' => 'Item telah diubah pengguna lain. Muat ulang sebelum menyimpan.',
                ]);
            }

            if ($locked->status === GalleryItemStatus::Published
                && ! $request->boolean('rights_confirmed')) {
                throw ValidationException::withMessages([
                    'rights_confirmed' => 'Media terbit tidak boleh kehilangan konfirmasi hak publikasi.',
                ]);
            }

            if ($locked->status === GalleryItemStatus::Published && $posterChanged) {
                throw ValidationException::withMessages([
                    'poster' => 'Unpublish video sebelum mengganti poster.',
                ]);
            }

            $before = [
                ...$locked->only([
                    'location_id', 'captured_at', 'credit', 'focal_x', 'focal_y',
                    'poster_second', 'status', 'lock_version',
                ]),
                'translation_id' => $locked->translation('id')?->toArray(),
            ];
            $rightsConfirmed = $request->boolean('rights_confirmed');

            $locked->forceFill([
                'location_id' => $request->integer('location_id'),
                'captured_at' => $request->input('captured_at'),
                'credit' => $request->input('credit'),
                'focal_x' => $request->float('focal_x'),
                'focal_y' => $request->float('focal_y'),
                'poster_second' => $request->input('poster_second'),
                'rights_confirmed_at' => $rightsConfirmed
                    ? ($locked->rights_confirmed_at ?? now())
                    : null,
                'rights_confirmed_by' => $rightsConfirmed ? $actor->id : null,
                'updated_by' => $actor->id,
                'lock_version' => $locked->lock_version + 1,
            ])->save();

            $locked->translations()->updateOrCreate(
                ['locale' => 'id'],
                [
                    'title' => $request->input('title'),
                    'arena_type' => $request->input('arena_type'),
                    'alt_text' => $request->input('alt_text'),
                    'caption' => $request->input('caption'),
                    'search_aliases' => $request->input('search_aliases', []),
                ],
            );

            if ($request->filled('title_en')) {
                $locked->translations()->updateOrCreate(
                    ['locale' => 'en'],
                    [
                        'title' => $request->input('title_en'),
                        'arena_type' => $request->input('arena_type_en'),
                        'alt_text' => $request->input('alt_text_en'),
                        'caption' => $request->input('caption_en'),
                        'search_aliases' => [],
                    ],
                );
            } else {
                $locked->translations()->where('locale', 'en')->delete();
            }

            if ($posterChanged) {
                $poster = $request->file('poster');
                $locked->addMedia($poster)
                    ->usingFileName(Str::uuid().'.'.strtolower($poster->getClientOriginalExtension()))
                    ->toMediaCollection('poster-source');
                $locked->forceFill([
                    'status' => GalleryItemStatus::Processing,
                    'derivatives' => null,
                ])->save();
            }

            if ($request->hasFile('subtitle')) {
                $subtitle = $request->file('subtitle');
                $locked->addMedia($subtitle)
                    ->usingFileName("{$locked->uuid}.vtt")
                    ->toMediaCollection('subtitles');
            }

            $placements->sync($locked, $request->input('sections'), $actor);
            $after = $locked->fresh(['translations']);
            $audit->record($after, 'updated', $before, [
                ...$after->only([
                    'location_id', 'captured_at', 'credit', 'focal_x', 'focal_y',
                    'poster_second', 'status', 'lock_version',
                ]),
                'translation_id' => $after->translation('id')?->toArray(),
            ], $actor);
        });

        if ($posterChanged) {
            ProcessGalleryMedia::dispatch($galleryItem->id)->onQueue('media-video');
        }

        $cache->invalidate();

        return back()->with('success', 'Media galeri berhasil diperbarui.');
    }

    public function retry(Request $request, GalleryItem $galleryItem): RedirectResponse
    {
        $this->authorize('manage-facility-gallery');

        if ($galleryItem->status !== GalleryItemStatus::Failed) {
            throw ValidationException::withMessages([
                'status' => 'Hanya media gagal yang dapat diproses ulang.',
            ]);
        }

        $galleryItem->forceFill([
            'status' => GalleryItemStatus::Processing,
            'processing_error_code' => null,
            'processing_error_detail' => null,
            'updated_by' => $request->user()->id,
            'lock_version' => $galleryItem->lock_version + 1,
        ])->save();

        ProcessGalleryMedia::dispatch($galleryItem->id)->onQueue(
            $galleryItem->media_type === GalleryMediaType::Video
                ? 'media-video'
                : 'media-image',
        );

        return back()->with('success', 'Media masuk kembali ke antrean pemrosesan.');
    }

    public function duplicate(Request $request): JsonResponse
    {
        $this->authorize('view-facility-gallery');
        $data = $request->validate([
            'sha256' => ['required', 'string', 'size:64', 'regex:/^[a-f0-9]{64}$/i'],
        ]);
        $item = GalleryItem::query()
            ->with('translations')
            ->where('source_sha256', strtolower($data['sha256']))
            ->first();

        return response()->json([
            'duplicate' => (bool) $item,
            'item' => $item ? [
                'uuid' => $item->uuid,
                'title' => $item->translation('id')?->title,
                'status' => $item->status->value,
            ] : null,
        ]);
    }

    public function destroy(
        GalleryItem $galleryItem,
        GalleryAuditService $audit,
        GalleryFeaturedAutofillService $autofill,
        GalleryCacheService $cache,
    ): RedirectResponse {
        $this->authorize('delete-facility-gallery');
        $uuid = $galleryItem->uuid;
        $sectionIds = $galleryItem->sections()->pluck('gallery_sections.id');
        $snapshot = [
            ...$galleryItem->only(['uuid', 'media_type', 'status', 'source_sha256']),
            'title' => $galleryItem->translation('id')?->title,
        ];

        DB::transaction(function () use ($galleryItem, $audit, $snapshot) {
            $audit->record($galleryItem, 'hard_deleted', $snapshot, null, request()->user());
            $galleryItem->delete();
        });

        PurgeGalleryMedia::dispatch($uuid);
        $autofill->refillMany($sectionIds, request()->user());
        $cache->invalidate();

        return back()->with('success', 'Media dihapus permanen dan purge turunan dijadwalkan.');
    }
}
