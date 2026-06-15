<?php

namespace Database\Seeders;

use App\Models\NewsCategory;
use Illuminate\Database\Seeder;

class NewsCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Berita', 'slug' => 'berita'],
            ['name' => 'Artikel', 'slug' => 'artikel'],
        ];

        foreach ($categories as $data) {
            NewsCategory::firstOrCreate(['slug' => $data['slug']], $data);
        }
    }
}
