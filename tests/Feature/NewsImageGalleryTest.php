<?php

namespace Tests\Feature;

use App\Models\News;
use App\Models\NewsCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class NewsImageGalleryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    public function test_admin_can_upload_multiple_ordered_images_for_one_article(): void
    {
        $admin = $this->newsAdmin();
        $category = NewsCategory::create(['name' => 'Berita', 'slug' => 'berita']);

        $this->actingAs($admin)
            ->post(route('admin.news.store'), $this->articlePayload($category, [
                'images' => [
                    UploadedFile::fake()->image('cover.jpg', 1600, 900),
                    UploadedFile::fake()->image('detail-one.jpg', 1600, 900),
                    UploadedFile::fake()->image('detail-two.jpg', 1600, 900),
                ],
            ]))
            ->assertRedirect(route('admin.news.index'))
            ->assertSessionHasNoErrors();

        $article = News::query()->where('slug', 'galeri-berita-ubsc')->firstOrFail();
        $media = $article->getMedia('thumbnail');

        $this->assertCount(3, $media);
        $this->assertSame('cover', $media->first()->name);

        auth()->logout();

        $this->get(route('news.show', $article->slug))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('News/Show')
                ->has('newsItem.images_array', 3)
                ->where('newsItem.cover_image', $media->first()->getUrl())
                ->where('newsItem.images_array.0', $media->get(0)->getUrl())
                ->where('newsItem.images_array.1', $media->get(1)->getUrl())
                ->where('newsItem.images_array.2', $media->get(2)->getUrl()));
    }

    public function test_admin_can_remove_one_existing_image_and_append_a_replacement(): void
    {
        $admin = $this->newsAdmin();
        $category = NewsCategory::create(['name' => 'Artikel', 'slug' => 'artikel']);
        $article = $this->article($category);
        $first = $article
            ->addMedia(UploadedFile::fake()->image('old-cover.jpg', 1600, 900))
            ->toMediaCollection('thumbnail');
        $second = $article
            ->addMedia(UploadedFile::fake()->image('kept.jpg', 1600, 900))
            ->toMediaCollection('thumbnail');

        $this->actingAs($admin)
            ->post(route('admin.news.update', $article), $this->articlePayload($category, [
                '_method' => 'PUT',
                'remove_media_ids' => [$first->id],
                'images' => [
                    UploadedFile::fake()->image('replacement.jpg', 1600, 900),
                ],
            ]))
            ->assertRedirect(route('admin.news.index'))
            ->assertSessionHasNoErrors();

        $media = $article->fresh()->getMedia('thumbnail');

        $this->assertCount(2, $media);
        $this->assertSame($second->id, $media->first()->id);
        $this->assertSame('replacement', $media->last()->name);
    }

    public function test_admin_cannot_remove_media_owned_by_another_article(): void
    {
        $admin = $this->newsAdmin();
        $category = NewsCategory::create(['name' => 'Berita', 'slug' => 'berita']);
        $article = $this->article($category);
        $other = $this->article($category, [
            'title' => 'Artikel Lain',
            'slug' => 'artikel-lain',
        ]);
        $foreignMedia = $other
            ->addMedia(UploadedFile::fake()->image('foreign.jpg', 1600, 900))
            ->toMediaCollection('thumbnail');

        $this->actingAs($admin)
            ->post(route('admin.news.update', $article), $this->articlePayload($category, [
                '_method' => 'PUT',
                'remove_media_ids' => [$foreignMedia->id],
            ]))
            ->assertSessionHasErrors('remove_media_ids');

        $this->assertNotNull($other->fresh()->getMedia('thumbnail')->firstWhere('id', $foreignMedia->id));
    }

    public function test_admin_cannot_exceed_the_total_gallery_limit_during_edit(): void
    {
        $admin = $this->newsAdmin();
        $category = NewsCategory::create(['name' => 'Berita', 'slug' => 'berita']);
        $article = $this->article($category);

        foreach (range(1, 2) as $index) {
            $article
                ->addMedia(UploadedFile::fake()->image("existing-{$index}.jpg", 80, 45))
                ->toMediaCollection('thumbnail');
        }

        $uploads = collect(range(1, News::MAX_IMAGES - 1))
            ->map(fn (int $index) => UploadedFile::fake()->image("new-{$index}.jpg", 80, 45))
            ->all();

        $this->actingAs($admin)
            ->post(route('admin.news.update', $article), $this->articlePayload($category, [
                '_method' => 'PUT',
                'images' => $uploads,
            ]))
            ->assertSessionHasErrors('images');

        $this->assertCount(2, $article->fresh()->getMedia('thumbnail'));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function articlePayload(NewsCategory $category, array $overrides = []): array
    {
        return array_replace([
            'news_category_id' => $category->id,
            'title' => 'Galeri Berita UBSC',
            'slug' => 'galeri-berita-ubsc',
            'excerpt' => 'Galeri kegiatan terbaru UB Sport Center.',
            'content' => '<p>Konten berita galeri UB Sport Center.</p>',
            'status' => 'published',
            'is_hero_featured' => false,
            'hero_sort_order' => null,
            'published_at' => now()->subMinute()->format('Y-m-d H:i:s'),
            'images' => [],
            'remove_media_ids' => [],
        ], $overrides);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function article(NewsCategory $category, array $overrides = []): News
    {
        return News::create(array_replace([
            'news_category_id' => $category->id,
            'author_id' => User::factory()->create()->id,
            'title' => 'Galeri Berita UBSC',
            'slug' => 'galeri-berita-ubsc',
            'excerpt' => 'Galeri kegiatan terbaru UB Sport Center.',
            'content' => '<p>Konten berita galeri UB Sport Center.</p>',
            'status' => 'published',
            'is_hero_featured' => false,
            'hero_sort_order' => null,
            'published_at' => now()->subMinute(),
        ], $overrides));
    }

    private function newsAdmin(): User
    {
        Permission::firstOrCreate(['name' => 'manage-cms', 'guard_name' => 'web']);
        Permission::firstOrCreate(['name' => 'publish-news', 'guard_name' => 'web']);

        $role = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'web']);
        $role->syncPermissions(['manage-cms', 'publish-news']);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
