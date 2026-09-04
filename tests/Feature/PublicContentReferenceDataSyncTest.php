<?php

namespace Tests\Feature;

use App\Models\News;
use App\Models\PromoCarousel;
use App\Models\Reel;
use App\Models\SponsorLogo;
use App\Models\Testimonial;
use App\Services\ReferenceData\PublicContentSynchronizer;
use App\Support\ReferenceData\PublicContentDefinition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PublicContentReferenceDataSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_provisions_public_crud_defaults_without_database_seeders(): void
    {
        $report = app(PublicContentSynchronizer::class)->sync();

        $this->assertFalse($report['already_current']);
        $this->assertSame(2, $report['news_categories_created']);
        $this->assertSame(7, $report['news_created']);
        $this->assertSame(4, $report['promos_created']);
        $this->assertSame(5, $report['sponsors_created']);
        $this->assertSame(5, $report['reels_created']);
        $this->assertSame(3, $report['info_banners_created']);
        $this->assertSame(3, $report['testimonials_created']);
        $this->assertSame(7, $report['news_using_system_byline']);

        $this->assertDatabaseCount('news_categories', 2);
        $this->assertDatabaseCount('news', 7);
        $this->assertDatabaseCount('promo_carousels', 4);
        $this->assertDatabaseCount('sponsor_logos', 5);
        $this->assertDatabaseCount('reels', 5);
        $this->assertDatabaseCount('info_banners', 3);
        $this->assertDatabaseCount('testimonials', 3);
        $this->assertDatabaseCount('reviews', 0);
        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('memberships', 0);

        $this->assertDatabaseHas('news', [
            'bootstrap_key' => 'news-placeholder-1-v1',
            'author_id' => null,
            'fallback_image_path' => '/assets/images/comingsoon.avif',
        ]);
        $this->assertDatabaseHas('promo_carousels', [
            'bootstrap_key' => 'homepage-promo-gym-v1',
            'fallback_asset_path' => '/assets/images/poster-gym-konten-program-ub-sport-center.avif',
        ]);
        $this->assertDatabaseHas('sponsor_logos', [
            'bootstrap_key' => 'homepage-sponsor-ayo-v1',
            'fallback_asset_path' => '/assets/icons/AYO.png',
        ]);
    }

    public function test_it_is_idempotent_and_preserves_administrator_content(): void
    {
        $synchronizer = app(PublicContentSynchronizer::class);
        $synchronizer->sync();

        $promo = PromoCarousel::where('bootstrap_key', 'homepage-promo-gym-v1')->firstOrFail();
        $sponsor = SponsorLogo::where('bootstrap_key', 'homepage-sponsor-b1-v1')->firstOrFail();
        $reel = Reel::where('bootstrap_key', 'homepage-reel-1-v1')->firstOrFail();
        $testimonial = Testimonial::where('bootstrap_key', 'testimonial-ub-football-club-v1')->firstOrFail();
        $news = News::where('bootstrap_key', 'news-placeholder-1-v1')->firstOrFail();

        $promo->update(['title' => 'Program Pilihan Admin', 'is_active' => false]);
        $sponsor->update(['name' => 'Partner Pilihan Admin', 'sort_order' => 99]);
        $reel->update(['title' => 'Reel Pilihan Admin', 'is_active' => false]);
        $testimonial->update(['quote' => 'Testimonial yang telah diperbarui admin.']);
        $news->update(['title' => 'Berita yang telah diperbarui admin.']);
        DB::table('info_banners')
            ->where('bootstrap_key', 'info-banner-hours-v1')
            ->update(['message' => 'Jam operasional pilihan admin.']);

        $current = $synchronizer->sync();
        $repair = $synchronizer->sync(repair: true);

        $this->assertTrue($current['already_current']);
        $this->assertFalse($repair['already_current']);
        $this->assertDatabaseHas('promo_carousels', [
            'id' => $promo->id,
            'title' => 'Program Pilihan Admin',
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('sponsor_logos', [
            'id' => $sponsor->id,
            'name' => 'Partner Pilihan Admin',
            'sort_order' => 99,
        ]);
        $this->assertDatabaseHas('reels', [
            'id' => $reel->id,
            'title' => 'Reel Pilihan Admin',
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('testimonials', [
            'id' => $testimonial->id,
            'quote' => 'Testimonial yang telah diperbarui admin.',
        ]);
        $this->assertDatabaseHas('news', [
            'id' => $news->id,
            'title' => 'Berita yang telah diperbarui admin.',
        ]);
        $this->assertDatabaseHas('info_banners', [
            'bootstrap_key' => 'info-banner-hours-v1',
            'message' => 'Jam operasional pilihan admin.',
        ]);
    }

    public function test_it_adopts_legacy_rows_and_repairs_missing_reference_assets(): void
    {
        $legacyPromoId = DB::table('promo_carousels')->insertGetId([
            'title' => 'Gym Training Area',
            'is_active' => false,
            'sort_order' => 42,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $legacySponsorId = DB::table('sponsor_logos')->insertGetId([
            'name' => 'B1',
            'is_active' => false,
            'sort_order' => 42,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $report = app(PublicContentSynchronizer::class)->sync();

        $this->assertSame(1, $report['promos_adopted']);
        $this->assertSame(1, $report['sponsors_adopted']);
        $this->assertDatabaseHas('promo_carousels', [
            'id' => $legacyPromoId,
            'bootstrap_key' => 'homepage-promo-gym-v1',
            'fallback_asset_path' => '/assets/images/poster-gym-konten-program-ub-sport-center.avif',
            'is_active' => false,
            'sort_order' => 42,
        ]);
        $this->assertDatabaseHas('sponsor_logos', [
            'id' => $legacySponsorId,
            'bootstrap_key' => 'homepage-sponsor-b1-v1',
            'fallback_asset_path' => '/assets/icons/B1.png',
            'is_active' => false,
            'sort_order' => 42,
        ]);
    }

    public function test_missing_author_uses_the_system_byline_without_creating_credentials(): void
    {
        $report = app(PublicContentSynchronizer::class)->sync();

        $this->assertSame(7, $report['news_using_system_byline']);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('news', 7);
        $this->assertDatabaseHas('news', [
            'bootstrap_key' => 'news-placeholder-1-v1',
            'author_id' => null,
        ]);
        $this->assertDatabaseCount('reviews', 0);
        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('memberships', 0);
        $this->assertDatabaseCount('transactions', 0);
        $this->assertDatabaseCount('promo_carousels', 4);
        $this->assertDatabaseCount('sponsor_logos', 5);
    }

    public function test_the_deployment_command_synchronizes_both_versioned_catalogs(): void
    {
        $exitCode = Artisan::call('reference-data:sync', ['--json' => true]);
        $report = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(0, $exitCode);
        $this->assertArrayHasKey('pricing_catalog', $report);
        $this->assertArrayHasKey('public_content', $report);
        $this->assertSame(15, $report['pricing_catalog']['facilities_created']);
        $this->assertSame(4, $report['public_content']['promos_created']);
        $this->assertDatabaseCount('facilities', 15);
        $this->assertDatabaseCount('promo_carousels', 4);
    }

    public function test_git_backed_assets_are_used_when_no_upload_exists(): void
    {
        app(PublicContentSynchronizer::class)->sync();

        $this->assertSame(
            '/assets/images/poster-gym-konten-program-ub-sport-center.avif',
            PromoCarousel::where('bootstrap_key', 'homepage-promo-gym-v1')->firstOrFail()->slideUrl(),
        );
        $this->assertSame(
            '/assets/icons/B1.png',
            SponsorLogo::where('bootstrap_key', 'homepage-sponsor-b1-v1')->firstOrFail()->logoUrl(),
        );
        $this->assertSame(
            '/assets/reels/thumbnail 1.png',
            Reel::where('bootstrap_key', 'homepage-reel-1-v1')->firstOrFail()->thumbnailUrl(),
        );
        $this->assertSame(
            '/assets/reels/reels ubsc 1.mp4',
            Reel::where('bootstrap_key', 'homepage-reel-1-v1')->firstOrFail()->videoUrl(),
        );
        $this->assertSame(
            '/assets/images/comingsoon.avif',
            News::where('bootstrap_key', 'news-placeholder-1-v1')->firstOrFail()->thumbnailUrl(),
        );
        $this->assertSame(
            '/assets/icons/testimonial-ub-sport-center.avif',
            Testimonial::where('bootstrap_key', 'testimonial-ub-football-club-v1')->firstOrFail()->imageUrl(),
        );
    }

    public function test_homepage_receives_the_complete_git_backed_public_catalog(): void
    {
        app(PublicContentSynchronizer::class)->sync();

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('HomePage')
                ->has('promos', 4)
                ->where('promos.0.src', '/assets/images/poster-gym-konten-program-ub-sport-center.avif')
                ->has('sponsors', 5)
                ->where('sponsors.0.img', '/assets/icons/B1.png')
                ->has('news', 7)
                ->where('news.0.image', '/assets/images/comingsoon.avif')
                ->has('reels', 5)
                ->where(
                    'reels.0.thumbnail',
                    fn (string $value): bool => str_starts_with($value, '/assets/reels/thumbnail '),
                )
                ->has('testimonials', 3));
    }

    public function test_every_public_content_asset_is_tracked_by_git(): void
    {
        foreach (PublicContentDefinition::assetPaths() as $path) {
            $absolutePath = public_path(ltrim($path, '/'));
            $relativePath = str_replace(
                '\\',
                '/',
                str($absolutePath)->after(base_path().DIRECTORY_SEPARATOR)->toString(),
            );

            $this->assertFileExists($absolutePath);
            $this->assertNotSame('', trim((string) shell_exec(
                'git ls-files --error-unmatch '.escapeshellarg($relativePath).
                ' 2>'.(PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null'),
            )), "Public content asset is not tracked by Git: {$path}");
        }
    }
}
