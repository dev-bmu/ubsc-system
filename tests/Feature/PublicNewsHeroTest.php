<?php

namespace Tests\Feature;

use App\Models\News;
use App\Models\NewsCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PublicNewsHeroTest extends TestCase
{
    use RefreshDatabase;

    public function test_news_hero_falls_back_to_latest_real_public_items_when_no_slots_are_selected(): void
    {
        [$berita, $artikel] = $this->publicCategories();

        for ($i = 1; $i <= 7; $i++) {
            $category = $i % 2 === 0 ? $artikel : $berita;

            $this->newsItem($category, [
                'title' => "Public Item {$i}",
                'slug' => "public-item-{$i}",
                'published_at' => now()->subMinutes($i),
            ]);
        }

        $this->get(route('news'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('NewsPage')
                ->has('newsFeed.hero', 6)
                ->where('newsFeed.hero.0.slug', 'public-item-1')
                ->where('newsFeed.hero.5.slug', 'public-item-6'));
    }

    public function test_news_hero_uses_selected_cms_slots_instead_of_latest_fallback(): void
    {
        [$berita, $artikel] = $this->publicCategories();

        $this->newsItem($berita, [
            'title' => 'Latest Regular Item',
            'slug' => 'latest-regular-item',
            'published_at' => now()->subMinute(),
        ]);

        $this->newsItem($artikel, [
            'title' => 'Hero Slot Two',
            'slug' => 'hero-slot-two',
            'published_at' => now()->subDays(2),
            'is_hero_featured' => true,
            'hero_sort_order' => 2,
        ]);

        $this->newsItem($berita, [
            'title' => 'Hero Slot One',
            'slug' => 'hero-slot-one',
            'published_at' => now()->subDays(3),
            'is_hero_featured' => true,
            'hero_sort_order' => 1,
        ]);

        $this->get(route('news'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('NewsPage')
                ->has('newsFeed.hero', 2)
                ->where('newsFeed.hero.0.slug', 'hero-slot-one')
                ->where('newsFeed.hero.1.slug', 'hero-slot-two'));
    }

    public function test_news_hero_never_exposes_more_than_six_selected_public_items(): void
    {
        [$berita] = $this->publicCategories();

        for ($i = 1; $i <= 7; $i++) {
            $this->newsItem($berita, [
                'title' => "Hero Item {$i}",
                'slug' => "hero-item-{$i}",
                'published_at' => now()->subMinutes($i),
                'is_hero_featured' => true,
                'hero_sort_order' => $i,
            ]);
        }

        $this->get(route('news'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('NewsPage')
                ->has('newsFeed.hero', 6)
                ->where('newsFeed.hero.0.slug', 'hero-item-1')
                ->where('newsFeed.hero.5.slug', 'hero-item-6'));
    }

    /**
     * @return array{0: NewsCategory, 1: NewsCategory}
     */
    private function publicCategories(): array
    {
        return [
            NewsCategory::create(['name' => 'Berita', 'slug' => 'berita']),
            NewsCategory::create(['name' => 'Artikel', 'slug' => 'artikel']),
        ];
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function newsItem(NewsCategory $category, array $overrides = []): News
    {
        return News::create(array_merge([
            'news_category_id' => $category->id,
            'author_id' => User::factory()->create()->id,
            'title' => 'Public News',
            'slug' => 'public-news',
            'excerpt' => 'Ringkasan konten publik.',
            'content' => '<p>Konten publik UB Sport Center.</p>',
            'status' => 'published',
            'is_hero_featured' => false,
            'hero_sort_order' => null,
            'published_at' => now(),
        ], $overrides));
    }
}
