<?php

namespace App\Console\Commands;

use App\Services\Monitoring\StorageReadinessSentinel;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Throwable;

final class EnsureStorageReadinessSentinel extends Command
{
    protected $signature = 'production:storage-sentinel
        {--check : Verify only; do not create a missing sentinel}';

    protected $description = 'Provision or verify the bounded readiness sentinel on durable storage';

    public function handle(StorageReadinessSentinel $sentinel): int
    {
        $disk = trim((string) config('monitoring.readiness.storage_disk'));
        $path = $sentinel->normalizePath((string) config(
            'monitoring.readiness.storage_sentinel',
        ));

        if (! $sentinel->validDisk($disk) || $path === null) {
            $this->components->error('The readiness storage disk/path is missing or unsafe.');

            return self::INVALID;
        }

        try {
            $storage = Storage::disk($disk);
            if (! $storage->exists($path)) {
                if ((bool) $this->option('check')) {
                    $this->components->error('The durable-storage readiness sentinel is missing.');

                    return self::FAILURE;
                }

                if (! $storage->put($path, StorageReadinessSentinel::CONTENT)) {
                    throw new \RuntimeException('sentinel write failed');
                }
            }

            if (! $storage->exists($path)
                || ! $sentinel->contentMatches($storage->get($path))) {
                throw new \RuntimeException('sentinel verification failed');
            }
        } catch (Throwable) {
            $this->components->error('Durable-storage readiness sentinel could not be verified.');

            return self::FAILURE;
        }

        $this->components->info('Durable-storage readiness sentinel is available.');

        return self::SUCCESS;
    }
}
