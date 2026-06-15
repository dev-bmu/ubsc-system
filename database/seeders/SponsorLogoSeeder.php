<?php

namespace Database\Seeders;

use App\Models\SponsorLogo;
use Illuminate\Database\Seeder;

class SponsorLogoSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            ['name' => 'B1',        'file' => 'B1.png',        'sort_order' => 1],
            ['name' => 'Mo-Fruits', 'file' => 'Mo-Fruits.png', 'sort_order' => 2],
            ['name' => 'ExtraJoss', 'file' => 'ExtraJoss.png', 'sort_order' => 3],
            ['name' => 'AYO',       'file' => 'AYO.png',       'sort_order' => 4],
            ['name' => 'SC-Mart',   'file' => 'SC-Mart.png',   'sort_order' => 5],
        ];

        foreach ($items as $data) {
            $sponsor = SponsorLogo::firstOrCreate(
                ['name' => $data['name']],
                ['is_active' => true, 'sort_order' => $data['sort_order']]
            );

            if ($sponsor->getMedia('logo')->isEmpty()) {
                $path = public_path('assets/icons/' . $data['file']);
                if (file_exists($path)) {
                    $sponsor->addMedia($path)->preservingOriginal()->toMediaCollection('logo');
                }
            }
        }
    }
}
