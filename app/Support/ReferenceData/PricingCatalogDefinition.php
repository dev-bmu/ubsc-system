<?php

namespace App\Support\ReferenceData;

use JsonException;

final class PricingCatalogDefinition
{
    public const VERSION = '2026-09-04.1';

    public const SETTING_KEY = 'reference_data.pricing_catalog';

    /**
     * @return array<int, array{name: string, slug: string, description: string, sort_order: int}>
     */
    public static function categories(): array
    {
        return [
            [
                'name' => 'Lapangan & Arena',
                'slug' => 'lapangan-arena',
                'description' => 'Fasilitas lapangan olahraga dan arena pertandingan.',
                'sort_order' => 1,
            ],
            [
                'name' => 'Kelas & Kebugaran',
                'slug' => 'kelas-kebugaran',
                'description' => 'Kelas kebugaran dan olahraga terstruktur.',
                'sort_order' => 2,
            ],
        ];
    }

    /**
     * @return array<int, array{
     *     category: string,
     *     name: string,
     *     slug: string,
     *     description: string,
     *     location: string,
     *     venue_type: string,
     *     class_code: string,
     *     image: string,
     *     reservation_method: string,
     *     is_active: bool,
     *     sort_order: int,
     *     presentation: string
     * }>
     */
    public static function facilities(): array
    {
        return [
            self::facility('lapangan-arena', 'Lapangan Tenis', 'lapangan-tenis', 'Tertutup 001', 'Indoor Facility', 'Veteran', 'fasilitas-tenis-ub-sport-center.avif', 1, 'website', 'indoor'),
            self::facility('lapangan-arena', 'Lapangan Badminton', 'lapangan-badminton', 'Tertutup 002', 'Indoor Facility', 'Veteran', 'fasilitas-bulutangkis-ub-sport-center.avif', 2, 'website', 'indoor'),
            self::facility('lapangan-arena', 'Lapangan Tenis Meja', 'lapangan-tenis-meja', 'Tertutup 003', 'Indoor Facility', 'Veteran', 'fasilitas-tennis-meja-ub-sport-center.avif', 3, 'website', 'indoor'),
            self::facility('lapangan-arena', 'Lapangan Futsal Veteran', 'lapangan-futsal-veteran', 'Tertutup 004', 'Indoor Facility', 'Veteran', 'fasilitas-futsal-ub-sport-center.avif', 4, 'website', 'indoor'),
            self::facility('lapangan-arena', 'Ruang Beladiri', 'ruang-beladiri', 'Tertutup 005', 'Indoor Facility', 'Veteran', 'fasilitas-beladiri-ub-sport-center.avif', 5, 'whatsapp', 'indoor'),
            self::facility('kelas-kebugaran', 'Yoga', 'yoga', 'Class 001', 'Indoor Facility', 'Veteran', 'fasilitas-yoga-ub-sport-center.avif', 6, 'whatsapp', 'class'),
            self::facility('kelas-kebugaran', 'Zumba', 'zumba', 'Class 002', 'Indoor Facility', 'Veteran', 'fasilitas-zumba-ub-sport-center.avif', 7, 'whatsapp', 'class'),
            self::facility('kelas-kebugaran', 'Aerobik', 'aerobik', 'Class 003', 'Indoor Facility', 'Veteran', 'fasilitas-aerobik-ub-sport-center.avif', 8, 'whatsapp', 'class'),
            self::facility('kelas-kebugaran', 'BMU Karate', 'bmu-karate', 'Class 004', 'Indoor Facility', 'Veteran', 'fasilitas-beladiri-ub-sport-center.avif', 9, 'whatsapp', 'class'),
            self::facility('kelas-kebugaran', 'Zona Akurasi', 'zona-akurasi', 'Class 005', 'Indoor Facility', 'Veteran', 'fasilitas-zona-akurasi-ub-sport-center.avif', 10, 'whatsapp', 'class'),
            self::facility('kelas-kebugaran', 'Pilates', 'pilates', 'Class 006', 'Indoor Facility', 'Veteran', 'comingsoon.avif', 11, 'whatsapp', 'class', false),
            self::facility('lapangan-arena', 'Lapangan Sepak Bola', 'lapangan-sepak-bola', 'Terbuka 001', 'Arena Luar', 'Dieng', 'fasilitas-sepak-bola-ub-sport-center.avif', 12, 'whatsapp', 'football'),
            self::facility('lapangan-arena', 'Lapangan Basket', 'lapangan-basket', 'Terbuka 002', 'Arena Luar', 'Dieng', 'fasilitas-basket-akurasi-ub-sport-center.avif', 13, 'whatsapp', 'basketball'),
            self::facility('lapangan-arena', 'Lapangan Volly', 'lapangan-volly', 'Terbuka 003', 'Arena Luar', 'Dieng', 'fasilitas-voli-ub-sport-center.avif', 14, 'whatsapp', 'volleyball'),
            self::facility('lapangan-arena', 'Lapangan Futsal Dieng', 'lapangan-futsal-dieng', 'Terbuka 004', 'Arena Luar', 'Dieng', 'fasilitas-futsal-dieng-ub-sport-center.avif', 15, 'whatsapp', 'futsal-outdoor'),
        ];
    }

    /**
     * @return array<string, array<string, int>>
     */
    public static function facilityPrices(): array
    {
        return [
            'lapangan-tenis' => ['warga_ub' => 105000, 'umum' => 115000],
            'lapangan-badminton' => ['warga_ub' => 50000, 'umum' => 65000],
            'lapangan-tenis-meja' => ['warga_ub' => 50000, 'umum' => 55000],
            'lapangan-futsal-veteran' => ['warga_ub' => 45000, 'umum' => 50000],
            'ruang-beladiri' => ['warga_ub' => 75000, 'umum' => 100000],
            'yoga' => ['warga_ub' => 25000, 'umum' => 35000],
            'aerobik' => ['warga_ub' => 23000, 'umum' => 28000],
            'zumba' => ['warga_ub' => 28000, 'umum' => 33000],
            'bmu-karate' => ['warga_ub' => 100000, 'umum' => 175000],
        ];
    }

    /**
     * @return array<int, array{
     *     key: string,
     *     tier: string,
     *     label: string,
     *     sort_order: int,
     *     name: string,
     *     description: string,
     *     savings_label: string,
     *     cta_label: string,
     *     card_image_url: string,
     *     price: int,
     *     compare_at_price: int,
     *     duration_months: int,
     *     features: array<int, string>,
     *     is_active: bool
     * }>
     */
    public static function membershipPlans(): array
    {
        $base = [
            'name' => 'Latihan Konsisten & Fleksibel',
            'description' => 'Membership bulanan untuk akses latihan fleksibel dengan fasilitas modern UB Sport Center.',
            'savings_label' => 'Hemat 20%',
            'cta_label' => 'Mulai Membership',
            'card_image_url' => '/assets/images/poster-gym-konten-program-ub-sport-center.avif',
            'price' => 150000,
            'compare_at_price' => 187500,
            'duration_months' => 1,
            'features' => [
                'Akses Gym 24 Jam',
                'Fasilitas Lengkap',
                'Jadwal Fleksibel',
                '1 Lokasi Aktif',
            ],
            'is_active' => true,
        ];

        return array_map(static fn (array $plan): array => [
            ...$base,
            ...$plan,
        ], [
            ['key' => 'ubsc-membership-hemat-v1', 'tier' => 'hemat', 'label' => 'Hemat', 'sort_order' => 1],
            ['key' => 'ubsc-membership-favorit-v1', 'tier' => 'favorit', 'label' => 'Favorit', 'sort_order' => 2],
            ['key' => 'ubsc-membership-performa-v1', 'tier' => 'performa', 'label' => 'Performa', 'sort_order' => 3],
            ['key' => 'ubsc-membership-eksklusif-v1', 'tier' => 'eksklusif', 'label' => 'Eksklusif', 'sort_order' => 4],
        ]);
    }

    /**
     * @return array{indoorPeriods: array<int, mixed>, classRates: array<int, mixed>, classRentals: array<int, mixed>, outdoorRates: array<int, mixed>}
     */
    public static function presentation(string $type): array
    {
        $empty = [
            'indoorPeriods' => [],
            'classRates' => [],
            'classRentals' => [],
            'outdoorRates' => [],
        ];

        return match ($type) {
            'indoor' => array_replace($empty, [
                'indoorPeriods' => [
                    ['label' => 'Pagi / 06.00–12.00', 'wargaPrice' => '95K / Jam', 'umumPrice' => '105K / Jam'],
                    ['label' => 'Malam / 16.00–22.00', 'wargaPrice' => '105K / Jam', 'umumPrice' => '115K / Jam'],
                    ['label' => 'Sabtu–Minggu Malam / 18.00–22.00', 'wargaPrice' => '50K / Jam', 'umumPrice' => '65K / Jam'],
                ],
            ]),
            'class' => array_replace($empty, [
                'classRates' => [
                    ['level' => 'Beginner', 'wargaPrice' => '25K', 'umumPrice' => '23K'],
                    ['level' => 'Intermediate', 'wargaPrice' => '', 'umumPrice' => '35K'],
                ],
                'classRentals' => [
                    ['label' => 'Sewa Ruang Yoga', 'value' => 'Warga UB 100K · Umum 150K'],
                    ['label' => 'Sewa Event Ruang', 'value' => '1650K / Hari · Matras Kami Fasilitasi'],
                ],
            ]),
            'football' => array_replace($empty, ['outdoorRates' => [
                ['label' => 'Harga Sewa', 'value' => '1750K / 2 Jam'],
                ['label' => 'Extension', 'value' => '875K / Jam'],
            ]]),
            'basketball' => array_replace($empty, ['outdoorRates' => [
                ['label' => 'Harga Sewa', 'value' => '1200K / 2 Jam'],
                ['label' => 'Extension', 'value' => '600K / Jam'],
            ]]),
            'volleyball' => array_replace($empty, ['outdoorRates' => [
                ['label' => 'Harga Sewa', 'value' => '1000K / 2 Jam'],
                ['label' => 'Extension', 'value' => '500K / Jam'],
            ]]),
            'futsal-outdoor' => array_replace($empty, ['outdoorRates' => [
                ['label' => 'Harga Sewa', 'value' => '1500K / 2 Jam'],
                ['label' => 'Extension', 'value' => '750K / Jam'],
            ]]),
            default => $empty,
        };
    }

    /**
     * @return array<int, array{key: string, value: string}>
     */
    public static function indoorAdditionalDetails(): array
    {
        return [
            ['key' => 'Sewa Event', 'value' => '8500K / Hari'],
            ['key' => 'Sewa Raket', 'value' => '10K / Max. 2 Jam'],
            ['key' => 'Sewa Event Non Sport', 'value' => '25000K / Hari'],
        ];
    }

    /**
     * @throws JsonException
     */
    public static function checksum(): string
    {
        $facilities = array_map(
            static fn (array $facility): array => [
                ...$facility,
                'pricing_presentation' => self::presentation($facility['presentation']),
            ],
            self::facilities(),
        );

        return hash('sha256', json_encode([
            'version' => self::VERSION,
            'categories' => self::categories(),
            'facilities' => $facilities,
            'facility_prices' => self::facilityPrices(),
            'membership_plans' => self::membershipPlans(),
            'indoor_additional_details' => self::indoorAdditionalDetails(),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /**
     * @return array{
     *     category: string,
     *     name: string,
     *     slug: string,
     *     description: string,
     *     location: string,
     *     venue_type: string,
     *     class_code: string,
     *     image: string,
     *     reservation_method: string,
     *     is_active: bool,
     *     sort_order: int,
     *     presentation: string
     * }
     */
    private static function facility(
        string $category,
        string $name,
        string $slug,
        string $classCode,
        string $venueType,
        string $location,
        string $image,
        int $sortOrder,
        string $reservationMethod,
        string $presentation,
        bool $isActive = true,
    ): array {
        return [
            'category' => $category,
            'name' => $name,
            'slug' => $slug,
            'description' => str_starts_with($presentation, 'futsal')
                || in_array($presentation, ['football', 'basketball', 'volleyball'], true)
                    ? "Fasilitas {$name} UB Sport Center Dieng."
                    : (str_starts_with($classCode, 'Class')
                        ? "Kelas {$name} UB Sport Center."
                        : "Fasilitas {$name} UB Sport Center."),
            'location' => $location,
            'venue_type' => $venueType,
            'class_code' => $classCode,
            'image' => '/assets/images/'.$image,
            'reservation_method' => $reservationMethod,
            'is_active' => $isActive,
            'sort_order' => $sortOrder,
            'presentation' => $presentation,
        ];
    }
}
