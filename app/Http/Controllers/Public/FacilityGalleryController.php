<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GallerySection;
use App\Services\Gallery\GalleryPublicService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class FacilityGalleryController extends Controller
{
    public function index(Request $request, GalleryPublicService $gallery): Response|JsonResponse
    {
        return $this->render($request, $gallery);
    }

    public function section(
        Request $request,
        string $section,
        GalleryPublicService $gallery,
    ): Response|JsonResponse {
        $record = GallerySection::query()
            ->where('slug', $section)
            ->orWhere('key', $section)
            ->firstOrFail();

        abort_unless($record->is_active, 404);

        return $this->render($request, $gallery, $record);
    }

    public function media(
        Request $request,
        string $galleryItem,
        GalleryPublicService $gallery,
    ): JsonResponse {
        $section = null;

        if ($request->filled('section')) {
            $section = GallerySection::query()
                ->where('key', $request->query('section'))
                ->orWhere('slug', $request->query('section'))
                ->firstOrFail();
            abort_unless($section->is_active, 404);
        }

        return response()->json($gallery->mediaContext($request, $galleryItem, $section))
            ->header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    private function render(
        Request $request,
        GalleryPublicService $gallery,
        ?GallerySection $section = null,
    ): Response|JsonResponse {
        $items = $gallery->archive($request, $section);

        if ($request->expectsJson()) {
            $response = response()->json(['items' => $items]);
            $response->setEtag(sha1((string) $response->getContent()));
            $response->headers->set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
            $response->isNotModified($request);

            return $response;
        }

        $title = $section
            ? "Galeri {$section->name} | UB Sport Center"
            : 'Galeri Fasilitas Olahraga | UB Sport Center Malang';
        $description = $section
            ? "Jelajahi koleksi visual {$section->name} di UB Sport Center Malang."
            : 'Jelajahi koleksi arena indoor, lokasi eksklusif, dan fasilitas outdoor UB Sport Center Malang.';
        $canonicalPath = $section
            ? route('gallery.section', $section->slug, false)
            : route('gallery.index', [], false);
        $canonical = rtrim((string) config('facility-gallery.canonical_origin'), '/').$canonicalPath;
        if ($items->currentPage() > 1) {
            $canonical .= '?page='.$items->currentPage();
        }
        $firstImage = collect($items->items())
            ->map(fn (array $item) => $item['image']['fallback_url']
                ?? $item['poster']['fallback_url']
                ?? null)
            ->filter()
            ->first();
        $itemList = collect($items->items())->values()->map(fn (array $item, int $index) => [
            '@type' => 'ListItem',
            'position' => (($items->currentPage() - 1) * $items->perPage()) + $index + 1,
            'name' => $item['title'],
            'url' => $canonical.'#media-'.$item['uuid'],
        ])->all();

        return Inertia::render('Gallery/Index', [
            'items' => $items,
            'filters' => $request->only(['q', 'section', 'location', 'media_type', 'year']),
            'filter_options' => $gallery->filterOptions(),
            'active_section' => $section ? [
                'key' => $section->key,
                'slug' => $section->slug,
                'name' => $section->name,
            ] : null,
            'search_degraded' => $gallery->searchIsDegraded(),
            'seo' => [
                'title' => $title,
                'description' => $description,
                'canonical' => $canonical,
                'image' => $firstImage ? $this->absolute($firstImage) : null,
                'robots' => collect(['q', 'location', 'media_type', 'year', 'media'])->contains(
                    fn (string $key) => $request->filled($key),
                ) ? 'noindex,follow' : 'index,follow,max-image-preview:large',
                'previous' => $items->previousPageUrl()
                    ? $this->canonicalPagination($canonicalPath, $items->currentPage() - 1)
                    : null,
                'next' => $items->nextPageUrl()
                    ? $this->canonicalPagination($canonicalPath, $items->currentPage() + 1)
                    : null,
                'json_ld' => [
                    '@context' => 'https://schema.org',
                    '@type' => 'CollectionPage',
                    'name' => $title,
                    'description' => $description,
                    'url' => $canonical,
                    'mainEntity' => [
                        '@type' => 'ItemList',
                        'numberOfItems' => $items->total(),
                        'itemListElement' => $itemList,
                    ],
                ],
            ],
        ]);
    }

    private function canonicalPagination(string $path, int $page): string
    {
        $url = rtrim((string) config('facility-gallery.canonical_origin'), '/').$path;

        return $page > 1 ? "{$url}?page={$page}" : $url;
    }

    private function absolute(string $url): string
    {
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return rtrim((string) config('facility-gallery.canonical_origin'), '/').'/'.ltrim($url, '/');
    }
}
