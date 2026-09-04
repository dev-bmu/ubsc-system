<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Models\FacilityPrice;
use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Database\Seeder;

class FacilityPriceSeeder extends Seeder
{
    public function run(): void
    {
        foreach (PricingCatalogDefinition::facilityPrices() as $slug => $prices) {
            $facility = Facility::where('slug', $slug)->first();

            if (! $facility) {
                continue;
            }

            foreach ($prices as $userCategory => $price) {
                FacilityPrice::firstOrCreate(
                    [
                        'facility_id' => $facility->id,
                        'user_category' => $userCategory,
                    ],
                    [
                        'label' => 'Per Jam',
                        'price' => $price,
                        'duration_minutes' => 60,
                        'notes' => $userCategory === 'warga_ub'
                            ? 'Harga khusus warga UB'
                            : null,
                        'sort_order' => $userCategory === 'warga_ub' ? 1 : 2,
                    ],
                );
            }
        }
    }
}
