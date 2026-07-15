<?php

namespace App\Http\Controllers\Admin;

use App\Enums\GalleryItemStatus;
use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GallerySection;
use App\Services\Gallery\GalleryMediaUrlService;
use App\Services\Gallery\GalleryPlacementService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class GalleryCurationController extends Controller
{
    public function candidates(
        Request $request,
        GallerySection $gallerySection,
        GalleryMediaUrlService $urls,
    ): JsonResponse {
        $this->authorize('view-facility-gallery');
        $search = trim((string) $request->query('q', ''));
        $items = GalleryItem::query()
            ->where('status', GalleryItemStatus::Published->value)
            ->whereHas('sections', fn (Builder $query) => $query->whereKey($gallerySection->id))
            ->with(['translations', 'location', 'media'])
            ->when($search !== '', fn (Builder $query) => $query->whereHas(
                'translations',
                fn (Builder $translations) => $translations
                    ->where('title', 'like', "%{$search}%")
                    ->orWhere('arena_type', 'like', "%{$search}%"),
            ))
            ->latest('published_at')
            ->limit(30)
            ->get()
            ->map(function (GalleryItem $item) use ($urls) {
                $derivatives = $item->derivatives ?? [];
                $image = $urls->image($derivatives['image'] ?? null);
                $video = $urls->video($derivatives['video'] ?? null);

                return [
                    'uuid' => $item->uuid,
                    'title' => $item->translation('id')?->title ?? '',
                    'arena_type' => $item->translation('id')?->arena_type ?? '',
                    'location' => $item->location?->name,
                    'thumbnail' => $image['fallback_url']
                        ?? $video['poster']['fallback_url']
                        ?? null,
                ];
            })->values();

        return response()->json(['items' => $items]);
    }

    public function update(
        Request $request,
        GallerySection $gallerySection,
        GalleryPlacementService $placements,
    ): RedirectResponse {
        $this->authorize('manage-facility-gallery');
        $data = $request->validate([
            'items' => ['present', 'array', 'max:8'],
            'items.*' => ['uuid', 'distinct', 'exists:gallery_items,uuid'],
        ]);
        $placements->curate($gallerySection, $data['items'], $request->user());

        return back()->with('success', "Kurasi {$gallerySection->name} diperbarui.");
    }

    public function activate(
        Request $request,
        GallerySection $gallerySection,
        GalleryPlacementService $placements,
    ): RedirectResponse {
        $this->authorize('publish-facility-gallery');
        $placements->activate($gallerySection, $request->user());

        return back()->with('success', "{$gallerySection->name} diaktifkan.");
    }

    public function deactivate(
        Request $request,
        GallerySection $gallerySection,
        GalleryPlacementService $placements,
    ): RedirectResponse {
        $this->authorize('publish-facility-gallery');
        $placements->deactivate($gallerySection, $request->user());

        return back()->with('success', "{$gallerySection->name} dinonaktifkan.");
    }
}
