<?php

namespace App\Services;

use App\Models\News;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NewsHeroService
{
    public const MAX_SLOTS = 6;

    private const PUBLIC_CATEGORIES = ['Berita', 'Artikel'];

    /**
     * Replace the complete hero arrangement atomically.
     *
     * @param  array<int, int>  $newsIds
     * @param  array<int, int>|null  $expectedNewsIds
     * @return Collection<int, News>
     */
    public function replace(array $newsIds, ?array $expectedNewsIds = null): Collection
    {
        $orderedIds = $this->orderedIds($newsIds);
        $expectedIds = $expectedNewsIds === null
            ? null
            : $this->orderedIds($expectedNewsIds);

        if ($orderedIds->count() > self::MAX_SLOTS) {
            throw ValidationException::withMessages([
                'news_ids' => 'Hero News maksimal berisi '.self::MAX_SLOTS.' konten pilihan.',
            ]);
        }

        if ($orderedIds->unique()->count() !== $orderedIds->count()) {
            throw ValidationException::withMessages([
                'news_ids' => 'Satu konten tidak boleh menempati lebih dari satu slot hero.',
            ]);
        }

        return DB::transaction(function () use ($orderedIds, $expectedIds): Collection {
            // All curation writes serialize on the same deterministic row set.
            // News mutations are infrequent, while this prevents two admins from
            // committing overlapping slot maps at the same time.
            News::query()
                ->select('id')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            if ($expectedIds !== null) {
                $currentIds = News::query()
                    ->where('is_hero_featured', true)
                    ->orderByRaw('CASE WHEN hero_sort_order IS NULL THEN 1 ELSE 0 END')
                    ->orderBy('hero_sort_order')
                    ->orderBy('id')
                    ->limit(self::MAX_SLOTS)
                    ->pluck('id')
                    ->map(fn (mixed $id): int => (int) $id)
                    ->values();

                if ($currentIds->all() !== $expectedIds->all()) {
                    throw ValidationException::withMessages([
                        'news_ids' => 'Susunan hero telah diubah oleh admin lain. Muat ulang halaman sebelum menyimpan perubahan Anda.',
                    ]);
                }
            }

            $articles = News::query()
                ->with('category:id,name')
                ->whereKey($orderedIds)
                ->get()
                ->keyBy('id');

            if ($articles->count() !== $orderedIds->count()) {
                throw ValidationException::withMessages([
                    'news_ids' => 'Sebagian konten hero sudah tidak tersedia. Muat ulang halaman lalu coba kembali.',
                ]);
            }

            $invalidCategory = $orderedIds->first(function (int $id) use ($articles): bool {
                $categoryName = $articles->get($id)?->category?->name;

                return ! in_array($categoryName, self::PUBLIC_CATEGORIES, true);
            });

            if ($invalidCategory !== null) {
                throw ValidationException::withMessages([
                    'news_ids' => 'Hero publik hanya dapat memuat konten berkategori Berita atau Artikel.',
                ]);
            }

            // Clear first so swaps never collide with the unique slot index.
            News::query()
                ->where('is_hero_featured', true)
                ->update([
                    'is_hero_featured' => false,
                    'hero_sort_order' => null,
                ]);

            $orderedIds->each(function (int $id, int $index): void {
                // Use an explicit query update after the bulk clear. Reusing the
                // previously hydrated model would retain stale dirty-state and
                // could omit `is_hero_featured` when an existing slot is moved.
                News::query()->whereKey($id)->update([
                    'is_hero_featured' => true,
                    'hero_sort_order' => $index + 1,
                ]);
            });

            return $orderedIds
                ->map(fn (int $id): News => $articles->get($id)->fresh(['category', 'author', 'media']))
                ->values();
        }, 3);
    }

    /**
     * Remove ineligible references and compact any gaps left by content changes.
     *
     * @return Collection<int, News>
     */
    public function normalize(): Collection
    {
        $eligibleIds = News::query()
            ->where('is_hero_featured', true)
            ->whereHas('category', fn ($query) => $query->whereIn('name', self::PUBLIC_CATEGORIES))
            ->orderByRaw('CASE WHEN hero_sort_order IS NULL THEN 1 ELSE 0 END')
            ->orderBy('hero_sort_order')
            ->orderBy('id')
            ->limit(self::MAX_SLOTS)
            ->pluck('id')
            ->all();

        return $this->replace($eligibleIds);
    }

    /**
     * @param  array<int, int>  $ids
     * @return Collection<int, int>
     */
    private function orderedIds(array $ids): Collection
    {
        return collect($ids)
            ->map(fn (mixed $id): int => (int) $id)
            ->values();
    }
}
