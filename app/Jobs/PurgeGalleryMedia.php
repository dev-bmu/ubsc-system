<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;

class PurgeGalleryMedia implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $timeout = 60;

    public bool $failOnTimeout = true;

    public int $uniqueFor = 600;

    public function __construct(public readonly string $uuid)
    {
        $this->onConnection((string) config('background_jobs.connection', 'database'));
        $this->onQueue((string) config(
            'background_jobs.queues.media_maintenance',
            'media-maintenance',
        ));
        $this->afterCommit();
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 60, 300, 900];
    }

    public function uniqueId(): string
    {
        return 'gallery-purge:'.$this->uuid;
    }

    public function handle(): void
    {
        $basePath = trim(config('facility-gallery.public_path', 'facility-gallery'), '/')
            ."/{$this->uuid}";

        Storage::disk(config('facility-gallery.public_disk', 'public'))
            ->deleteDirectory($basePath);
    }
}
