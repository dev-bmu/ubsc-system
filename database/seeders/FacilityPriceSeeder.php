<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Models\FacilityPrice;
use Illuminate\Database\Seeder;

class FacilityPriceSeeder extends Seeder
{
    public function run(): void
    {
        // [slug => [warga_kampus_price, umum_price]] — parsed from DUMMY_PRICES in SectionSix.tsx
        $prices = [
            'lapangan-tenis'         => [105000, 115000],
            'lapangan-badminton'     => [50000,  65000],
            'lapangan-tenis-meja'    => [50000,  55000],
            'lapangan-futsal-veteran'=> [45000,  50000],
            'ruang-beladiri'         => [75000,  100000],
            'yoga'                   => [25000,  35000],
            'aerobik'                => [23000,  28000],
            'zumba'                  => [28000,  33000],
            'bmu-karate'             => [100000, 175000],
            // Zona Akurasi and Pilates have no price → skipped
        ];

        foreach ($prices as $slug => [$wargaPrice, $umumPrice]) {
            $facility = Facility::where('slug', $slug)->first();
            if (! $facility) {
                continue;
            }

            FacilityPrice::firstOrCreate(
                ['facility_id' => $facility->id, 'user_category' => 'warga_ub'],
                ['label' => 'Per Jam', 'price' => $wargaPrice, 'duration_minutes' => 60, 'notes' => 'Harga khusus warga UB', 'sort_order' => 1]
            );

            FacilityPrice::firstOrCreate(
                ['facility_id' => $facility->id, 'user_category' => 'umum'],
                ['label' => 'Per Jam', 'price' => $umumPrice, 'duration_minutes' => 60, 'notes' => null, 'sort_order' => 2]
            );
        }
    }
}
