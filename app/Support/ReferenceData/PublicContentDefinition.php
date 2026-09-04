<?php

namespace App\Support\ReferenceData;

use JsonException;

final class PublicContentDefinition
{
    public const VERSION = '2026-09-04.1';

    public const SETTING_KEY = 'reference_data.public_content';

    /** @return array<int, array{key: string, name: string, slug: string}> */
    public static function newsCategories(): array
    {
        return [
            ['key' => 'news-category-news-v1', 'name' => 'Berita', 'slug' => 'berita'],
            ['key' => 'news-category-article-v1', 'name' => 'Artikel', 'slug' => 'artikel'],
        ];
    }

    /**
     * @return array<int, array{
     *     key: string,
     *     category: string,
     *     title: string,
     *     slug: string,
     *     excerpt: string,
     *     content: string,
     *     status: string,
     *     published_at: string,
     *     fallback_image_path: string
     * }>
     */
    public static function news(): array
    {
        $placeholder = 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir';

        return [
            self::newsItem('news-placeholder-1-v1', 'berita', $placeholder, 'dalam-pengembangan-fitur-artikel-dan-berita-akan-segera-hadir-1', '2026-02-26'),
            self::newsItem('news-placeholder-2-v1', 'artikel', $placeholder, 'dalam-pengembangan-fitur-artikel-dan-berita-akan-segera-hadir-2', '2026-02-26'),
            self::newsItem('news-placeholder-3-v1', 'berita', $placeholder, 'dalam-pengembangan-fitur-artikel-dan-berita-akan-segera-hadir-3', '2026-02-24'),
            self::newsItem('news-placeholder-4-v1', 'artikel', $placeholder, 'dalam-pengembangan-fitur-artikel-dan-berita-akan-segera-hadir-4', '2026-02-22'),
            self::newsItem('news-placeholder-5-v1', 'berita', $placeholder, 'dalam-pengembangan-fitur-artikel-dan-berita-akan-segera-hadir-5', '2026-02-20'),
            self::newsItem('news-placeholder-6-v1', 'artikel', $placeholder, 'dalam-pengembangan-fitur-artikel-dan-berita-akan-segera-hadir-6', '2026-02-18'),
            self::newsItem(
                'news-performance-package-v1',
                'berita',
                'Raih Performa Terbaik Dengan Paket Fasilitas Unggulan',
                'raih-performa-terbaik-dengan-paket-fasilitas-unggulan-7',
                '2026-02-15',
            ),
        ];
    }

    /** @return array<int, array{key: string, title: string, fallback_asset_path: string, is_active: bool, sort_order: int}> */
    public static function promos(): array
    {
        return [
            ['key' => 'homepage-promo-gym-v1', 'title' => 'Gym Training Area', 'fallback_asset_path' => '/assets/images/poster-gym-konten-program-ub-sport-center.avif', 'is_active' => true, 'sort_order' => 1],
            ['key' => 'homepage-promo-football-v1', 'title' => 'Football Training', 'fallback_asset_path' => '/assets/images/poster-sepakbola-konten-program-ub-sport-center.avif', 'is_active' => true, 'sort_order' => 2],
            ['key' => 'homepage-promo-basketball-v1', 'title' => 'Basketball Court', 'fallback_asset_path' => '/assets/images/poster-basket-konten-program-ub-sport-center.avif', 'is_active' => true, 'sort_order' => 3],
            ['key' => 'homepage-promo-fitness-v1', 'title' => 'Group Fitness Class', 'fallback_asset_path' => '/assets/images/poster-mahal-konten-program-ub-sport-center.avif', 'is_active' => true, 'sort_order' => 4],
        ];
    }

    /** @return array<int, array{key: string, name: string, fallback_asset_path: string, is_active: bool, sort_order: int}> */
    public static function sponsors(): array
    {
        return [
            ['key' => 'homepage-sponsor-b1-v1', 'name' => 'B1', 'fallback_asset_path' => '/assets/icons/B1.png', 'is_active' => true, 'sort_order' => 1],
            ['key' => 'homepage-sponsor-mo-fruits-v1', 'name' => 'Mo-Fruits', 'fallback_asset_path' => '/assets/icons/Mo-Fruits.png', 'is_active' => true, 'sort_order' => 2],
            ['key' => 'homepage-sponsor-extra-joss-v1', 'name' => 'ExtraJoss', 'fallback_asset_path' => '/assets/icons/ExtraJoss.png', 'is_active' => true, 'sort_order' => 3],
            ['key' => 'homepage-sponsor-ayo-v1', 'name' => 'AYO', 'fallback_asset_path' => '/assets/icons/AYO.png', 'is_active' => true, 'sort_order' => 4],
            ['key' => 'homepage-sponsor-sc-mart-v1', 'name' => 'SC-Mart', 'fallback_asset_path' => '/assets/icons/SC-Mart.png', 'is_active' => true, 'sort_order' => 5],
        ];
    }

    /** @return array<int, array{key: string, title: string, fallback_thumbnail_path: string, fallback_video_path: string, is_active: bool}> */
    public static function reels(): array
    {
        return array_map(
            static fn (int $number): array => [
                'key' => "homepage-reel-{$number}-v1",
                'title' => 'SPORT CENTER UB.',
                'fallback_thumbnail_path' => "/assets/reels/thumbnail {$number}.png",
                'fallback_video_path' => "/assets/reels/reels ubsc {$number}.mp4",
                'is_active' => true,
            ],
            range(1, 5),
        );
    }

    /** @return array<int, array{key: string, message: string, is_active: bool, sort_order: int}> */
    public static function infoBanners(): array
    {
        return [
            ['key' => 'info-banner-schedule-v1', 'message' => 'Jadwal Zumba 10.00-12.00 ✦ Jadwal Aerobik Saat ini Sedang Tutup', 'is_active' => true, 'sort_order' => 1],
            ['key' => 'info-banner-membership-v1', 'message' => 'Dapatkan Diskon 20% untuk Pendaftaran Member Tahunan Bulan Ini', 'is_active' => true, 'sort_order' => 2],
            ['key' => 'info-banner-hours-v1', 'message' => 'UB Sport Center Buka Setiap Hari: 06.00 - 22.00 WIB', 'is_active' => true, 'sort_order' => 3],
        ];
    }

    /**
     * @return array<int, array{
     *     key: string,
     *     author_name: string,
     *     author_role: string,
     *     quote: string,
     *     fallback_image_path: string,
     *     fallback_logo_path: string|null,
     *     is_active: bool,
     *     sort_order: int
     * }>
     */
    public static function testimonials(): array
    {
        $image = '/assets/icons/testimonial-ub-sport-center.avif';

        return [
            [
                'key' => 'testimonial-ub-football-club-v1',
                'author_name' => 'UB Football Club',
                'author_role' => 'Klub Sepak Bola',
                'quote' => 'Fasilitas lapangan futsal di UB Sport Center sangat terawat dan nyaman. Kami rutin mengadakan latihan di sini setiap minggunya.',
                'fallback_image_path' => $image,
                'fallback_logo_path' => null,
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'key' => 'testimonial-malang-tennis-academy-v1',
                'author_name' => 'Malang Tennis Academy',
                'author_role' => 'Akademi Tenis',
                'quote' => 'Malang Tenis Academy mengapresiasi kualitas lapangan tenis UB Sport Center. Pencahayaan dan kondisi lapangan sangat mendukung sesi latihan intensif.',
                'fallback_image_path' => $image,
                'fallback_logo_path' => '/assets/icons/ulasan-malang-tennis-academy-ubsc.avif',
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'key' => 'testimonial-brawijaya-badminton-club-v1',
                'author_name' => 'Brawijaya Badminton Club',
                'author_role' => 'Komunitas Olahraga',
                'quote' => 'Pelayanan staf yang ramah dan fasilitas ganti yang bersih membuat pengalaman olahraga kami semakin menyenangkan.',
                'fallback_image_path' => $image,
                'fallback_logo_path' => null,
                'is_active' => true,
                'sort_order' => 3,
            ],
        ];
    }

    /** @return array<int, string> */
    public static function assetPaths(): array
    {
        return collect(self::promos())
            ->pluck('fallback_asset_path')
            ->merge(collect(self::sponsors())->pluck('fallback_asset_path'))
            ->merge(collect(self::reels())->pluck('fallback_thumbnail_path'))
            ->merge(collect(self::reels())->pluck('fallback_video_path'))
            ->merge(collect(self::news())->pluck('fallback_image_path'))
            ->merge(collect(self::testimonials())->pluck('fallback_image_path'))
            ->merge(collect(self::testimonials())->pluck('fallback_logo_path'))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /** @throws JsonException */
    public static function checksum(): string
    {
        return hash('sha256', json_encode([
            'version' => self::VERSION,
            'news_categories' => self::newsCategories(),
            'news' => self::news(),
            'promos' => self::promos(),
            'sponsors' => self::sponsors(),
            'reels' => self::reels(),
            'info_banners' => self::infoBanners(),
            'testimonials' => self::testimonials(),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /** @return array<string, string> */
    private static function newsItem(
        string $key,
        string $category,
        string $title,
        string $slug,
        string $publishedAt,
    ): array {
        return [
            'key' => $key,
            'category' => $category,
            'title' => $title,
            'slug' => $slug,
            'excerpt' => $title,
            'content' => '<p>'.$title.'</p>',
            'status' => 'published',
            'published_at' => $publishedAt,
            'fallback_image_path' => '/assets/images/comingsoon.avif',
        ];
    }
}
