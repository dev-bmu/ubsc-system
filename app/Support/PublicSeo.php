<?php

namespace App\Support;

use DateTimeImmutable;
use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Throwable;

final class PublicSeo
{
    private const DEFAULT_ORIGIN = 'https://ubsportcenter.co.id';

    /**
     * Build metadata for a public request that does not need entity-specific
     * Article, Service, or SportsActivityLocation structured data.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function forRequest(Request $request, array $overrides = []): array
    {
        $path = self::requestPath($request);
        $page = self::pageConfig(self::pageKey($request, $path));
        $breadcrumbs = $overrides['breadcrumbs'] ?? self::breadcrumbsFor($request, $path);
        $indexable = self::isIndexable($request);

        $seo = self::normalize([
            'title' => $page['title'] ?? self::siteName(),
            'description' => $page['description'] ?? config('business.description', ''),
            'canonical' => self::canonical($path),
            'image' => $page['image'] ?? config('seo.default_image'),
            'robots' => $indexable
                ? config('seo.robots.index')
                : config('seo.robots.noindex'),
            'type' => 'website',
            'site_name' => self::siteName(),
            'locale' => config('seo.locale', 'id_ID'),
            'image_alt' => $page['image_alt'] ?? config('seo.default_image_alt'),
            'json_ld' => [],
            ...$overrides,
        ]);

        if (! $indexable) {
            $seo['robots'] = config('seo.robots.noindex', 'noindex, nofollow, noarchive');
            $seo['json_ld'] = [];
        } elseif (! array_key_exists('json_ld', $overrides)) {
            $seo['json_ld'] = match (true) {
                $path === '/' => self::homepageGraph($seo),
                default => self::webpageGraph(
                    $seo,
                    self::normalizeBreadcrumbs($breadcrumbs, $seo),
                ),
            };
        }

        return $seo;
    }

    /**
     * Build metadata for a page that must never enter a search index.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function noIndex(
        Request|string|null $subject = null,
        array $overrides = [],
    ): array {
        $forced = [
            ...$overrides,
            'robots' => config('seo.robots.noindex', 'noindex, nofollow, noarchive'),
            'json_ld' => [],
        ];

        if ($subject instanceof Request) {
            return self::forRequest($subject, $forced);
        }

        return self::normalize([
            'title' => self::siteName(),
            'description' => config('business.description', ''),
            'canonical' => self::canonical($subject ?? '/'),
            'image' => config('seo.default_image'),
            'robots' => config('seo.robots.noindex', 'noindex, nofollow, noarchive'),
            'type' => 'website',
            'site_name' => self::siteName(),
            'locale' => config('seo.locale', 'id_ID'),
            'image_alt' => config('seo.default_image_alt'),
            'json_ld' => [],
            ...$forced,
        ]);
    }

    /**
     * Build metadata and Article JSON-LD for a published news/article entity.
     *
     * Recognized values include title, slug, excerpt, description, sub_title,
     * content, category, cover_image, images_array, published_at, updated_at,
     * and author.name.
     *
     * @param  array<string, mixed>|object  $article
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function article(
        Request $request,
        array|object $article,
        array $overrides = [],
    ): array {
        $fallback = self::pageConfig('article');
        $name = self::cleanText(
            self::firstValue($article, ['title', 'name']),
        );
        $description = self::descriptionFrom(
            $article,
            ['excerpt', 'sub_title', 'description', 'content'],
            $fallback['description'] ?? '',
        );
        $image = self::entityImage($article);
        $category = self::cleanText(
            self::firstValue($article, ['category.name', 'category']),
        );
        $canonical = self::canonical($request);

        $seo = self::normalize([
            'title' => $name !== ''
                ? self::brandedTitle($name)
                : ($fallback['title'] ?? self::siteName()),
            'description' => $description,
            'canonical' => $canonical,
            'image' => $image,
            'robots' => self::isIndexable($request)
                ? config('seo.robots.index')
                : config('seo.robots.noindex'),
            'type' => 'article',
            'site_name' => self::siteName(),
            'locale' => config('seo.locale', 'id_ID'),
            'image_alt' => $name !== ''
                ? 'Ilustrasi '.$name
                : ($fallback['image_alt'] ?? config('seo.default_image_alt')),
            'json_ld' => [],
            ...$overrides,
        ]);

        if (! array_key_exists('json_ld', $overrides)) {
            $articleId = $seo['canonical'].'#article';
            $articleNode = self::filter([
                '@type' => 'Article',
                '@id' => $articleId,
                'headline' => $name !== '' ? $name : $seo['title'],
                'description' => $seo['description'],
                'image' => $seo['image'],
                'datePublished' => self::dateValue(
                    self::firstValue($article, ['published_at', 'date']),
                ),
                'dateModified' => self::dateValue(
                    self::firstValue($article, ['updated_at', 'modified_at']),
                ),
                'articleSection' => $category,
                'inLanguage' => config('seo.language', 'id-ID'),
                'mainEntityOfPage' => [
                    '@id' => $seo['canonical'].'#webpage',
                ],
                'author' => self::articleAuthor($article),
                'publisher' => [
                    '@id' => self::canonicalOrigin().'/#organization',
                ],
            ]);

            $breadcrumbs = $overrides['breadcrumbs'] ?? [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Berita', 'path' => '/news'],
                ['name' => $name !== '' ? $name : 'Artikel', 'url' => $seo['canonical']],
            ];

            $seo['json_ld'] = self::webpageGraph(
                $seo,
                self::normalizeBreadcrumbs($breadcrumbs, $seo),
                [$articleNode],
                $articleId,
            );
        }

        return $seo;
    }

    /**
     * Build metadata and Service JSON-LD for a public sports facility.
     *
     * @param  array<string, mixed>|object  $facility
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function facility(
        Request $request,
        array|object $facility,
        array $overrides = [],
    ): array {
        $fallback = self::pageConfig('facility');
        $name = self::cleanText(
            self::firstValue($facility, ['name', 'title']),
        );
        $description = self::descriptionFrom(
            $facility,
            ['description'],
            $fallback['description'] ?? '',
        );
        $location = self::cleanText(
            self::firstValue($facility, ['location']),
        );
        $category = self::cleanText(
            self::firstValue($facility, ['category.name', 'category', 'venue_type']),
        );
        $mapUrl = self::validUrl(
            self::firstValue($facility, ['map_url', 'mapLink']),
        );

        $seo = self::normalize([
            'title' => $name !== ''
                ? self::brandedTitle($name)
                : ($fallback['title'] ?? self::siteName()),
            'description' => $description,
            'canonical' => self::canonical($request),
            'image' => self::entityImage($facility),
            'robots' => self::isIndexable($request)
                ? config('seo.robots.index')
                : config('seo.robots.noindex'),
            'type' => 'website',
            'site_name' => self::siteName(),
            'locale' => config('seo.locale', 'id_ID'),
            'image_alt' => $name !== ''
                ? $name.' di UB Sport Center'
                : ($fallback['image_alt'] ?? config('seo.default_image_alt')),
            'json_ld' => [],
            ...$overrides,
        ]);

        if (! array_key_exists('json_ld', $overrides)) {
            $serviceId = $seo['canonical'].'#service';
            $branch = self::branchForLocation($location);
            $serviceNode = self::filter([
                '@type' => 'Service',
                '@id' => $serviceId,
                'name' => $name !== '' ? $name : $seo['title'],
                'description' => $seo['description'],
                'serviceType' => $category !== '' ? $category : $name,
                'url' => $seo['canonical'],
                'image' => $seo['image'],
                'provider' => [
                    '@id' => self::canonicalOrigin().'/#organization',
                ],
                'areaServed' => [
                    '@type' => 'City',
                    'name' => 'Kota Malang',
                ],
                'location' => self::serviceLocation($location, $branch, $mapUrl),
                'availableChannel' => [
                    '@type' => 'ServiceChannel',
                    'serviceUrl' => self::canonical('/booking'),
                ],
                'mainEntityOfPage' => [
                    '@id' => $seo['canonical'].'#webpage',
                ],
            ]);

            $breadcrumbs = $overrides['breadcrumbs'] ?? [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Fasilitas', 'path' => '/facilities'],
                ['name' => $name !== '' ? $name : 'Detail Fasilitas', 'url' => $seo['canonical']],
            ];

            $seo['json_ld'] = self::webpageGraph(
                $seo,
                self::normalizeBreadcrumbs($breadcrumbs, $seo),
                [$serviceNode],
                $serviceId,
            );
        }

        return $seo;
    }

    /**
     * Build metadata and SportsActivityLocation JSON-LD for a public branch.
     *
     * @param  array<string, mixed>|object  $branch
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function branch(
        Request $request,
        array|object $branch,
        array $overrides = [],
    ): array {
        $fallback = self::pageConfig('branch');
        $slug = self::cleanText(
            self::firstValue($branch, ['slug']),
        );
        $configured = is_array(config("business.branches.{$slug}"))
            ? config("business.branches.{$slug}")
            : [];
        $name = self::cleanText(
            self::firstValue($branch, ['title', 'name'], $configured['name'] ?? ''),
        );
        $description = self::descriptionFrom(
            $branch,
            ['description'],
            $configured['description'] ?? ($fallback['description'] ?? ''),
        );
        $image = self::entityImage($branch, $configured['image'] ?? null);
        $address = self::postalAddress($branch, $configured);
        $telephone = self::cleanText(
            self::firstValue($branch, ['contact', 'telephone'], $configured['telephone'] ?? ''),
        );
        $mapUrl = self::validUrl(
            self::firstValue($branch, ['map_url'], $configured['map_url'] ?? null),
        );
        $openingHours = self::cleanText(
            self::firstValue(
                $branch,
                ['opening_hours_schema'],
                $configured['opening_hours_schema'] ?? '',
            ),
        );

        $seo = self::normalize([
            'title' => $name !== ''
                ? self::brandedTitle($name)
                : ($fallback['title'] ?? self::siteName()),
            'description' => $description,
            'canonical' => self::canonical($request),
            'image' => $image,
            'robots' => self::isIndexable($request)
                ? config('seo.robots.index')
                : config('seo.robots.noindex'),
            'type' => 'website',
            'site_name' => self::siteName(),
            'locale' => config('seo.locale', 'id_ID'),
            'image_alt' => $name !== ''
                ? 'Lokasi dan fasilitas '.$name
                : ($fallback['image_alt'] ?? config('seo.default_image_alt')),
            'json_ld' => [],
            ...$overrides,
        ]);

        if (! array_key_exists('json_ld', $overrides)) {
            $locationId = $seo['canonical'].'#location';
            $locationNode = self::filter([
                '@type' => 'SportsActivityLocation',
                '@id' => $locationId,
                'name' => $name !== '' ? $name : $seo['title'],
                'description' => $seo['description'],
                'url' => $seo['canonical'],
                'image' => $seo['image'],
                'address' => $address,
                'telephone' => $telephone,
                'openingHours' => $openingHours,
                'hasMap' => $mapUrl,
                'email' => config('business.email'),
                'parentOrganization' => [
                    '@id' => self::canonicalOrigin().'/#organization',
                ],
                'mainEntityOfPage' => [
                    '@id' => $seo['canonical'].'#webpage',
                ],
            ]);

            $breadcrumbs = $overrides['breadcrumbs'] ?? [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Tentang Kami', 'path' => '/about'],
                ['name' => $name !== '' ? $name : 'Lokasi', 'url' => $seo['canonical']],
            ];

            $seo['json_ld'] = self::webpageGraph(
                $seo,
                self::normalizeBreadcrumbs($breadcrumbs, $seo),
                [$locationNode],
                $locationId,
            );
        }

        return $seo;
    }

    /**
     * Return a canonical URL on the configured production origin.
     *
     * Query strings and fragments are intentionally removed so filtered,
     * paginated, auth, and campaign URLs consolidate on one document URL.
     */
    public static function canonical(Request|string|null $target = null): string
    {
        if ($target instanceof Request) {
            $path = self::requestPath($target);
        } else {
            $value = trim((string) ($target ?? '/'));
            $parts = parse_url($value);
            $path = is_array($parts) ? ($parts['path'] ?? '/') : '/';
        }

        $path = self::normalizePath((string) $path);

        return self::canonicalOrigin().$path;
    }

    /**
     * Convert a local public asset/path into an absolute URL. Valid external
     * HTTPS/HTTP media URLs are retained for CDN and media-library support.
     */
    public static function absolute(?string $value, string $fallback = '/'): string
    {
        $value = self::safeUrlValue($value);

        if ($value === '') {
            $value = self::safeUrlValue($fallback);
        }

        if (self::validUrl($value) !== null) {
            return $value;
        }

        if ($value === '' || str_starts_with($value, '//')) {
            return self::canonicalOrigin().'/';
        }

        return self::canonicalOrigin().'/'.ltrim($value, '/');
    }

    public static function canonicalOrigin(): string
    {
        $origin = rtrim(
            self::safeUrlValue(config('seo.canonical_origin', self::DEFAULT_ORIGIN)),
            '/',
        );
        $parts = parse_url($origin);

        if (! is_array($parts)
            || ! isset($parts['scheme'], $parts['host'])
            || ! in_array(strtolower((string) $parts['scheme']), ['http', 'https'], true)
            || isset($parts['user'])
            || isset($parts['pass'])
            || ($parts['path'] ?? '') !== ''
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            return self::DEFAULT_ORIGIN;
        }

        return $origin;
    }

    /**
     * Determine whether a request, public path, or named route belongs to the
     * deliberately indexable public surface.
     */
    public static function isIndexable(
        Request|string $subject,
        ?string $routeName = null,
    ): bool {
        if ($subject instanceof Request) {
            if (! $subject->isMethod('GET') && ! $subject->isMethod('HEAD')) {
                return false;
            }

            $routeName = $subject->route()?->getName();

            if ($routeName !== null && ! self::isIndexableRoute($routeName)) {
                return false;
            }

            return self::isIndexablePath(self::requestPath($subject));
        }

        if (! str_starts_with($subject, '/')
            && ! preg_match('#^https?://#i', $subject)) {
            return self::isIndexableRoute($subject);
        }

        if ($routeName !== null && ! self::isIndexableRoute($routeName)) {
            return false;
        }

        return self::isIndexablePath($subject);
    }

    public static function isIndexableRoute(?string $routeName): bool
    {
        if ($routeName === null || trim($routeName) === '') {
            return false;
        }

        return in_array(
            $routeName,
            (array) config('seo.indexable.routes', []),
            true,
        );
    }

    public static function isIndexablePath(string $path): bool
    {
        $parts = parse_url(trim($path));

        if ($parts === false) {
            return false;
        }

        $path = self::normalizePath((string) ($parts['path'] ?? '/'));

        if (in_array($path, (array) config('seo.indexable.exact_paths', []), true)) {
            return true;
        }

        foreach ((array) config('seo.indexable.path_patterns', []) as $pattern) {
            if (is_string($pattern) && preg_match($pattern, $path) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $seo
     * @return array<string, mixed>
     */
    private static function homepageGraph(array $seo): array
    {
        $origin = self::canonicalOrigin();
        $organizationId = $origin.'/#organization';
        $websiteId = $origin.'/#website';
        $webpageId = $seo['canonical'].'#webpage';
        $address = self::postalAddress(
            config('business.head_office', []),
        );

        $organization = self::filter([
            '@type' => 'Organization',
            '@id' => $organizationId,
            'name' => config('business.name', self::siteName()),
            'alternateName' => config('business.short_name', 'UBSC'),
            'url' => $origin.'/',
            'logo' => [
                '@type' => 'ImageObject',
                'url' => self::absolute(config('seo.organization_logo')),
            ],
            'image' => $seo['image'],
            'description' => config('business.description'),
            'email' => config('business.email'),
            'telephone' => config('business.whatsapp.number'),
            'address' => $address,
            'sameAs' => array_values(array_filter(
                (array) config('business.social', []),
                fn (mixed $url): bool => self::validUrl($url) !== null,
            )),
            'contactPoint' => [
                '@type' => 'ContactPoint',
                'contactType' => 'customer service',
                'telephone' => config('business.whatsapp.number'),
                'email' => config('business.email'),
                'url' => config('business.whatsapp.url'),
                'areaServed' => 'ID',
                'availableLanguage' => ['id'],
            ],
        ]);

        $website = [
            '@type' => 'WebSite',
            '@id' => $websiteId,
            'url' => $origin.'/',
            'name' => self::siteName(),
            'alternateName' => config('business.short_name', 'UBSC'),
            'inLanguage' => config('seo.language', 'id-ID'),
            'publisher' => [
                '@id' => $organizationId,
            ],
        ];

        $webpage = self::filter([
            '@type' => 'WebPage',
            '@id' => $webpageId,
            'url' => $seo['canonical'],
            'name' => $seo['title'],
            'description' => $seo['description'],
            'isPartOf' => [
                '@id' => $websiteId,
            ],
            'about' => [
                '@id' => $organizationId,
            ],
            'primaryImageOfPage' => [
                '@type' => 'ImageObject',
                'url' => $seo['image'],
            ],
            'inLanguage' => config('seo.language', 'id-ID'),
        ]);

        return [
            '@context' => 'https://schema.org',
            '@graph' => [$organization, $website, $webpage],
        ];
    }

    /**
     * @param  array<string, mixed>  $seo
     * @param  list<array{name: string, url: string}>  $breadcrumbs
     * @param  list<array<string, mixed>>  $entities
     * @return array<string, mixed>
     */
    private static function webpageGraph(
        array $seo,
        array $breadcrumbs,
        array $entities = [],
        ?string $mainEntityId = null,
    ): array {
        $pageId = $seo['canonical'].'#webpage';
        $breadcrumbId = $seo['canonical'].'#breadcrumb';

        $webpage = self::filter([
            '@type' => 'WebPage',
            '@id' => $pageId,
            'url' => $seo['canonical'],
            'name' => $seo['title'],
            'description' => $seo['description'],
            'isPartOf' => [
                '@id' => self::canonicalOrigin().'/#website',
            ],
            'about' => [
                '@id' => self::canonicalOrigin().'/#organization',
            ],
            'breadcrumb' => [
                '@id' => $breadcrumbId,
            ],
            'primaryImageOfPage' => [
                '@type' => 'ImageObject',
                'url' => $seo['image'],
            ],
            'mainEntity' => $mainEntityId ? ['@id' => $mainEntityId] : null,
            'inLanguage' => config('seo.language', 'id-ID'),
        ]);

        $breadcrumb = [
            '@type' => 'BreadcrumbList',
            '@id' => $breadcrumbId,
            'itemListElement' => array_map(
                fn (array $item, int $index): array => [
                    '@type' => 'ListItem',
                    'position' => $index + 1,
                    'name' => $item['name'],
                    'item' => $item['url'],
                ],
                $breadcrumbs,
                array_keys($breadcrumbs),
            ),
        ];

        return [
            '@context' => 'https://schema.org',
            '@graph' => [$webpage, $breadcrumb, ...$entities],
        ];
    }

    /**
     * @return list<array{name: string, path?: string, url?: string}>
     */
    private static function breadcrumbsFor(Request $request, string $path): array
    {
        return match (self::pageKey($request, $path)) {
            'about' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Tentang Kami', 'path' => '/about'],
            ],
            'news', 'article' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Berita', 'path' => '/news'],
            ],
            'facilities', 'facility' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Fasilitas', 'path' => '/facilities'],
            ],
            'gallery' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Fasilitas', 'path' => '/facilities'],
                ['name' => 'Galeri', 'path' => '/facilities/gallery'],
            ],
            'pricing' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Membership', 'path' => '/pricing'],
            ],
            'booking' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Booking', 'path' => '/booking'],
            ],
            'branch' => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => 'Tentang Kami', 'path' => '/about'],
                ['name' => 'Lokasi', 'url' => self::canonical($path)],
            ],
            default => [
                ['name' => 'Beranda', 'path' => '/'],
                ['name' => self::siteName(), 'url' => self::canonical($path)],
            ],
        };
    }

    /**
     * @param  array<string, mixed>  $seo
     * @return list<array{name: string, url: string}>
     */
    private static function normalizeBreadcrumbs(mixed $breadcrumbs, array $seo): array
    {
        $normalized = [];

        foreach (is_iterable($breadcrumbs) ? $breadcrumbs : [] as $breadcrumb) {
            if (! is_array($breadcrumb)) {
                continue;
            }

            $name = self::cleanText($breadcrumb['name'] ?? '');

            if ($name === '') {
                continue;
            }

            $normalized[] = [
                'name' => $name,
                'url' => isset($breadcrumb['url'])
                    ? self::canonical((string) $breadcrumb['url'])
                    : self::canonical((string) ($breadcrumb['path'] ?? '/')),
            ];
        }

        if ($normalized === []) {
            $normalized[] = [
                'name' => self::siteName(),
                'url' => $seo['canonical'],
            ];
        }

        return array_values($normalized);
    }

    private static function pageKey(Request $request, string $path): ?string
    {
        if ($path === '/') {
            return 'home';
        }

        return match ($request->route()?->getName()) {
            'about' => 'about',
            'news' => 'news',
            'news.show' => 'article',
            'facility' => 'facilities',
            'facilities.show' => 'facility',
            'gallery.index', 'gallery.section' => 'gallery',
            'pricing' => 'pricing',
            'booking' => 'booking',
            'branches.show' => 'branch',
            default => match (true) {
                $path === '/about' => 'about',
                $path === '/news' => 'news',
                $path === '/facilities' => 'facilities',
                str_starts_with($path, '/facilities/gallery') => 'gallery',
                $path === '/pricing' => 'pricing',
                $path === '/booking' => 'booking',
                str_starts_with($path, '/news/') => 'article',
                str_starts_with($path, '/facilities/') => 'facility',
                str_starts_with($path, '/branches/') => 'branch',
                default => null,
            },
        };
    }

    /**
     * @return array<string, mixed>
     */
    private static function pageConfig(?string $key): array
    {
        if ($key === null) {
            return [];
        }

        $page = config("seo.pages.{$key}", []);

        return is_array($page) ? $page : [];
    }

    /**
     * Return only the stable public SEO contract consumed by Inertia/head
     * rendering, regardless of helper-only override values.
     *
     * @param  array<string, mixed>  $seo
     * @return array<string, mixed>
     */
    private static function normalize(array $seo): array
    {
        $title = self::cleanText($seo['title'] ?? self::siteName());
        $description = self::limitDescription(
            self::cleanText($seo['description'] ?? config('business.description', '')),
        );
        $image = self::absolute(
            self::safeUrlValue($seo['image'] ?? null),
            (string) config('seo.default_image', '/'),
        );
        $imageAlt = self::cleanText(
            $seo['image_alt'] ?? config('seo.default_image_alt', self::siteName()),
        );

        return [
            'title' => $title !== '' ? $title : self::siteName(),
            'description' => $description,
            'canonical' => self::canonical(
                is_string($seo['canonical'] ?? null) ? $seo['canonical'] : '/',
            ),
            'image' => $image,
            'robots' => self::cleanText(
                $seo['robots'] ?? config('seo.robots.noindex', 'noindex, nofollow'),
            ),
            'type' => ($seo['type'] ?? 'website') === 'article' ? 'article' : 'website',
            'site_name' => self::cleanText($seo['site_name'] ?? self::siteName()),
            'locale' => self::cleanText($seo['locale'] ?? config('seo.locale', 'id_ID')),
            'image_alt' => $imageAlt !== '' ? $imageAlt : self::siteName(),
            'json_ld' => is_array($seo['json_ld'] ?? null) ? $seo['json_ld'] : [],
        ];
    }

    private static function requestPath(Request $request): string
    {
        return self::normalizePath('/'.ltrim($request->path(), '/'));
    }

    private static function normalizePath(string $path): string
    {
        $path = trim($path);

        if ($path === '' || $path === '/') {
            return '/';
        }

        if (preg_match('/[\x00-\x1F\x7F\\\\]/u', $path) === 1) {
            return '/';
        }

        $path = '/'.ltrim($path, '/');
        $path = preg_replace('#/+#', '/', $path) ?: '/';

        return rtrim($path, '/') ?: '/';
    }

    private static function siteName(): string
    {
        return self::cleanText(
            config('business.name', config('seo.site_name', 'UB Sport Center')),
        );
    }

    private static function brandedTitle(string $title): string
    {
        $title = self::cleanText($title);
        $siteName = self::siteName();

        if ($title === '' || Str::contains(Str::lower($title), Str::lower($siteName))) {
            return $title !== '' ? $title : $siteName;
        }

        return "{$title} | {$siteName}";
    }

    private static function cleanText(mixed $value): string
    {
        if ($value instanceof \Stringable) {
            $value = (string) $value;
        }

        if (! is_string($value) && ! is_numeric($value)) {
            return '';
        }

        $value = html_entity_decode(
            strip_tags((string) $value),
            ENT_QUOTES | ENT_HTML5,
            'UTF-8',
        );

        return trim(preg_replace('/\s+/u', ' ', $value) ?: '');
    }

    private static function limitDescription(string $description): string
    {
        if (mb_strlen($description) <= 160) {
            return $description;
        }

        return rtrim(Str::limit($description, 157, '...'));
    }

    /**
     * @param  array<string, mixed>|object  $entity
     * @param  list<string>  $keys
     */
    private static function firstValue(
        array|object $entity,
        array $keys,
        mixed $default = null,
    ): mixed {
        foreach ($keys as $key) {
            $value = data_get($entity, $key);

            if ($value !== null && $value !== '') {
                return $value;
            }
        }

        return $default;
    }

    /**
     * @param  array<string, mixed>|object  $entity
     * @param  list<string>  $keys
     */
    private static function descriptionFrom(
        array|object $entity,
        array $keys,
        string $fallback,
    ): string {
        foreach ($keys as $key) {
            $description = self::cleanText(data_get($entity, $key));

            if ($description !== '') {
                return $description;
            }
        }

        return self::cleanText($fallback);
    }

    /**
     * @param  array<string, mixed>|object  $entity
     */
    private static function entityImage(
        array|object $entity,
        ?string $fallback = null,
    ): string {
        $image = self::safeUrlValue(
            self::firstValue(
                $entity,
                ['cover_image', 'image', 'image_url', 'thumbnail'],
            ),
        );

        if ($image !== '') {
            return $image;
        }

        $images = self::firstValue($entity, ['images_array', 'images'], []);

        if (is_iterable($images)) {
            foreach ($images as $candidate) {
                $image = self::safeUrlValue($candidate);

                if ($image !== '') {
                    return $image;
                }
            }
        }

        return $fallback ?: (string) config('seo.default_image', '/');
    }

    /**
     * @param  array<string, mixed>|object  $article
     * @return array<string, mixed>
     */
    private static function articleAuthor(array|object $article): array
    {
        $name = self::cleanText(
            self::firstValue($article, ['author.name', 'author_name']),
        );

        if ($name === '') {
            return [
                '@id' => self::canonicalOrigin().'/#organization',
            ];
        }

        $author = [
            '@type' => 'Person',
            'name' => $name,
        ];
        $url = self::validUrl(
            self::firstValue($article, ['author.url', 'author_url']),
        );

        if ($url !== null) {
            $author['url'] = $url;
        }

        return $author;
    }

    private static function dateValue(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format(DateTimeInterface::ATOM);
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $value = trim($value);

        try {
            $date = DateTimeImmutable::createFromFormat('!d.m.Y', $value);

            if ($date instanceof DateTimeImmutable) {
                return $date->format('Y-m-d');
            }

            return (new DateTimeImmutable($value))->format(DateTimeInterface::ATOM);
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function branchForLocation(string $location): ?array
    {
        $location = Str::lower($location);
        $slug = match (true) {
            Str::contains($location, 'dieng') => 'ubsc-dieng',
            Str::contains($location, 'veteran') => 'ubsc-veteran',
            default => null,
        };

        if ($slug === null) {
            return null;
        }

        $branch = config("business.branches.{$slug}");

        return is_array($branch) ? $branch : null;
    }

    /**
     * @param  array<string, mixed>|null  $branch
     * @return array<string, mixed>|null
     */
    private static function serviceLocation(
        string $location,
        ?array $branch,
        ?string $mapUrl,
    ): ?array {
        if ($location === '' && $branch === null && $mapUrl === null) {
            return null;
        }

        return self::filter([
            '@type' => 'SportsActivityLocation',
            '@id' => isset($branch['slug'])
                ? self::canonical('/branches/'.$branch['slug']).'#location'
                : null,
            'name' => $branch['name'] ?? ($location !== '' ? 'UB Sport Center '.$location : null),
            'address' => $branch ? self::postalAddress($branch) : null,
            'hasMap' => $mapUrl ?? ($branch['map_url'] ?? null),
        ]);
    }

    /**
     * @param  array<string, mixed>|object  $source
     * @param  array<string, mixed>  $fallback
     * @return array<string, mixed>
     */
    private static function postalAddress(
        array|object $source,
        array $fallback = [],
    ): array {
        return self::filter([
            '@type' => 'PostalAddress',
            'streetAddress' => self::cleanText(
                self::firstValue(
                    $source,
                    ['street_address', 'address'],
                    $fallback['street_address'] ?? $fallback['address'] ?? '',
                ),
            ),
            'addressLocality' => self::cleanText(
                self::firstValue(
                    $source,
                    ['address_locality'],
                    $fallback['address_locality'] ?? '',
                ),
            ),
            'addressRegion' => self::cleanText(
                self::firstValue(
                    $source,
                    ['address_region'],
                    $fallback['address_region'] ?? '',
                ),
            ),
            'postalCode' => self::cleanText(
                self::firstValue(
                    $source,
                    ['postal_code'],
                    $fallback['postal_code'] ?? '',
                ),
            ),
            'addressCountry' => self::cleanText(
                self::firstValue(
                    $source,
                    ['address_country'],
                    $fallback['address_country'] ?? 'ID',
                ),
            ),
        ]);
    }

    private static function safeUrlValue(mixed $value): string
    {
        if ($value instanceof \Stringable) {
            $value = (string) $value;
        }

        if (! is_string($value)) {
            return '';
        }

        $value = trim($value);

        if ($value === ''
            || mb_strlen($value) > 2048
            || preg_match('/[\x00-\x1F\x7F\\\\]/u', $value) === 1) {
            return '';
        }

        return $value;
    }

    private static function validUrl(mixed $value): ?string
    {
        $value = self::safeUrlValue($value);

        if ($value === '' || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($value);

        if (! is_array($parts)
            || isset($parts['user'])
            || isset($parts['pass'])) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        return in_array($scheme, ['http', 'https'], true) ? $value : null;
    }

    /**
     * Recursively remove nulls and empty strings while retaining zero/false.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private static function filter(array $values): array
    {
        foreach ($values as $key => $value) {
            if (is_array($value)) {
                $value = self::filter($value);
            }

            if ($value === null || $value === '' || $value === []) {
                unset($values[$key]);

                continue;
            }

            $values[$key] = $value;
        }

        return $values;
    }
}
