<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Models\FacilityCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class OutdoorFacilitySeeder extends Seeder
{
    public function run(): void
    {
        $arenaCategory = FacilityCategory::query()
            ->where('slug', 'lapangan-arena')
            ->firstOrFail();

        $facilities = [
            [
                'name' => 'Lapangan Sepak Bola',
                'class_code' => 'Terbuka 001',
                'image' => 'fasilitas-sepak-bola-ub-sport-center.avif',
                'sort_order' => 12,
            ],
            [
                'name' => 'Lapangan Basket',
                'class_code' => 'Terbuka 002',
                'image' => 'fasilitas-basket-akurasi-ub-sport-center.avif',
                'sort_order' => 13,
            ],
            [
                'name' => 'Lapangan Volly',
                'class_code' => 'Terbuka 003',
                'image' => 'fasilitas-voli-ub-sport-center.avif',
                'sort_order' => 14,
            ],
            [
                'name' => 'Lapangan Futsal Dieng',
                'class_code' => 'Terbuka 004',
                'image' => 'fasilitas-futsal-dieng-ub-sport-center.avif',
                'sort_order' => 15,
            ],
        ];

        foreach ($facilities as $data) {
            $facility = Facility::query()->updateOrCreate(
                ['slug' => Str::slug($data['name'])],
                [
                    'facility_category_id' => $arenaCategory->id,
                    'name' => $data['name'],
                    'description' => "Fasilitas {$data['name']} UB Sport Center Dieng.",
                    'location' => 'Dieng',
                    'venue_type' => 'Arena Luar',
                    'class_code' => $data['class_code'],
                    'rating' => 5.0,
                    'is_active' => true,
                    'sort_order' => $data['sort_order'],
                ],
            );
            if (
                $facility->wasRecentlyCreated
                || $facility->reservation_method === 'auto'
            ) {
                $facility->update([
                    'reservation_method' => 'whatsapp',
                ]);
            }

            $metadata = is_array($facility->display_metadata)
                ? $facility->display_metadata
                : [];

            if (empty($metadata['public_image_path'])) {
                $metadata['public_image_path'] = '/assets/images/'.$data['image'];
                $facility->update(['display_metadata' => $metadata]);
            }
        }
    }
}
