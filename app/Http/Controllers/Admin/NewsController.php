<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InfoBanner;
use App\Models\News;
use App\Models\NewsCategory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class NewsController extends Controller
{
    public function index(): Response
    {
        $this->authorize('manage-cms');

        $news = News::with(['category', 'author', 'media'])
            ->latest('updated_at')
            ->get()
            ->map(fn (News $n) => $this->transform($n));

        $categories = NewsCategory::withCount('news')
            ->orderBy('name')
            ->get(['id', 'name', 'slug']);

        InfoBanner::normalizeSortOrder();

        $infoBanners = InfoBanner::ordered()->get(['id', 'message', 'is_active', 'sort_order']);

        return Inertia::render('Admin/News/Index', [
            'news'         => $news,
            'categories'   => $categories,
            'info_banners' => $infoBanners,
        ]);
    }

    public function create(): Response
    {
        $this->authorize('manage-cms');

        return Inertia::render('Admin/News/Form', [
            'article'    => null,
            'categories' => NewsCategory::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $this->validateArticle($request);

        if ($data['status'] === 'published') {
            $this->authorize('publish-news');
        }

        $article = News::create([
            'news_category_id' => $data['news_category_id'] ?? null,
            'author_id'        => Auth::id(),
            'title'            => $data['title'],
            'slug'             => $data['slug'],
            'excerpt'          => $data['excerpt'] ?? null,
            'content'          => $data['content'],
            'status'           => $data['status'],
            'published_at'     => $this->resolvePublishedAt($data),
        ]);

        if ($request->hasFile('thumbnail')) {
            $article->addMediaFromRequest('thumbnail')->toMediaCollection('thumbnail');
        }

        return redirect()->route('admin.news.index')->with('success', 'Article saved.');
    }

    public function edit(News $news): Response
    {
        $this->authorize('manage-cms');

        $news->load(['category', 'author', 'media']);

        return Inertia::render('Admin/News/Form', [
            'article'    => $this->transform($news),
            'categories' => NewsCategory::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function update(Request $request, News $news): RedirectResponse
    {
        $this->authorize('manage-cms');

        $data = $this->validateArticle($request, $news->id);

        if ($data['status'] === 'published' && $news->status !== 'published') {
            $this->authorize('publish-news');
        }

        $news->update([
            'news_category_id' => $data['news_category_id'] ?? null,
            'title'            => $data['title'],
            'slug'             => $data['slug'],
            'excerpt'          => $data['excerpt'] ?? null,
            'content'          => $data['content'],
            'status'           => $data['status'],
            'published_at'     => $this->resolvePublishedAt($data, $news->published_at),
        ]);

        if ($request->hasFile('thumbnail')) {
            $news->addMediaFromRequest('thumbnail')->toMediaCollection('thumbnail');
        }

        return redirect()->route('admin.news.index')->with('success', 'Article updated.');
    }

    public function destroy(News $news): RedirectResponse
    {
        $this->authorize('manage-cms');

        $news->delete();

        return back()->with('success', 'Article deleted.');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function validateArticle(Request $request, ?int $excludeId = null): array
    {
        return $request->validate([
            'news_category_id' => ['nullable', 'exists:news_categories,id'],
            'title'            => ['required', 'string', 'max:255'],
            'slug'             => [
                'required', 'string', 'max:255', 'alpha_dash',
                Rule::unique('news', 'slug')->ignore($excludeId),
            ],
            'excerpt'          => ['nullable', 'string', 'max:500'],
            'content'          => ['required', 'string'],
            'status'           => ['required', Rule::in(['draft', 'published', 'archived'])],
            'published_at'     => ['nullable', 'date'],
            'thumbnail'        => ['nullable', 'image', 'max:5120'],
        ]);
    }

    private function resolvePublishedAt(array $data, mixed $existing = null): ?string
    {
        if ($data['status'] === 'published') {
            return $data['published_at'] ?? $existing ?? now()->toDateTimeString();
        }
        return $existing;
    }

    private function transform(News $n): array
    {
        $author = $n->author;

        return [
            'id'           => $n->id,
            'title'        => $n->title,
            'slug'         => $n->slug,
            'excerpt'      => $n->excerpt,
            'content'      => $n->content,
            'status'       => $n->status,
            'published_at' => $n->published_at?->toDateTimeString(),
            'updated_at'   => $n->updated_at->diffForHumans(),
            'category'     => $n->category
                ? ['id' => $n->category->id, 'name' => $n->category->name, 'slug' => $n->category->slug]
                : null,
            'author'       => [
                'id'         => $author?->id ?? 0,
                'name'       => $author?->name ?? 'Admin UBSC',
                'avatar'     => $author?->avatar,
                'avatar_url' => $author?->avatar ? '/storage/' . $author->avatar : null,
            ],
            'thumbnail'    => $n->getFirstMediaUrl('thumbnail') ?: null,
        ];
    }
}
