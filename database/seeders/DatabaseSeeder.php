<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            RoleAndPermissionSeeder::class,
            AdminUserSeeder::class,
            // CMS content — must run before BookingSeeder (which needs Facility)
            FacilityCategorySeeder::class,
            FacilitySeeder::class,
            FacilityPriceSeeder::class,
            NewsCategorySeeder::class,
            NewsSeeder::class,
            PromoCarouselSeeder::class,
            SponsorLogoSeeder::class,
            ReelSeeder::class,
            InfoBannerSeeder::class,
            TestimonialSeeder::class,
            ReviewSeeder::class,
            BookingSeeder::class,
        ]);
    }
}
