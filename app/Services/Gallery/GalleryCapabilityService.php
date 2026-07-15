<?php

namespace App\Services\Gallery;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Process;

class GalleryCapabilityService
{
    public function report(): array
    {
        return Cache::remember('facility-gallery:capabilities:v2', now()->addMinutes(10), fn () => [
            'image' => [
                'jpeg' => function_exists('imagecreatefromjpeg'),
                'png' => function_exists('imagecreatefrompng'),
                'webp' => function_exists('imagecreatefromwebp'),
                'avif' => function_exists('imagecreatefromavif'),
                'heic' => $this->supportsHeic(),
            ],
            'video' => [
                'ffmpeg' => $this->binaryAvailable(
                    (string) config('facility-gallery.video.ffmpeg_path', 'ffmpeg'),
                ),
                'ffprobe' => $this->binaryAvailable(
                    (string) config('facility-gallery.video.ffprobe_path', 'ffprobe'),
                ),
            ],
            'queue' => config('queue.default'),
            'originals_disk' => config('facility-gallery.originals_disk'),
            'public_disk' => config('facility-gallery.public_disk'),
            'search' => [
                'driver' => config('scout.driver'),
                'healthy' => $this->searchHealthy(),
            ],
        ]);
    }

    private function supportsHeic(): bool
    {
        if (! class_exists(\Imagick::class)) {
            return false;
        }

        try {
            return \Imagick::queryFormats('HEIC') !== [];
        } catch (\Throwable) {
            return false;
        }
    }

    private function binaryAvailable(string $binary): bool
    {
        try {
            $process = new Process([$binary, '-version']);
            $process->setTimeout(4);
            $process->run();

            return $process->isSuccessful();
        } catch (\Throwable) {
            return false;
        }
    }

    private function searchHealthy(): bool
    {
        if (config('scout.driver') !== 'meilisearch') {
            return config('scout.driver') !== 'null';
        }

        try {
            return Http::timeout(2)
                ->acceptJson()
                ->get(rtrim((string) config('scout.meilisearch.host'), '/').'/health')
                ->successful();
        } catch (\Throwable) {
            return false;
        }
    }
}
