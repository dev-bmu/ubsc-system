<?php

namespace Database\Seeders;

use App\Models\Reel;
use Illuminate\Database\Seeder;

class ReelSeeder extends Seeder
{
    public function run(): void
    {
        if (Reel::count() > 0) {
            return;
        }

        $items = [
            ['title' => 'SPORT CENTER UB.', 'thumb' => 'thumbnail 1.png', 'video' => 'reels ubsc 1.mp4'],
            ['title' => 'SPORT CENTER UB.', 'thumb' => 'thumbnail 2.png', 'video' => 'reels ubsc 2.mp4'],
            ['title' => 'SPORT CENTER UB.', 'thumb' => 'thumbnail 3.png', 'video' => 'reels ubsc 3.mp4'],
            ['title' => 'SPORT CENTER UB.', 'thumb' => 'thumbnail 4.png', 'video' => 'reels ubsc 4.mp4'],
            ['title' => 'SPORT CENTER UB.', 'thumb' => 'thumbnail 5.png', 'video' => 'reels ubsc 5.mp4'],
        ];

        foreach ($items as $data) {
            $reel = Reel::create(['title' => $data['title'], 'is_active' => true]);

            $thumbPath = public_path('assets/reels/' . $data['thumb']);
            if (file_exists($thumbPath)) {
                $reel->addMedia($thumbPath)->preservingOriginal()->toMediaCollection('thumbnail');
            }

            $videoPath = public_path('assets/reels/' . $data['video']);
            if (file_exists($videoPath)) {
                $reel->addMedia($videoPath)->preservingOriginal()->toMediaCollection('video');
            }
        }
    }
}
