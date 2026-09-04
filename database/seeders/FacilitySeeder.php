<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Database\Seeder;

class FacilitySeeder extends Seeder
{
    public function run(): void
    {
        $categoryIds = FacilityCategory::query()
            ->whereIn('slug', collect(PricingCatalogDefinition::categories())->pluck('slug'))
            ->pluck('id', 'slug');

        foreach (PricingCatalogDefinition::facilities() as $data) {
            if ($data['sort_order'] > 11) {
                continue;
            }

            $facility = Facility::updateOrCreate(
                ['slug' => $data['slug']],
                [
                    'facility_category_id' => $categoryIds->get($data['category']),
                    'name' => $data['name'],
                    'description' => $data['description'],
                    'location' => $data['location'],
                    'venue_type' => $data['venue_type'],
                    'class_code' => $data['class_code'],
                    'rating' => 5.0,
                    'is_active' => $data['is_active'],
                    'sort_order' => $data['sort_order'],
                ],
            );

            if ($facility->wasRecentlyCreated || $facility->reservation_method === 'auto') {
                $facility->update([
                    'reservation_method' => $data['reservation_method'],
                ]);
            }

            if ($facility->getMedia('hero')->isEmpty()) {
                $path = public_path(ltrim($data['image'], '/'));

                if (is_file($path)) {
                    $facility
                        ->addMedia($path)
                        ->preservingOriginal()
                        ->toMediaCollection('hero');
                }
            }
        }
    }
}
