<!DOCTYPE html>
<html lang="{{ config('seo.language', 'id-ID') }}">
    <head>
        @php
            $seo = $page['props']['seo'] ?? [];
            $seoTitle = $seo['title'] ?? config('app.name', 'UB Sport Center');
            $seoDescription = $seo['description'] ?? null;
            $seoCanonical = $seo['canonical'] ?? null;
            $seoRobots = $seo['robots'] ?? 'noindex, nofollow, noarchive';
            $seoImage = $seo['image'] ?? null;
            $seoImageAlt = $seo['image_alt'] ?? null;
            $seoType = $seo['type'] ?? 'website';
            $seoSiteName = $seo['site_name'] ?? config('seo.site_name', 'UB Sport Center');
            $seoLocale = $seo['locale'] ?? config('seo.locale', 'id_ID');
            $seoJsonLd = $seo['json_ld'] ?? null;
            $safeSeoJsonLd = $seoJsonLd
                ? json_encode(
                    $seoJsonLd,
                    JSON_UNESCAPED_SLASHES
                        | JSON_UNESCAPED_UNICODE
                        | JSON_HEX_TAG
                        | JSON_HEX_AMP
                        | JSON_HEX_APOS
                        | JSON_HEX_QUOT,
                )
                : null;

            if (! isset($__inertiaSsrDispatched)) {
                $__inertiaSsrDispatched = true;
                $__inertiaSsrResponse = app(\Inertia\Ssr\Gateway::class)->dispatch($page);
            }
        @endphp

        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="theme-color" content="#071522">
        <meta name="application-name" content="UB Sport Center">

        @if (! $__inertiaSsrResponse)
            <title inertia="seo-title">{{ $seoTitle }}</title>
            @if ($seoDescription)
                <meta inertia="seo-description" name="description" content="{{ $seoDescription }}">
            @endif
            <meta inertia="seo-robots" name="robots" content="{{ $seoRobots }}">
            @if ($seoCanonical)
                <link inertia="seo-canonical" rel="canonical" href="{{ $seoCanonical }}">
            @endif
            @if ($seo['previous'] ?? null)
                <link inertia="seo-prev" rel="prev" href="{{ $seo['previous'] }}">
            @endif
            @if ($seo['next'] ?? null)
                <link inertia="seo-next" rel="next" href="{{ $seo['next'] }}">
            @endif

            <meta inertia="seo-og-type" property="og:type" content="{{ $seoType }}">
            <meta inertia="seo-og-site-name" property="og:site_name" content="{{ $seoSiteName }}">
            <meta inertia="seo-og-locale" property="og:locale" content="{{ $seoLocale }}">
            <meta inertia="seo-og-title" property="og:title" content="{{ $seoTitle }}">
            @if ($seoDescription)
                <meta inertia="seo-og-description" property="og:description" content="{{ $seoDescription }}">
            @endif
            @if ($seoCanonical)
                <meta inertia="seo-og-url" property="og:url" content="{{ $seoCanonical }}">
            @endif
            @if ($seoImage)
                <meta inertia="seo-og-image" property="og:image" content="{{ $seoImage }}">
            @endif
            @if ($seoImageAlt)
                <meta inertia="seo-og-image-alt" property="og:image:alt" content="{{ $seoImageAlt }}">
            @endif

            <meta
                inertia="seo-twitter-card"
                name="twitter:card"
                content="{{ $seoImage ? 'summary_large_image' : 'summary' }}"
            >
            <meta inertia="seo-twitter-title" name="twitter:title" content="{{ $seoTitle }}">
            @if ($seoDescription)
                <meta inertia="seo-twitter-description" name="twitter:description" content="{{ $seoDescription }}">
            @endif
            @if ($seoImage)
                <meta inertia="seo-twitter-image" name="twitter:image" content="{{ $seoImage }}">
            @endif
            @if ($seoImageAlt)
                <meta inertia="seo-twitter-image-alt" name="twitter:image:alt" content="{{ $seoImageAlt }}">
            @endif
            @if ($safeSeoJsonLd)
                <script nonce="{{ \Illuminate\Support\Facades\Vite::cspNonce() }}" inertia="seo-json-ld" type="application/ld+json">{!! $safeSeoJsonLd !!}</script>
            @endif
        @endif

        @php
            $currentPageComponent = $page['component'] ?? null;
            $landingNavbarPages = [
                'HomePage',
                'AboutPage',
                'NewsPage',
                'News/Show',
                'FacilityPage',
                'Facilities/Show',
                'Gallery/Index',
                'PricingPage',
                'BookingPage',
                'Branches/Show',
                'Checkout/BookingCheckoutPage',
                'Checkout/BookingSuccessPage',
                'Checkout/MembershipCheckoutPage',
                'Checkout/MembershipSuccessPage',
                'Errors/NotFound',
            ];
            $usesLandingNavbar = in_array(
                $currentPageComponent,
                $landingNavbarPages,
                true,
            );
            $heroImageUrl = $page['props']['heroImageUrl']
                ?? '/assets/hero/Hero.avif?v=missing';
            $faviconPath = public_path('ubsc-tab.svg');
            $faviconVersion = is_file($faviconPath)
                ? substr(sha1_file($faviconPath), 0, 12)
                : 'missing';
        @endphp

        <!-- Fonts -->
        <link rel="icon" type="image/svg+xml" sizes="any" href="/ubsc-tab.svg?v={{ $faviconVersion }}">
        <link rel="manifest" href="/site.webmanifest">
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet" />

        @if ($usesLandingNavbar)
            <link
                rel="preload"
                as="font"
                href="/fonts/ClashDisplay-Medium.otf"
                type="font/otf"
                crossorigin="anonymous"
            >
            <link
                rel="preload"
                as="image"
                href="/assets/brand/ubsc-logo-640.webp"
                type="image/webp"
                fetchpriority="high"
            >
        @endif

        @if ($currentPageComponent === 'HomePage')
            <link
                rel="preload"
                as="image"
                href="/assets/images/ub-sport-enterence.png"
                type="image/png"
                fetchpriority="high"
            >
            <link
                rel="preload"
                as="image"
                href="{{ $heroImageUrl }}"
                type="image/avif"
                fetchpriority="high"
            >
        @endif

        <!-- Scripts -->
        @routes(null, \Illuminate\Support\Facades\Vite::cspNonce())
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/Pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
