<?php

namespace App\Services\Gallery;

use App\Enums\GalleryMediaType;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryLocation;
use App\Models\Gallery\GallerySection;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class GalleryPublicService
{
    private bool $searchDegraded = false;

    public function __construct(
        private readonly GalleryMediaUrlService $urls,
        private readonly GalleryCacheService $cache,
    ) {}

    /**
     * @return array<string, array{active: bool, key: string, name: string, slug: string, layout: string, quota: int, items: array<int, array<string, mixed>>}>
     */
    public function curatedSections(string $locale = 'id'): array
    {
        $configured = collect(config('facility-gallery.sections', []));

        if (! Schema::hasTable('gallery_sections')) {
            return $configured->mapWithKeys(fn (array $section, string $key) => [
                $key => $this->emptySection($key, $section),
            ])->all();
        }

        if (app()->environment('testing')) {
            return $this->buildCuratedSections($configured, $locale);
        }

        return Cache::remember(
            $this->cache->key("curated:{$locale}"),
            now()->addSeconds((int) config('facility-gallery.cache_seconds', 300)),
            fn () => $this->buildCuratedSections($configured, $locale),
        );
    }

    /**
     * @param  \Illuminate\Support\Collection<string, array<string, mixed>>  $configured
     * @return array<string, array<string, mixed>>
     */
    private function buildCuratedSections($configured, string $locale): array
    {
        $records = GallerySection::query()->get()->keyBy('key');

        return $configured->mapWithKeys(function (array $configuration, string $key) use ($records, $locale) {
            /** @var GallerySection|null $section */
            $section = $records->get($key);

            if (! $section || ! $section->is_active) {
                return [$key => $this->emptySection($key, $configuration, $section)];
            }

            $items = $section->items()
                ->publiclyVisible()
                ->wherePivotNotNull('featured_position')
                ->with(['translations', 'location', 'media'])
                ->orderByPivot('featured_position')
                ->limit($section->quota)
                ->get();
            $isComplete = $items->count() === $section->quota;

            return [$key => [
                'active' => $isComplete,
                'key' => $key,
                'name' => $section->name,
                'slug' => $section->slug,
                'layout' => $section->layout,
                'quota' => $section->quota,
                'items' => $isComplete
                    ? $items->map(fn (GalleryItem $item) => $this->serialize($item, $locale))->values()->all()
                    : [],
            ]];
        })->all();
    }

    public function archive(Request $request, ?GallerySection $section = null): LengthAwarePaginator
    {
        $search = Str::of((string) $request->query('q', ''))->squish()->limit(100, '')->value();
        $perPage = min(
            max(1, $request->integer('per_page', (int) config('facility-gallery.pagination.per_page', 24))),
            (int) config('facility-gallery.pagination.max_per_page', 48),
        );

        if ($search !== '' && config('scout.driver') === 'meilisearch') {
            try {
                return $this->searchArchive($request, $search, $perPage, $section);
            } catch (Throwable $exception) {
                report($exception);
                $this->searchDegraded = true;
            }
        }

        $query = GalleryItem::query()
            ->publiclyVisible()
            ->with(['translations', 'location', 'sections', 'media']);

        if ($section) {
            $query->forSection($section->key);
        }

        $this->applyFilters($query, $request);

        $locale = $request->getLocale();

        return $query
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString()
            ->through(fn (GalleryItem $item) => $this->serialize($item, $locale));
    }

    public function searchIsDegraded(): bool
    {
        return $this->searchDegraded;
    }

    private function searchArchive(
        Request $request,
        string $search,
        int $perPage,
        ?GallerySection $section,
    ): LengthAwarePaginator {
        $builder = GalleryItem::search($search)
            ->where('is_public', 1)
            ->query(fn (Builder $query) => $query->with([
                'translations', 'location', 'sections', 'media',
            ]));
        $sectionKey = $section?->key ?: ($request->filled('section')
            ? (string) $request->query('section')
            : null);

        if ($sectionKey) {
            $builder->where('section_keys', $sectionKey);
        }
        if ($request->filled('location')) {
            $builder->where('location_slug', (string) $request->query('location'));
        }
        if ($request->filled('media_type')) {
            $builder->where('media_type', (string) $request->query('media_type'));
        }
        if ($request->filled('year')) {
            $builder->where('captured_year', $request->integer('year'));
        }

        $paginator = $builder
            ->orderBy('published_at', 'desc')
            ->paginate($perPage, 'page', $request->integer('page', 1));
        $paginator->withQueryString();

        return $paginator->through(fn (GalleryItem $item) => $this->serialize(
            $item,
            $request->getLocale(),
        ));
    }

    /**
     * @return array{items: array<int, array<string, mixed>>, active_index: int}
     */
    public function mediaContext(
        Request $request,
        string $uuid,
        ?GallerySection $section = null,
    ): array {
        $base = GalleryItem::query()
            ->publiclyVisible()
            ->with(['translations', 'location', 'sections', 'media']);

        if ($section) {
            $base->forSection($section->key);
        }

        $this->applyFilters($base, $request);
        $item = (clone $base)->where('uuid', $uuid)->firstOrFail();
        $newer = (clone $base)
            ->where(function (Builder $query) use ($item) {
                $query->where('published_at', '>', $item->published_at)
                    ->orWhere(function (Builder $sameTime) use ($item) {
                        $sameTime->where('published_at', $item->published_at)
                            ->where('id', '>', $item->id);
                    });
            })
            ->orderBy('published_at')
            ->orderBy('id')
            ->first();
        $older = (clone $base)
            ->where(function (Builder $query) use ($item) {
                $query->where('published_at', '<', $item->published_at)
                    ->orWhere(function (Builder $sameTime) use ($item) {
                        $sameTime->where('published_at', $item->published_at)
                            ->where('id', '<', $item->id);
                    });
            })
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->first();
        $items = collect([$newer, $item, $older])->filter()->values();

        return [
            'items' => $items->map(fn (GalleryItem $record) => $this->serialize(
                $record,
                $request->getLocale(),
            ))->all(),
            'active_index' => $newer ? 1 : 0,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function filterOptions(): array
    {
        if (! Schema::hasTable('gallery_sections')) {
            return ['sections' => [], 'locations' => [], 'years' => [], 'media_types' => []];
        }

        if (app()->environment('testing')) {
            return $this->buildFilterOptions();
        }

        return Cache::remember(
            $this->cache->key('filter-options'),
            now()->addSeconds((int) config('facility-gallery.cache_seconds', 300)),
            fn () => $this->buildFilterOptions(),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function buildFilterOptions(): array
    {
        return [
            'sections' => GallerySection::query()
                ->active()
                ->orderBy('id')
                ->get(['key', 'slug', 'name'])
                ->map(fn (GallerySection $section) => [
                    'key' => $section->key,
                    'slug' => $section->slug,
                    'name' => $section->name,
                ])->values()->all(),
            'locations' => GalleryLocation::query()
                ->where('is_active', true)
                ->whereHas('items', fn (Builder $query) => $query->publiclyVisible())
                ->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->toArray(),
            'years' => GalleryItem::query()
                ->publiclyVisible()
                ->selectRaw($this->yearExpression().' as gallery_year')
                ->distinct()
                ->orderByDesc('gallery_year')
                ->pluck('gallery_year')
                ->filter()
                ->map(fn ($year) => (int) $year)
                ->values()
                ->all(),
            'media_types' => collect(GalleryMediaType::cases())
                ->map(fn (GalleryMediaType $type) => $type->value)
                ->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function serialize(GalleryItem $item, string $locale = 'id'): array
    {
        $translation = $item->translation($locale);
        $derivatives = $item->derivatives ?? [];
        $image = $this->urls->image($derivatives['image'] ?? null);
        $video = $this->urls->video($derivatives['video'] ?? null);

        return [
            'uuid' => $item->uuid,
            'media_type' => $item->media_type->value,
            'title' => $translation?->title ?? '',
            'arena_type' => $translation?->arena_type ?? '',
            'alt_text' => $translation?->alt_text ?? '',
            'caption' => $translation?->caption,
            'location' => $item->location ? [
                'name' => $item->location->name,
                'slug' => $item->location->slug,
            ] : null,
            'sections' => $item->relationLoaded('sections')
                ? $item->sections->map(fn (GallerySection $section) => [
                    'key' => $section->key,
                    'name' => $section->name,
                    'slug' => $section->slug,
                ])->values()->all()
                : [],
            'captured_at' => $item->captured_at?->format('Y-m-d'),
            'published_at' => $item->published_at?->toIso8601String(),
            'credit' => $item->credit,
            'focal_x' => $item->focal_x,
            'focal_y' => $item->focal_y,
            'width' => $item->source_width,
            'height' => $item->source_height,
            'duration_ms' => $item->duration_ms,
            'image' => $image,
            'video' => $video,
            'poster' => $video['poster'] ?? null,
            'subtitle_url' => $item->getFirstMediaUrl('subtitles') ?: null,
        ];
    }

    private function applyFilters(Builder $query, Request $request): void
    {
        $search = Str::of((string) $request->query('q', ''))->squish()->limit(100, '')->value();

        if ($search !== '') {
            $tokens = collect(preg_split('/\s+/u', Str::lower($search)) ?: [])
                ->filter(fn (string $token) => mb_strlen($token) >= 2)
                ->take(6)
                ->values();

            $query->whereHas('translations', function (Builder $translations) use ($search, $tokens) {
                $phrase = $this->likeValue($search);
                $translations->where(function (Builder $fields) use ($phrase, $tokens) {
                    $fields->where('title', 'like', $phrase)
                        ->orWhere('arena_type', 'like', $phrase)
                        ->orWhere('alt_text', 'like', $phrase)
                        ->orWhere('search_aliases', 'like', $phrase);

                    foreach ($tokens as $token) {
                        $needle = $this->likeValue($token);
                        $fields->orWhere('title', 'like', $needle)
                            ->orWhere('arena_type', 'like', $needle)
                            ->orWhere('alt_text', 'like', $needle)
                            ->orWhere('search_aliases', 'like', $needle);
                    }
                });
            });
        }

        $query
            ->when($request->filled('section'), fn (Builder $builder) => $builder
                ->forSection((string) $request->query('section')))
            ->when($request->filled('location'), fn (Builder $builder) => $builder
                ->whereHas('location', fn (Builder $location) => $location
                    ->where('slug', $request->query('location'))))
            ->when($request->filled('media_type'), fn (Builder $builder) => $builder
                ->where('media_type', $request->query('media_type')))
            ->when($request->filled('year'), function (Builder $builder) use ($request) {
                $year = $request->integer('year');
                $builder->where(function (Builder $dates) use ($year) {
                    $dates->whereYear('captured_at', $year)
                        ->orWhere(function (Builder $fallback) use ($year) {
                            $fallback->whereNull('captured_at')->whereYear('published_at', $year);
                        });
                });
            });
    }

    private function likeValue(string $value): string
    {
        return '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value).'%';
    }

    private function yearExpression(): string
    {
        return match (DB::connection()->getDriverName()) {
            'sqlite' => "CAST(strftime('%Y', COALESCE(captured_at, published_at)) AS INTEGER)",
            'pgsql' => 'CAST(EXTRACT(YEAR FROM COALESCE(captured_at, published_at)) AS INTEGER)',
            default => 'COALESCE(YEAR(captured_at), YEAR(published_at))',
        };
    }

    /**
     * @param  array<string, mixed>  $configuration
     * @return array{active: bool, key: string, name: string, slug: string, layout: string, quota: int, items: array<int, array<string, mixed>>}
     */
    private function emptySection(
        string $key,
        array $configuration,
        ?GallerySection $section = null,
    ): array {
        return [
            'active' => false,
            'key' => $key,
            'name' => $section?->name ?? $configuration['name'],
            'slug' => $section?->slug ?? $configuration['slug'],
            'layout' => $section?->layout ?? $configuration['layout'],
            'quota' => $section?->quota ?? $configuration['quota'],
            'items' => [],
        ];
    }
}
