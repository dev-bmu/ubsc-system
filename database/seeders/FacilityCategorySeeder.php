<?php

namespace Database\Seeders;

use App\Models\FacilityCategory;
use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Database\Seeder;

class FacilityCategorySeeder extends Seeder
{
    public function run(): void
    {
        foreach (PricingCatalogDefinition::categories() as $data) {
            FacilityCategory::firstOrCreate(['slug' => $data['slug']], $data);
        }
    }
}
