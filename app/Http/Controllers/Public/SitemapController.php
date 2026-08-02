<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Models\News;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Route;

class SitemapController extends Controller
{
    private const PUBLIC_NEWS_CATEGORIES = ['Berita', 'Artikel'];

    private const BRANCH_SLUGS = ['ubsc-veteran', 'ubsc-dieng'];

    public function index(): Response
    {
        $entries = [
            [
                'loc' => $this->canonicalPath('/sitemap-pages.xml'),
                'lastmod' => null,
            ],
            [
                'loc' => $this->canonicalPath('/sitemap-news.xml'),
                'lastmod' => $this->newsLastModified(),
            ],
            [
                'loc' => $this->canonicalPath('/sitemap-facilities.xml'),
                'lastmod' => $this->facilitiesLastModified(),
            ],
            [
                'loc' => $this->canonicalRoute('gallery.sitemap.pages'),
                'lastmod' => null,
            ],
            [
                'loc' => $this->canonicalRoute('gallery.sitemap.images'),
                'lastmod' => null,
            ],
            [
                'loc' => $this->canonicalRoute('gallery.sitemap.videos'),
                'lastmod' => null,
            ],
        ];

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        foreach ($entries as $entry) {
            $xml .= '<sitemap><loc>'.$this->xml($entry['loc']).'</loc>';

            if ($entry['lastmod'] !== null) {
                $xml .= '<lastmod>'.$this->xml($entry['lastmod']).'</lastmod>';
            }

            $xml .= '</sitemap>';
        }

        return $this->xmlResponse($xml.'</sitemapindex>');
    }

    public function pages(): Response
    {
        $urls = [
            ['loc' => $this->canonicalNamedRoute('home', '/', [])],
            ['loc' => $this->canonicalRoute('about')],
            ['loc' => $this->canonicalRoute('news')],
            ['loc' => $this->canonicalRoute('facility')],
            ['loc' => $this->canonicalRoute('pricing')],
            ['loc' => $this->canonicalRoute('booking')],
        ];

        foreach (self::BRANCH_SLUGS as $slug) {
            $urls[] = [
                'loc' => $this->canonicalRoute('branches.show', ['slug' => $slug]),
            ];
        }

        return $this->urlSetResponse($urls);
    }

    public function news(): Response
    {
        $urls = $this->publicNewsQuery()
            ->select(['id', 'slug', 'published_at', 'updated_at'])
            ->orderBy('id')
            ->get()
            ->map(fn (News $news): array => [
                'loc' => $this->canonicalRoute('news.show', ['slug' => $news->slug]),
                'lastmod' => $this->latestTimestamp(
                    $news->published_at,
                    $news->updated_at,
                ),
            ])
            ->all();

        return $this->urlSetResponse($urls);
    }

    public function facilities(): Response
    {
        $urls = $this->activeFacilitiesQuery()
            ->select(['id', 'slug', 'updated_at'])
            ->orderBy('id')
            ->get()
            ->map(fn (Facility $facility): array => [
                'loc' => $this->canonicalRoute('facilities.show', ['slug' => $facility->slug]),
                'lastmod' => $this->latestTimestamp($facility->updated_at),
            ])
            ->all();

        return $this->urlSetResponse($urls);
    }

    private function publicNewsQuery(): Builder
    {
        return News::query()
            ->published()
            ->whereNotNull('slug')
            ->where('slug', '!=', '')
            ->whereHas(
                'category',
                fn (Builder $query): Builder => $query->whereIn('name', self::PUBLIC_NEWS_CATEGORIES),
            );
    }

    private function activeFacilitiesQuery(): Builder
    {
        return Facility::query()
            ->active()
            ->whereNotNull('slug')
            ->where('slug', '!=', '');
    }

    private function newsLastModified(): ?string
    {
        return $this->latestTimestamp(
            $this->publicNewsQuery()->max('published_at'),
            $this->publicNewsQuery()->max('updated_at'),
        );
    }

    private function facilitiesLastModified(): ?string
    {
        return $this->latestTimestamp(
            $this->activeFacilitiesQuery()->max('updated_at'),
        );
    }

    private function latestTimestamp(mixed ...$values): ?string
    {
        $latest = collect($values)
            ->filter(fn (mixed $value): bool => $value !== null && $value !== '')
            ->map(fn (mixed $value): CarbonImmutable => CarbonImmutable::parse($value))
            ->sortByDesc(fn (CarbonImmutable $value): int => $value->getTimestamp())
            ->first();

        return $latest?->toAtomString();
    }

    /**
     * @param  array<int, array{loc: string, lastmod?: string|null}>  $urls
     */
    private function urlSetResponse(array $urls): Response
    {
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        foreach ($urls as $url) {
            $xml .= '<url><loc>'.$this->xml($url['loc']).'</loc>';

            if (($url['lastmod'] ?? null) !== null) {
                $xml .= '<lastmod>'.$this->xml($url['lastmod']).'</lastmod>';
            }

            $xml .= '</url>';
        }

        return $this->xmlResponse($xml.'</urlset>');
    }

    private function canonicalNamedRoute(string $name, string $fallbackPath, array $parameters): string
    {
        return Route::has($name)
            ? $this->canonicalRoute($name, $parameters)
            : $this->canonicalPath($fallbackPath);
    }

    private function canonicalRoute(string $name, array $parameters = []): string
    {
        return $this->canonicalPath(route($name, $parameters, false));
    }

    private function canonicalPath(string $path): string
    {
        return $this->canonicalOrigin().'/'.ltrim($path, '/');
    }

    private function canonicalOrigin(): string
    {
        $origin = trim((string) config('seo.canonical_origin', ''));

        if ($origin === '') {
            $origin = trim((string) config('facility-gallery.canonical_origin'));
        }

        return rtrim($origin, '/');
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function xmlResponse(string $xml): Response
    {
        return response($xml, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=900',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
