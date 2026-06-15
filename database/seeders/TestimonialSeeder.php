<?php

namespace Database\Seeders;

use App\Models\Testimonial;
use Illuminate\Database\Seeder;

class TestimonialSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            [
                'author_name' => 'UB Football Club',
                'author_role' => 'Klub Sepak Bola',
                'quote'       => 'Fasilitas lapangan futsal di UB Sport Center sangat terawat dan nyaman. Kami rutin mengadakan latihan di sini setiap minggunya.',
                'sort_order'  => 1,
                'image'       => resource_path('assets/icons/testimonial-ub-sport-center.avif'),
            ],
            [
                'author_name' => 'Malang Tennis Academy',
                'author_role' => 'Akademi Tenis',
                'quote'       => 'Malang Tenis Academy mengapresiasi kualitas lapangan tenis UB Sport Center. Pencahayaan dan kondisi lapangan sangat mendukung sesi latihan intensif.',
                'sort_order'  => 2,
                'image'       => resource_path('assets/icons/ulasan-malang-tennis-academy-ubsc.avif'),
            ],
            [
                'author_name' => 'Brawijaya Badminton Club',
                'author_role' => 'Komunitas Olahraga',
                'quote'       => 'Pelayanan staf yang ramah dan fasilitas ganti yang bersih membuat pengalaman olahraga kami semakin menyenangkan.',
                'sort_order'  => 3,
                'image'       => resource_path('assets/icons/testimonial-ub-sport-center.avif'),
            ],
        ];

        foreach ($items as $data) {
            $image = $data['image'];
            unset($data['image']);

            $testimonial = Testimonial::firstOrCreate(
                ['author_name' => $data['author_name']],
                array_merge($data, ['is_active' => true]),
            );

            if (! $testimonial->hasMedia('image') && file_exists($image)) {
                $testimonial
                    ->addMedia($image)
                    ->preservingOriginal()
                    ->toMediaCollection('image');
            }
        }
    }
}
