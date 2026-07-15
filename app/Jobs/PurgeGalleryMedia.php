<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;

class PurgeGalleryMedia implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public readonly string $uuid)
    {
        $this->onQueue('media-maintenance');
    }

    public function handle(): void
    {
        $basePath = trim(config('facility-gallery.public_path', 'facility-gallery'), '/')
            ."/{$this->uuid}";

        Storage::disk(config('facility-gallery.public_disk', 'public'))
            ->deleteDirectory($basePath);
    }
}
