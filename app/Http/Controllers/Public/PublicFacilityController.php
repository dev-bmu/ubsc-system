<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\Public\FacilityCategoryResource;
use App\Http\Resources\Public\FacilityResource;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Services\Gallery\GalleryPublicService;
use App\Support\NewsContentSanitizer;
use App\Support\PublicSeo;
use App\Support\SafePublicUrl;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PublicFacilityController extends Controller
{
    public function index(GalleryPublicService $gallery): Response
    {
        return Inertia::render('FacilityPage', [
            'facilities' => FacilityResource::collection(
                Facility::active()->with('category', 'prices')->orderBy('sort_order')->get()
            )->resolve(),
            'categories' => FacilityCategoryResource::collection(
                FacilityCategory::orderBy('sort_order')->get()
            )->resolve(),
            'gallery_sections' => $gallery->curatedSections(),
        ]);
    }

    public function show(Request $request, string $slug): Response|RedirectResponse
    {
        $slugCandidates = $this->slugCandidates($slug);
        $facility = Facility::active()
            ->with(['category', 'media'])
            ->whereIn('slug', $slugCandidates)
            ->get()
            ->sortBy(fn (Facility $item): int => array_search($item->slug, $slugCandidates, true))
            ->first();

        abort_unless($facility, 404);

        if ($slug !== $facility->slug) {
            return redirect()->route(
                'facilities.show',
                ['slug' => $facility->slug],
                301,
            );
        }

        $similarFacilities = Facility::active()
            ->with(['category', 'media'])
            ->whereKeyNot($facility->id)
            ->orderBy('sort_order')
            ->limit(6)
            ->get()
            ->map(fn (Facility $item): array => $this->cardPayload($item))
            ->values();

        $facilityItem = $this->detailPayload($facility);

        return Inertia::render('Facilities/Show', [
            'facilityItem' => $facilityItem,
            'similarFacilities' => $similarFacilities,
            'seo' => PublicSeo::facility($request, $facilityItem),
        ]);
    }

    private function detailPayload(Facility $facility): array
    {
        $images = collect([$facility->getFirstMediaUrl('hero')])
            ->merge($facility->getMedia('gallery')->map(fn ($media): string => $media->getUrl()))
            ->filter()
            ->unique()
            ->values();

        $mapUrl = SafePublicUrl::googleMaps(
            $facility->display_metadata['map_url']
                ?? $facility->display_metadata['mapLink']
                ?? null,
        ) ?? $this->defaultMapUrl($facility);
        $mapEmbedUrl = SafePublicUrl::googleMaps(
            $facility->display_metadata['map_embed_url']
                ?? $facility->display_metadata['mapEmbedUrl']
                ?? null,
        ) ?? '';

        return [
            'id' => $facility->id,
            'name' => $facility->name,
            'slug' => $facility->slug,
            'category' => $facility->category?->name ?? '',
            'venue_type' => $facility->venue_type ?? '',
            'location' => $facility->location ?? '',
            'class_code' => $facility->class_code ?? '',
            'description' => NewsContentSanitizer::clean($facility->description),
            'map_embed_url' => $mapEmbedUrl,
            'map_url' => $mapUrl,
            'images_array' => $images->all(),
            'cover_image' => $facility->getFirstMediaUrl('hero'),
        ];
    }

    private function cardPayload(Facility $facility): array
    {
        return [
            'id' => $facility->id,
            'name' => $facility->name,
            'slug' => $facility->slug,
            'category' => $facility->category?->name ?? '',
            'venue_type' => $facility->venue_type ?? '',
            'location' => $facility->location ?? '',
            'description' => NewsContentSanitizer::clean($facility->description),
            'cover_image' => $facility->getFirstMediaUrl('hero'),
            'map_url' => SafePublicUrl::googleMaps(
                $facility->display_metadata['map_url']
                    ?? $facility->display_metadata['mapLink']
                    ?? null,
            ) ?? $this->defaultMapUrl($facility),
        ];
    }

    private function defaultMapUrl(Facility $facility): string
    {
        $location = strtolower(trim((string) $facility->location));
        $name = strtolower(trim((string) $facility->name));

        if (str_contains($location, 'dieng') || str_contains($name, 'dieng')) {
            return 'https://maps.app.goo.gl/TJvNjR6Sx2UN6SCbA';
        }

        return 'https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8';
    }

    private function slugCandidates(string $slug): array
    {
        $withoutIndex = preg_replace('/-\d+$/', '', $slug) ?: $slug;
        $localized = str_replace('tennis', 'tenis', $withoutIndex);

        return collect([$slug, $withoutIndex, $localized])
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
