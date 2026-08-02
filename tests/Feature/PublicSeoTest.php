<?php

namespace Tests\Feature;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Support\PublicSeo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class PublicSeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_homepage_emits_complete_server_rendered_search_metadata(): void
    {
        $response = $this->get('/?auth=login&return_to=%2Fbooking');

        $response
            ->assertOk()
            ->assertSee('<html lang="id-ID">', false)
            ->assertSee('UB Sport Center Malang | Gym &amp; Fasilitas Olahraga', false)
            ->assertSee('name="description"', false)
            ->assertSee('rel="canonical" href="https://ubsportcenter.co.id/"', false)
            ->assertSee('property="og:site_name" content="UB Sport Center"', false)
            ->assertSee('property="og:url" content="https://ubsportcenter.co.id/"', false)
            ->assertSee('name="twitter:card"', false)
            ->assertSee('content="summary_large_image"', false)
            ->assertSee('type="application/ld+json"', false)
            ->assertSee('"@type":"Organization"', false)
            ->assertSee('"@type":"WebSite"', false)
            ->assertSee('rel="icon" type="image/svg+xml" sizes="any" href="/ubsc-tab.svg', false)
            ->assertSee('rel="manifest" href="/site.webmanifest"', false)
            ->assertDontSee('UBSC PRO.png', false)
            ->assertDontSee(
                'rel="canonical" href="https://ubsportcenter.co.id/?auth=',
                false,
            );
    }

    public function test_non_public_pages_receive_an_http_noindex_directive(): void
    {
        $this->get('/coming-soon')
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    public function test_branch_page_emits_local_sports_location_schema(): void
    {
        $this->get(route('branches.show', ['slug' => 'ubsc-veteran']))
            ->assertOk()
            ->assertSee(
                'rel="canonical" href="https://ubsportcenter.co.id/branches/ubsc-veteran"',
                false,
            )
            ->assertSee('"@type":"SportsActivityLocation"', false)
            ->assertSee('"@type":"PostalAddress"', false)
            ->assertSee('"openingHours":"Mo-Su 06:00-22:00"', false);
    }

    public function test_primary_sitemap_indexes_every_public_sitemap_family(): void
    {
        $this->get(route('gallery.sitemap.index'))
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->assertSee('https://ubsportcenter.co.id/sitemap-pages.xml', false)
            ->assertSee('https://ubsportcenter.co.id/sitemap-news.xml', false)
            ->assertSee('https://ubsportcenter.co.id/sitemap-facilities.xml', false)
            ->assertSee('https://ubsportcenter.co.id/sitemap-gallery-pages.xml', false)
            ->assertSee('https://ubsportcenter.co.id/sitemap-gallery-images.xml', false)
            ->assertSee('https://ubsportcenter.co.id/sitemap-gallery-videos.xml', false);
    }

    public function test_page_sitemap_contains_the_main_sitelink_candidates(): void
    {
        $this->get(route('sitemap.pages'))
            ->assertOk()
            ->assertSee('<loc>https://ubsportcenter.co.id/</loc>', false)
            ->assertSee('<loc>https://ubsportcenter.co.id/about</loc>', false)
            ->assertSee('<loc>https://ubsportcenter.co.id/news</loc>', false)
            ->assertSee('<loc>https://ubsportcenter.co.id/facilities</loc>', false)
            ->assertSee('<loc>https://ubsportcenter.co.id/pricing</loc>', false)
            ->assertSee('<loc>https://ubsportcenter.co.id/booking</loc>', false)
            ->assertSee(
                '<loc>https://ubsportcenter.co.id/branches/ubsc-veteran</loc>',
                false,
            )
            ->assertSee(
                '<loc>https://ubsportcenter.co.id/branches/ubsc-dieng</loc>',
                false,
            );
    }

    public function test_entity_helpers_generate_safe_canonical_graphs(): void
    {
        $article = PublicSeo::article(
            Request::create('/news/latihan-terbaik?utm_source=test'),
            [
                'title' => 'Latihan Terbaik',
                'excerpt' => 'Panduan latihan dari tim UB Sport Center.',
                'published_at' => '2026-07-30T08:00:00+07:00',
            ],
        );

        $facility = PublicSeo::facility(
            Request::create('/facilities/lapangan-tenis?media=1'),
            [
                'name' => 'Lapangan Tenis',
                'description' => 'Lapangan tenis untuk latihan dan pertandingan.',
                'location' => 'Veteran',
            ],
        );

        $this->assertSame(
            'https://ubsportcenter.co.id/news/latihan-terbaik',
            $article['canonical'],
        );
        $this->assertSame('article', $article['type']);
        $this->assertContains(
            'Article',
            collect($article['json_ld']['@graph'])->pluck('@type')->all(),
        );
        $this->assertSame(
            'https://ubsportcenter.co.id/facilities/lapangan-tenis',
            $facility['canonical'],
        );
        $this->assertContains(
            'Service',
            collect($facility['json_ld']['@graph'])->pluck('@type')->all(),
        );
        $this->assertFalse(PublicSeo::isIndexablePath('/checkout/booking/1'));
        $this->assertFalse(PublicSeo::isIndexableRoute('admin.dashboard'));
    }

    public function test_legacy_facility_alias_redirects_to_the_database_slug(): void
    {
        $category = FacilityCategory::create([
            'name' => 'Lapangan',
            'slug' => 'lapangan-seo',
        ]);

        Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Tenis',
            'slug' => 'lapangan-tenis',
            'capacity' => 4,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $this->get('/facilities/lapangan-tenis-1')
            ->assertStatus(301)
            ->assertRedirect('/facilities/lapangan-tenis');
    }
}
