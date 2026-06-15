<?php

namespace Database\Seeders;

use App\Models\FacilityCategory;
use Illuminate\Database\Seeder;

class FacilityCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Lapangan & Arena', 'slug' => 'lapangan-arena', 'description' => 'Fasilitas lapangan olahraga dan arena pertandingan.', 'sort_order' => 1],
            ['name' => 'Kelas & Kebugaran', 'slug' => 'kelas-kebugaran', 'description' => 'Kelas kebugaran dan olahraga terstruktur.', 'sort_order' => 2],
        ];

        foreach ($categories as $data) {
            FacilityCategory::firstOrCreate(['slug' => $data['slug']], $data);
        }
    }
}
