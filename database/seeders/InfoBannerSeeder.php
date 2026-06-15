<?php

namespace Database\Seeders;

use App\Models\InfoBanner;
use Illuminate\Database\Seeder;

class InfoBannerSeeder extends Seeder
{
    public function run(): void
    {
        if (InfoBanner::count() > 0) {
            return;
        }

        $items = [
            ['message' => 'Jadwal Zumba 10.00-12.00 ✦ Jadwal Aerobik Saat ini Sedang Tutup', 'sort_order' => 1],
            ['message' => 'Dapatkan Diskon 20% untuk Pendaftaran Member Tahunan Bulan Ini',   'sort_order' => 2],
            ['message' => 'UB Sport Center Buka Setiap Hari: 06.00 - 21.00 WIB',             'sort_order' => 3],
        ];

        foreach ($items as $item) {
            InfoBanner::create([...$item, 'is_active' => true]);
        }
    }
}
