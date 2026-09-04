<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Support\ReferenceData\PricingCatalogDefinition;
use Illuminate\Database\Seeder;

class OutdoorFacilitySeeder extends Seeder
{
    public function run(): void
    {
        $categoryId = FacilityCategory::query()
            ->where('slug', 'lapangan-arena')
            ->value('id');

        if (! $categoryId) {
            return;
        }

        foreach (PricingCatalogDefinition::facilities() as $data) {
            if ($data['sort_order'] <= 11) {
                continue;
            }

            $facility = Facility::query()->updateOrCreate(
                ['slug' => $data['slug']],
                [
                    'facility_category_id' => $categoryId,
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

            $metadata = is_array($facility->display_metadata)
                ? $facility->display_metadata
                : [];

            if (! is_string($metadata['public_image_path'] ?? null)
                || trim((string) $metadata['public_image_path']) === '') {
                $metadata['public_image_path'] = $data['image'];
                $facility->update(['display_metadata' => $metadata]);
            }
        }
    }
}
