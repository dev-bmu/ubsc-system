<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\Public\NewsCategoryResource;
use App\Http\Resources\Public\NewsResource;
use App\Models\News;
use App\Models\NewsCategory;
use App\Support\NewsContentSanitizer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PublicNewsController extends Controller
{
    private const BERITA_PER_PAGE = 6;
    private const ARTIKEL_PER_PAGE = 7;
    private const PUBLIC_CATEGORIES = ['Berita', 'Artikel'];

    public function index(): Response
    {
        return Inertia::render('NewsPage', [
            'newsFeed' => [
                'hero' => NewsResource::collection(
                    $this->heroNews()
                )->resolve(),
                'berita' => $this->paginatedPayload('Berita', 1, self::BERITA_PER_PAGE),
                'artikel' => $this->paginatedPayload('Artikel', 1, self::ARTIKEL_PER_PAGE),
            ],
            'categories' => NewsCategoryResource::collection(
                NewsCategory::all()
            )->resolve(),
        ]);
    }

    public function feed(Request $request): JsonResponse
    {
        $category = $request->string('category')->toString();
        $perPage = (int) $request->integer('per_page', self::BERITA_PER_PAGE);
        $page = (int) $request->integer('page', 1);

        $category = $category === 'Artikel' ? 'Artikel' : 'Berita';
        $perPage = $category === 'Artikel'
            ? min(max($perPage, 1), self::ARTIKEL_PER_PAGE)
            : min(max($perPage, 1), self::BERITA_PER_PAGE);

        return response()->json(
            $this->paginatedPayload($category, max($page, 1), $perPage)
        );
    }

    public function show(string $slug): Response
    {
        $news = News::published()
            ->with(['category', 'media'])
            ->where('slug', $slug)
            ->whereHas('category', fn ($query) => $query->whereIn('name', self::PUBLIC_CATEGORIES))
            ->firstOrFail();

        $similarNews = $this->publicNewsQuery()
            ->with(['category', 'media'])
            ->whereKeyNot($news->id)
            ->latest('published_at')
            ->limit(6)
            ->get();

        return Inertia::render('News/Show', [
            'newsItem' => $this->detailPayload($news),
            'similarNews' => $similarNews
                ->map(fn (News $item): array => $this->cardPayload($item))
                ->values()
                ->all(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function detailPayload(News $news): array
    {
        $images = $news->getMedia('thumbnail')
            ->map(fn ($media): string => $media->getUrl())
            ->filter()
            ->values();

        $coverImage = $news->getFirstMediaUrl('thumbnail');

        if ($images->isEmpty() && $coverImage !== '') {
            $images = collect([$coverImage]);
        }

        return [
            'id' => $news->id,
            'title' => $news->title,
            'slug' => $news->slug,
            'sub_title' => $news->excerpt ?? '',
            'description' => $news->excerpt ?? '',
            'content' => NewsContentSanitizer::clean($news->content),
            'date' => $news->published_at?->format('d.m.Y') ?? '',
            'category' => $news->category?->name ?? '',
            'facility' => config('app.name', 'UB Sport Center'),
            'images_array' => $images->all(),
            'cover_image' => $coverImage,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function cardPayload(News $news): array
    {
        return [
            'id' => $news->id,
            'title' => $news->title,
            'slug' => $news->slug,
            'date' => $news->published_at?->format('d.m.Y') ?? '',
            'category' => $news->category?->name ?? '',
            'description' => $news->excerpt ?? '',
            'cover_image' => $news->getFirstMediaUrl('thumbnail'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function paginatedPayload(string $categoryName, int $page, int $perPage): array
    {
        $paginator = $this->publicNewsQuery()
            ->with(['category', 'media'])
            ->whereHas('category', fn ($query) => $query->where('name', $categoryName))
            ->latest('published_at')
            ->paginate(
                perPage: $perPage,
                columns: ['*'],
                pageName: strtolower($categoryName) . '_page',
                page: $page
            );

        return [
            'items' => NewsResource::collection($paginator->items())->resolve(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'has_more_pages' => $paginator->hasMorePages(),
            ],
        ];
    }

    private function heroNews()
    {
        $selectedHero = $this->publicNewsQuery()
            ->with(['category', 'media'])
            ->heroFeatured()
            ->orderBy('hero_sort_order')
            ->latest('published_at')
            ->limit(6)
            ->get();

        if ($selectedHero->isNotEmpty()) {
            return $selectedHero;
        }

        return $this->publicNewsQuery()
            ->with(['category', 'media'])
            ->latest('published_at')
            ->limit(6)
            ->get();
    }

    private function publicNewsQuery(): Builder
    {
        return News::published()
            ->whereHas('category', fn ($query) => $query->whereIn('name', self::PUBLIC_CATEGORIES));
    }
}
