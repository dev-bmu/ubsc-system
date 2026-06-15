<?php

namespace Database\Seeders;

use App\Models\PromoCarousel;
use Illuminate\Database\Seeder;

class PromoCarouselSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            ['title' => 'Gym Training Area',    'file' => 'poster-gym-konten-program-ub-sport-center.avif',      'sort_order' => 1],
            ['title' => 'Football Training',    'file' => 'poster-sepakbola-konten-program-ub-sport-center.avif', 'sort_order' => 2],
            ['title' => 'Basketball Court',     'file' => 'poster-basket-konten-program-ub-sport-center.avif',   'sort_order' => 3],
            ['title' => 'Group Fitness Class',  'file' => 'poster-mahal-konten-program-ub-sport-center.avif',    'sort_order' => 4],
        ];

        foreach ($items as $data) {
            $promo = PromoCarousel::firstOrCreate(
                ['title' => $data['title']],
                ['is_active' => true, 'sort_order' => $data['sort_order']]
            );

            if ($promo->getMedia('slide')->isEmpty()) {
                $path = public_path('assets/images/' . $data['file']);
                if (file_exists($path)) {
                    $promo->addMedia($path)->preservingOriginal()->toMediaCollection('slide');
                }
            }
        }
    }
}
