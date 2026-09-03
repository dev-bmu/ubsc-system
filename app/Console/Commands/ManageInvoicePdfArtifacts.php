<?php

namespace App\Console\Commands;

use App\Models\InvoicePdfArtifact;
use Illuminate\Console\Command;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class ManageInvoicePdfArtifacts extends Command
{
    protected $signature = 'invoices:pdf:lifecycle
        {--limit= : Maximum expired artifacts to process}
        {--dry-run : Report candidates without changing storage or metadata}';

    protected $description = 'Archive or prune expired private invoice PDF artifacts in a bounded batch';

    public function handle(): int
    {
        $configuredLimit = (int) config('invoice_pdf.lifecycle.prune_batch', 250);
        $limit = min(2_000, max(1, (int) ($this->option('limit') ?: $configuredLimit)));
        $dryRun = (bool) $this->option('dry-run');
        $archiveDisk = trim((string) config('invoice_pdf.archive_disk', ''));
        $partialPartitions = $this->stalePartialPartitions();
        $candidates = InvoicePdfArtifact::query()
            ->where('storage_tier', InvoicePdfArtifact::TIER_HOT)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->orderBy('expires_at')
            ->orderBy('id')
            ->limit($limit)
            ->get();
        $result = [
            'candidates' => $candidates->count(),
            'archived' => 0,
            'pruned' => 0,
            'missing' => 0,
            'partial_partitions_pruned' => 0,
            'failed' => 0,
        ];

        if ($dryRun) {
            $result['partial_partitions_pruned'] = count($partialPartitions);
            $this->line(json_encode($result, JSON_THROW_ON_ERROR));

            return self::SUCCESS;
        }

        foreach ($partialPartitions as $partition) {
            try {
                if (! Storage::disk((string) config('invoice_pdf.disk'))->deleteDirectory($partition)) {
                    throw new \RuntimeException('Partial partition deletion failed.');
                }

                $result['partial_partitions_pruned']++;
            } catch (Throwable) {
                $result['failed']++;
            }
        }

        foreach ($candidates as $artifact) {
            try {
                $processed = $this->underLock($artifact, function () use (
                    $artifact,
                    $archiveDisk,
                ): string {
                    $artifact->refresh();

                    if ($artifact->storage_tier !== InvoicePdfArtifact::TIER_HOT
                        || $artifact->expires_at === null
                        || $artifact->expires_at->isFuture()) {
                        return 'skipped';
                    }

                    $source = Storage::disk($artifact->disk);

                    if (! $source->exists($artifact->path)) {
                        $artifact->delete();

                        return 'missing';
                    }

                    if ($archiveDisk !== '') {
                        $this->archive($artifact, $source, Storage::disk($archiveDisk));

                        return 'archived';
                    }

                    if (! $source->delete($artifact->path)) {
                        throw new \RuntimeException('Artifact deletion failed.');
                    }

                    $artifact->delete();

                    return 'pruned';
                });

                if (isset($result[$processed])) {
                    $result[$processed]++;
                }
            } catch (Throwable) {
                $result['failed']++;
            }
        }

        $this->line(json_encode($result, JSON_THROW_ON_ERROR));

        return $result['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    /** @param \Closure(): string $callback */
    private function underLock(
        InvoicePdfArtifact $artifact,
        \Closure $callback,
    ): string {
        $store = config('invoice_pdf.lock.store');
        $cache = is_string($store) && $store !== ''
            ? Cache::store($store)
            : Cache::store();
        $lock = $cache->lock(
            'invoice-pdf:'.$artifact->cache_key,
            max(30, (int) config('invoice_pdf.lock.seconds', 75)),
        );

        return $lock->block(5, $callback);
    }

    private function archive(
        InvoicePdfArtifact $artifact,
        FilesystemAdapter $source,
        FilesystemAdapter $archive,
    ): void {
        $archivePath = 'archive/'.$artifact->path;
        $temporaryPath = $archivePath.'.part-'.Str::lower((string) Str::ulid());
        $sourceStream = $source->readStream($artifact->path);

        if (! is_resource($sourceStream)) {
            throw new \RuntimeException('Artifact source stream is unavailable.');
        }

        try {
            if (! $archive->put($temporaryPath, $sourceStream, ['visibility' => 'private'])) {
                throw new \RuntimeException('Archive write failed.');
            }
        } finally {
            fclose($sourceStream);
        }

        try {
            if ($archive->exists($archivePath)) {
                $archive->delete($archivePath);
            }

            if (! $archive->move($temporaryPath, $archivePath)) {
                throw new \RuntimeException('Archive finalization failed.');
            }

            if ((int) $archive->size($archivePath) !== $artifact->size_bytes
                || ! $this->checksumMatches($archive, $archivePath, $artifact->content_sha256)) {
                throw new \RuntimeException('Archived artifact failed verification.');
            }

            $originalDisk = $artifact->disk;
            $originalPath = $artifact->path;
            $artifact->forceFill([
                'storage_tier' => InvoicePdfArtifact::TIER_ARCHIVE,
                'disk' => (string) config('invoice_pdf.archive_disk'),
                'path' => $archivePath,
                'last_verified_at' => now(),
                'expires_at' => null,
            ])->save();

            if (! Storage::disk($originalDisk)->delete($originalPath)) {
                // Metadata already points to the verified archive. A duplicate
                // hot object is safe and can be removed by storage lifecycle.
            }
        } finally {
            if ($archive->exists($temporaryPath)) {
                $archive->delete($temporaryPath);
            }
        }
    }

    private function checksumMatches(
        FilesystemAdapter $disk,
        string $path,
        string $expected,
    ): bool {
        $stream = $disk->readStream($path);

        if (! is_resource($stream)) {
            return false;
        }

        try {
            $hash = hash_init('sha256');
            hash_update_stream($hash, $stream);

            return hash_equals($expected, hash_final($hash));
        } finally {
            fclose($stream);
        }
    }

    /** @return list<string> */
    private function stalePartialPartitions(): array
    {
        try {
            $diskName = trim((string) config('invoice_pdf.disk', ''));

            if ($diskName === '' || config('filesystems.disks.'.$diskName) === null) {
                return [];
            }

            $prefix = trim((string) config('invoice_pdf.prefix', 'invoice-pdf'), '/');
            $prefix = preg_replace('/[^a-zA-Z0-9._\/-]/', '-', $prefix) ?: 'invoice-pdf';
            $root = $prefix.'/_tmp';
            $cutoff = now('UTC')->subDays(
                max(1, (int) config('invoice_pdf.lifecycle.partial_retention_days', 2)),
            )->startOfDay();
            $limit = min(90, max(
                1,
                (int) config('invoice_pdf.lifecycle.partial_partition_batch', 14),
            ));

            return collect(Storage::disk($diskName)->directories($root))
                ->filter(static function (string $directory) use ($cutoff): bool {
                    $date = basename($directory);

                    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1
                        && \Carbon\CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC')
                            ->lt($cutoff);
                })
                ->sort()
                ->take($limit)
                ->values()
                ->all();
        } catch (Throwable) {
            return [];
        }
    }
}
