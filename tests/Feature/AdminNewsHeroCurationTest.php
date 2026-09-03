<?php

namespace Tests\Feature;

use App\Models\News;
use App\Models\NewsCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AdminNewsHeroCurationTest extends TestCase
{
    use RefreshDatabase;

    public function test_publisher_can_replace_and_reorder_all_slots_atomically(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita, $artikel] = $this->publicCategories();
        $first = $this->article($berita, 'Pertama', 'pertama', 1);
        $second = $this->article($artikel, 'Kedua', 'kedua', 2);
        $third = $this->article($berita, 'Ketiga', 'ketiga');
        $regular = $this->article($artikel, 'Reguler', 'reguler');

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [$second->id, $third->id, $first->id],
                'expected_news_ids' => [$first->id, $second->id],
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors()
            ->assertSessionHas('success');

        $this->assertHeroSlot($second, 1);
        $this->assertHeroSlot($third, 2);
        $this->assertHeroSlot($first, 3);
        $this->assertNotFeatured($regular);
        $this->assertSame(
            [$second->id, $third->id, $first->id],
            News::query()
                ->where('is_hero_featured', true)
                ->orderBy('hero_sort_order')
                ->pluck('id')
                ->all(),
        );
    }

    public function test_empty_selection_enables_automatic_mode_without_leaving_stale_slots(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita] = $this->publicCategories();
        $first = $this->article($berita, 'Pertama', 'pertama', 1);
        $second = $this->article($berita, 'Kedua', 'kedua', 2);

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [],
                'expected_news_ids' => [$first->id, $second->id],
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $this->assertSame(0, News::query()->where('is_hero_featured', true)->count());
        $this->assertSame(0, News::query()->whereNotNull('hero_sort_order')->count());
    }

    public function test_invalid_category_is_rejected_without_partially_changing_the_live_arrangement(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita] = $this->publicCategories();
        $internal = NewsCategory::create(['name' => 'Internal', 'slug' => 'internal']);
        $first = $this->article($berita, 'Pertama', 'pertama', 1);
        $second = $this->article($berita, 'Kedua', 'kedua', 2);
        $invalid = $this->article($internal, 'Internal', 'internal');

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [$second->id, $invalid->id, $first->id],
                'expected_news_ids' => [$first->id, $second->id],
            ])
            ->assertRedirect()
            ->assertSessionHasErrors('news_ids');

        $this->assertHeroSlot($first, 1);
        $this->assertHeroSlot($second, 2);
        $this->assertNotFeatured($invalid);
    }

    public function test_duplicate_and_over_capacity_payloads_never_damage_existing_slots(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita] = $this->publicCategories();
        $articles = collect(range(1, 7))
            ->map(fn (int $index): News => $this->article(
                $berita,
                "Artikel {$index}",
                "artikel-{$index}",
                $index <= 2 ? $index : null,
            ));
        $expected = $articles->take(2)->pluck('id')->all();

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => $articles->pluck('id')->all(),
                'expected_news_ids' => $expected,
            ])
            ->assertSessionHasErrors('news_ids');

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [$articles[0]->id, $articles[0]->id],
                'expected_news_ids' => $expected,
            ])
            ->assertSessionHasErrors('news_ids.1');

        $this->assertHeroSlot($articles[0], 1);
        $this->assertHeroSlot($articles[1], 2);
        $this->assertSame(2, News::query()->where('is_hero_featured', true)->count());
    }

    public function test_stale_admin_cannot_overwrite_a_newer_arrangement(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita] = $this->publicCategories();
        $first = $this->article($berita, 'Pertama', 'pertama', 1);
        $second = $this->article($berita, 'Kedua', 'kedua', 2);

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [$second->id, $first->id],
                'expected_news_ids' => [$first->id, $second->id],
            ])
            ->assertSessionHasNoErrors();

        $this->actingAs($admin)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [$first->id, $second->id],
                'expected_news_ids' => [$first->id, $second->id],
            ])
            ->assertRedirect()
            ->assertSessionHasErrors('news_ids');

        $this->assertHeroSlot($second, 1);
        $this->assertHeroSlot($first, 2);
    }

    public function test_staff_without_publish_permission_can_view_news_but_cannot_mutate_hero(): void
    {
        $viewer = $this->staffWithPermissions(['manage-cms']);
        [$berita] = $this->publicCategories();
        $article = $this->article($berita, 'Pertama', 'pertama');
        $featured = $this->article($berita, 'Pilihan', 'pilihan', 1);

        $this->actingAs($viewer)
            ->get(route('admin.news.index'))
            ->assertOk();

        $this->actingAs($viewer)
            ->put(route('admin.news.hero.update'), [
                'news_ids' => [$article->id],
                'expected_news_ids' => [],
            ])
            ->assertForbidden();

        $this->assertNotFeatured($article);

        $this->actingAs($viewer)
            ->put(
                route('admin.news.update', $featured),
                $this->articlePayload($featured, $berita, ['title' => 'Perubahan tanpa izin']),
            )
            ->assertForbidden();

        $this->actingAs($viewer)
            ->delete(route('admin.news.destroy', $featured))
            ->assertForbidden();

        $this->assertHeroSlot($featured, 1);
    }

    public function test_article_form_cannot_bypass_the_central_hero_curator(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita] = $this->publicCategories();
        $article = $this->article($berita, 'Pertama', 'pertama', 1);

        $this->actingAs($admin)
            ->put(route('admin.news.update', $article), $this->articlePayload($article, $berita, [
                'is_hero_featured' => false,
                'hero_sort_order' => null,
            ]))
            ->assertRedirect(route('admin.news.index'))
            ->assertSessionHasNoErrors();

        $this->assertHeroSlot($article, 1);
    }

    public function test_category_change_and_deletion_compact_remaining_slots(): void
    {
        $admin = $this->staffWithPermissions(['manage-cms', 'publish-news']);
        [$berita] = $this->publicCategories();
        $internal = NewsCategory::create(['name' => 'Internal', 'slug' => 'internal']);
        $first = $this->article($berita, 'Pertama', 'pertama', 1);
        $second = $this->article($berita, 'Kedua', 'kedua', 2);
        $third = $this->article($berita, 'Ketiga', 'ketiga', 3);

        $this->actingAs($admin)
            ->put(
                route('admin.news.update', $second),
                $this->articlePayload($second, $internal),
            )
            ->assertSessionHasNoErrors();

        $this->assertHeroSlot($first, 1);
        $this->assertNotFeatured($second);
        $this->assertHeroSlot($third, 2);

        $this->actingAs($admin)
            ->delete(route('admin.news.destroy', $first))
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $this->assertHeroSlot($third, 1);
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

    private function article(
        NewsCategory $category,
        string $title,
        string $slug,
        ?int $heroSlot = null,
    ): News {
        return News::create([
            'news_category_id' => $category->id,
            'author_id' => User::factory()->create()->id,
            'title' => $title,
            'slug' => $slug,
            'excerpt' => "Ringkasan {$title}.",
            'content' => "<p>Konten {$title}.</p>",
            'status' => 'published',
            'is_hero_featured' => $heroSlot !== null,
            'hero_sort_order' => $heroSlot,
            'published_at' => now()->subMinute(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function articlePayload(
        News $article,
        NewsCategory $category,
        array $overrides = [],
    ): array {
        return array_replace([
            'news_category_id' => $category->id,
            'title' => $article->title,
            'slug' => $article->slug,
            'excerpt' => $article->excerpt,
            'content' => $article->content,
            'status' => $article->status,
            'published_at' => $article->published_at?->format('Y-m-d H:i:s'),
            'images' => [],
            'remove_media_ids' => [],
        ], $overrides);
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function staffWithPermissions(array $permissions): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $role = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'web']);
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }

    private function assertHeroSlot(News $article, int $slot): void
    {
        $fresh = $article->fresh();

        $this->assertTrue($fresh->is_hero_featured);
        $this->assertSame($slot, $fresh->hero_sort_order);
    }

    private function assertNotFeatured(News $article): void
    {
        $fresh = $article->fresh();

        $this->assertFalse($fresh->is_hero_featured);
        $this->assertNull($fresh->hero_sort_order);
    }
}
