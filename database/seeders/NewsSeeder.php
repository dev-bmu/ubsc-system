<?php

namespace Database\Seeders;

use App\Models\News;
use App\Models\NewsCategory;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class NewsSeeder extends Seeder
{
    public function run(): void
    {
        $admin    = User::where('email', 'admin@ubsc.id')->first();
        $berita   = NewsCategory::where('slug', 'berita')->first();
        $artikel  = NewsCategory::where('slug', 'artikel')->first();

        $items = [
            ['title' => 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir',   'category' => $berita,  'date' => '2026-02-26'],
            ['title' => 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir',   'category' => $artikel, 'date' => '2026-02-26'],
            ['title' => 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir',   'category' => $berita,  'date' => '2026-02-24'],
            ['title' => 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir',   'category' => $artikel, 'date' => '2026-02-22'],
            ['title' => 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir',   'category' => $berita,  'date' => '2026-02-20'],
            ['title' => 'Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir',   'category' => $artikel, 'date' => '2026-02-18'],
            ['title' => 'Raih Performa Terbaik Dengan Paket Fasilitas Unggulan',            'category' => $berita,  'date' => '2026-02-15'],
        ];

        foreach ($items as $index => $data) {
            // Disambiguate slug with index to handle duplicate titles
            $slug = Str::slug($data['title']) . '-' . ($index + 1);

            $news = News::firstOrCreate(
                ['slug' => $slug],
                [
                    'news_category_id' => $data['category']?->id,
                    'author_id'        => $admin?->id,
                    'title'            => $data['title'],
                    'excerpt'          => $data['title'],
                    'content'          => '<p>' . $data['title'] . '</p>',
                    'status'           => 'published',
                    'published_at'     => $data['date'],
                ]
            );

            if ($news->getMedia('thumbnail')->isEmpty()) {
                $path = public_path('assets/images/comingsoon.avif');
                if (file_exists($path)) {
                    $news->addMedia($path)->preservingOriginal()->toMediaCollection('thumbnail');
                }
            }
        }
    }
}
