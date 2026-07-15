<?php

namespace App\Http\Controllers\Public;

use App\Enums\GalleryMediaType;
use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GallerySection;
use App\Services\Gallery\GalleryMediaUrlService;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class GallerySitemapController extends Controller
{
    public function index(): Response
    {
        $lastModified = GalleryItem::query()->publiclyVisible()->max('updated_at');
        $entries = [
            $this->canonicalRoute('gallery.sitemap.pages'),
            $this->canonicalRoute('gallery.sitemap.images'),
            $this->canonicalRoute('gallery.sitemap.videos'),
        ];
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        foreach ($entries as $location) {
            $xml .= '<sitemap><loc>'.$this->xml($location).'</loc>';
            if ($lastModified) {
                $xml .= '<lastmod>'.$this->xml((string) $lastModified).'</lastmod>';
            }
            $xml .= '</sitemap>';
        }

        return response($xml.'</sitemapindex>', 200, $this->headers());
    }

    public function pages(): Response
    {
        $urls = [[
            'loc' => $this->canonicalRoute('gallery.index'),
            'lastmod' => GalleryItem::query()->publiclyVisible()->max('updated_at'),
        ]];

        GallerySection::query()->active()->orderBy('id')->each(function (GallerySection $section) use (&$urls) {
            $urls[] = [
                'loc' => $this->canonicalRoute('gallery.section', $section->slug),
                'lastmod' => $section->items()->publiclyVisible()->max('gallery_items.updated_at'),
            ];
        });
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        foreach ($urls as $url) {
            $xml .= '<url><loc>'.$this->xml($url['loc']).'</loc>';
            if ($url['lastmod']) {
                $xml .= '<lastmod>'.$this->xml((string) $url['lastmod']).'</lastmod>';
            }
            $xml .= '<changefreq>weekly</changefreq><priority>0.8</priority></url>';
        }

        return response($xml.'</urlset>', 200, $this->headers());
    }

    public function images(GalleryMediaUrlService $urls): StreamedResponse
    {
        return response()->stream(function () use ($urls) {
            echo '<?xml version="1.0" encoding="UTF-8"?>';
            echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';

            GalleryItem::query()
                ->publiclyVisible()
                ->where('media_type', GalleryMediaType::Image->value)
                ->with(['translations', 'sections'])
                ->orderBy('id')
                ->chunkById(300, function ($items) use ($urls) {
                    foreach ($items as $item) {
                        $image = $urls->image(($item->derivatives ?? [])['image'] ?? null);
                        if (! $image) {
                            continue;
                        }
                        $translation = $item->translation('id');
                        $pageUrl = $this->itemPageUrl($item);
                        echo '<url><loc>'.$this->xml($pageUrl).'</loc><image:image>';
                        echo '<image:loc>'.$this->xml($this->absolute($image['fallback_url'])).'</image:loc>';
                        echo '<image:title>'.$this->xml($translation?->title ?? 'UB Sport Center').'</image:title>';
                        if ($translation?->caption) {
                            echo '<image:caption>'.$this->xml($translation->caption).'</image:caption>';
                        }
                        echo '</image:image></url>';
                    }
                });

            echo '</urlset>';
        }, 200, $this->headers());
    }

    public function videos(GalleryMediaUrlService $urls): StreamedResponse
    {
        return response()->stream(function () use ($urls) {
            echo '<?xml version="1.0" encoding="UTF-8"?>';
            echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">';

            GalleryItem::query()
                ->publiclyVisible()
                ->where('media_type', GalleryMediaType::Video->value)
                ->with(['translations', 'sections'])
                ->orderBy('id')
                ->chunkById(200, function ($items) use ($urls) {
                    foreach ($items as $item) {
                        $video = $urls->video(($item->derivatives ?? [])['video'] ?? null);
                        if (! $video || empty($video['poster']['fallback_url'])) {
                            continue;
                        }
                        $translation = $item->translation('id');
                        echo '<url><loc>'.$this->xml($this->itemPageUrl($item)).'</loc><video:video>';
                        echo '<video:thumbnail_loc>'.$this->xml($this->absolute($video['poster']['fallback_url'])).'</video:thumbnail_loc>';
                        echo '<video:title>'.$this->xml($translation?->title ?? 'UB Sport Center').'</video:title>';
                        echo '<video:description>'.$this->xml($translation?->caption ?: $translation?->alt_text ?: $translation?->title ?: 'Video fasilitas UB Sport Center').'</video:description>';
                        echo '<video:content_loc>'.$this->xml($this->absolute($video['fallback_url'])).'</video:content_loc>';
                        echo '<video:duration>'.max(1, (int) ceil($item->duration_ms / 1000)).'</video:duration>';
                        if ($item->published_at) {
                            echo '<video:publication_date>'.$this->xml($item->published_at->toIso8601String()).'</video:publication_date>';
                        }
                        echo '</video:video></url>';
                    }
                });

            echo '</urlset>';
        }, 200, $this->headers());
    }

    private function itemPageUrl(GalleryItem $item): string
    {
        $section = $item->sections->firstWhere('is_active', true);

        return $section
            ? $this->canonicalRoute('gallery.section', $section->slug)
            : $this->canonicalRoute('gallery.index');
    }

    private function absolute(string $url): string
    {
        return str_starts_with($url, 'http://') || str_starts_with($url, 'https://')
            ? $url
            : rtrim((string) config('facility-gallery.canonical_origin'), '/').'/'.ltrim($url, '/');
    }

    private function canonicalRoute(string $name, mixed $parameters = []): string
    {
        return rtrim((string) config('facility-gallery.canonical_origin'), '/')
            .route($name, $parameters, false);
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=900',
        ];
    }
}
