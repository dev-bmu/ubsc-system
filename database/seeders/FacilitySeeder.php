<?php

namespace Database\Seeders;

use App\Models\Facility;
use App\Models\FacilityCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class FacilitySeeder extends Seeder
{
    public function run(): void
    {
        $arenaCategory   = FacilityCategory::where('slug', 'lapangan-arena')->first();
        $fitnessCategory = FacilityCategory::where('slug', 'kelas-kebugaran')->first();

        $arenas = [
            ['name' => 'Lapangan Tenis',         'class_code' => 'Tertutup 001', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-tenis-ub-sport-center.avif',        'sort_order' => 1],
            ['name' => 'Lapangan Badminton',      'class_code' => 'Tertutup 002', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-bulutangkis-ub-sport-center.avif',  'sort_order' => 2],
            ['name' => 'Lapangan Tenis Meja',     'class_code' => 'Tertutup 003', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-tennis-meja-ub-sport-center.avif',  'sort_order' => 3],
            ['name' => 'Lapangan Futsal Veteran', 'class_code' => 'Tertutup 004', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-futsal-dieng-ub-sport-center.avif', 'sort_order' => 4],
            ['name' => 'Ruang Beladiri',          'class_code' => 'Tertutup 005', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-beladiri-ub-sport-center.avif',     'sort_order' => 5],
        ];

        $fitnessClasses = [
            ['name' => 'Yoga',         'class_code' => 'Class 001', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-yoga-ub-sport-center.avif',        'sort_order' => 6,  'is_active' => true],
            ['name' => 'Zumba',        'class_code' => 'Class 002', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-zumba-ub-sport-center.avif',        'sort_order' => 7,  'is_active' => true],
            ['name' => 'Aerobik',      'class_code' => 'Class 003', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-aerobik-ub-sport-center.avif',      'sort_order' => 8,  'is_active' => true],
            ['name' => 'BMU Karate',   'class_code' => 'Class 004', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-beladiri-ub-sport-center.avif',     'sort_order' => 9,  'is_active' => true],
            ['name' => 'Zona Akurasi', 'class_code' => 'Class 005', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'fasilitas-zona-akurasi-ub-sport-center.avif', 'sort_order' => 10, 'is_active' => true],
            ['name' => 'Pilates',      'class_code' => 'Class 006', 'venue_type' => 'Indoor Facility', 'location' => 'Veteran', 'image' => 'comingsoon.avif',                             'sort_order' => 11, 'is_active' => false],
        ];

        foreach ($arenas as $data) {
            $facility = Facility::updateOrCreate(
                ['slug' => Str::slug($data['name'])],
                [
                    'facility_category_id' => $arenaCategory?->id,
                    'name'                 => $data['name'],
                    'description'          => 'Fasilitas ' . $data['name'] . ' UB Sport Center.',
                    'location'             => $data['location'],
                    'venue_type'           => $data['venue_type'],
                    'class_code'           => $data['class_code'],
                    'rating'               => 5.0,
                    'is_active'            => true,
                    'sort_order'           => $data['sort_order'],
                ]
            );

            if ($facility->getMedia('hero')->isEmpty()) {
                $path = public_path('assets/images/' . $data['image']);
                if (file_exists($path)) {
                    $facility->addMedia($path)->preservingOriginal()->toMediaCollection('hero');
                }
            }
        }

        foreach ($fitnessClasses as $data) {
            $facility = Facility::updateOrCreate(
                ['slug' => Str::slug($data['name'])],
                [
                    'facility_category_id' => $fitnessCategory?->id,
                    'name'                 => $data['name'],
                    'description'          => 'Kelas ' . $data['name'] . ' UB Sport Center.',
                    'location'             => $data['location'],
                    'venue_type'           => $data['venue_type'],
                    'class_code'           => $data['class_code'],
                    'rating'               => 5.0,
                    'is_active'            => $data['is_active'],
                    'sort_order'           => $data['sort_order'],
                ]
            );

            if ($facility->getMedia('hero')->isEmpty()) {
                $path = public_path('assets/images/' . $data['image']);
                if (file_exists($path)) {
                    $facility->addMedia($path)->preservingOriginal()->toMediaCollection('hero');
                }
            }
        }
    }
}
