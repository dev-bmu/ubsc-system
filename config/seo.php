<?php

$canonicalOrigin = env(
    'SEO_CANONICAL_ORIGIN',
    env('GALLERY_CANONICAL_ORIGIN', 'https://ubsportcenter.co.id'),
);

return [
    'canonical_origin' => rtrim((string) $canonicalOrigin, '/'),
    'site_name' => 'UB Sport Center',
    'locale' => 'id_ID',
    'language' => 'id-ID',

    'default_image' => '/assets/social/ub-sport-center-social-card.png',
    'default_image_alt' => 'UB Sport Center di Kota Malang',
    'organization_logo' => '/ubsc-blue.svg',

    'robots' => [
        'index' => 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
        'noindex' => 'noindex, nofollow, noarchive',
    ],

    /*
    |--------------------------------------------------------------------------
    | Explicit public index surface
    |--------------------------------------------------------------------------
    |
    | Search engines should only index deliberate public pages. Authentication,
    | checkout, account, staff, feeds, event collectors, and signed documents
    | remain outside this allowlist even when they answer a GET request.
    |
    */
    'indexable' => [
        'routes' => [
            'home',
            'about',
            'news',
            'news.show',
            'facility',
            'facilities.show',
            'gallery.index',
            'gallery.section',
            'pricing',
            'booking',
            'branches.show',
        ],
        'exact_paths' => [
            '/',
            '/about',
            '/news',
            '/facilities',
            '/facilities/gallery',
            '/pricing',
            '/booking',
        ],
        'path_patterns' => [
            '#^/news/[a-z0-9][a-z0-9-]*$#',
            '#^/facilities/[a-z0-9][a-z0-9-]*$#',
            '#^/facilities/gallery/(?:indoor|eksklusif|outdoor)$#',
            '#^/branches/(?:ubsc-veteran|ubsc-dieng)$#',
        ],
    ],

    'pages' => [
        'home' => [
            'title' => 'UB Sport Center Malang | Gym & Fasilitas Olahraga',
            'description' => 'Temukan gym, lapangan, kelas kebugaran, membership, dan reservasi fasilitas olahraga UB Sport Center di Kota Malang.',
            'image_alt' => 'Fasilitas olahraga UB Sport Center di Kota Malang',
        ],
        'about' => [
            'title' => 'Tentang UB Sport Center | Pusat Olahraga Universitas Brawijaya',
            'description' => 'Kenali UB Sport Center, pusat olahraga milik Universitas Brawijaya yang dikelola oleh PT Brawijaya Multi Usaha di Kota Malang.',
            'image_alt' => 'Kantor dan fasilitas UB Sport Center di Kota Malang',
        ],
        'news' => [
            'title' => 'Berita & Artikel Olahraga | UB Sport Center',
            'description' => 'Baca berita, informasi fasilitas, agenda, dan artikel olahraga terbaru dari UB Sport Center.',
            'image_alt' => 'Berita dan artikel UB Sport Center',
        ],
        'facilities' => [
            'title' => 'Fasilitas Olahraga di Malang | UB Sport Center',
            'description' => 'Jelajahi gym, lapangan, arena indoor dan outdoor, serta kelas kebugaran UB Sport Center di Veteran dan Dieng, Kota Malang.',
            'image_alt' => 'Fasilitas olahraga UB Sport Center',
        ],
        'gallery' => [
            'title' => 'Galeri Fasilitas | UB Sport Center',
            'description' => 'Lihat galeri arena indoor, arena outdoor, dan fasilitas olahraga UB Sport Center di Kota Malang.',
            'image_alt' => 'Galeri fasilitas UB Sport Center',
        ],
        'pricing' => [
            'title' => 'Membership Gym & Harga | UB Sport Center',
            'description' => 'Lihat pilihan membership gym UB Sport Center, fasilitas paket, masa aktif, dan informasi pendaftaran.',
            'image_alt' => 'Membership gym UB Sport Center',
        ],
        'booking' => [
            'title' => 'Booking Fasilitas Olahraga | UB Sport Center',
            'description' => 'Periksa jadwal dan reservasi fasilitas olahraga UB Sport Center secara online.',
            'image_alt' => 'Reservasi fasilitas olahraga UB Sport Center',
        ],
        'article' => [
            'title' => 'Berita & Artikel | UB Sport Center',
            'description' => 'Informasi dan artikel olahraga dari UB Sport Center.',
            'image_alt' => 'Berita UB Sport Center',
        ],
        'facility' => [
            'title' => 'Fasilitas Olahraga | UB Sport Center',
            'description' => 'Informasi fasilitas olahraga dan layanan reservasi UB Sport Center di Kota Malang.',
            'image_alt' => 'Fasilitas UB Sport Center',
        ],
        'branch' => [
            'title' => 'Lokasi UB Sport Center di Malang',
            'description' => 'Informasi lokasi, fasilitas, jam operasional, dan akses cabang UB Sport Center di Kota Malang.',
            'image_alt' => 'Lokasi UB Sport Center di Kota Malang',
        ],
    ],
];
