<?php

namespace Database\Seeders;

use App\Models\Review;
use Illuminate\Database\Seeder;

class ReviewSeeder extends Seeder
{
    public function run(): void
    {
        $items = [
            [
                'reviewer_name' => 'Ahmad Farid',
                'rating'        => 5,
                'text'          => 'Lapangan futsal sangat bersih dan terawat. Harga juga terjangkau. Pasti akan kembali lagi!',
                'is_approved'   => true,
            ],
            [
                'reviewer_name' => 'Siti Rahayu',
                'rating'        => 4,
                'text'          => 'Pelayanan ramah dan proses booking mudah. Fasilitas loker perlu sedikit peningkatan.',
                'is_approved'   => false,
            ],
            [
                'reviewer_name' => 'Budi Santoso',
                'rating'        => 5,
                'text'          => 'Kelas yoga di sini instrukturnya profesional dan suasananya kondusif. Sangat direkomendasikan!',
                'is_approved'   => true,
            ],
        ];

        foreach ($items as $data) {
            Review::firstOrCreate(
                ['reviewer_name' => $data['reviewer_name']],
                $data,
            );
        }
    }
}
