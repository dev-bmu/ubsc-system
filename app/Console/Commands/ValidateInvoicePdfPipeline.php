<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class ValidateInvoicePdfPipeline extends Command
{
    protected $signature = 'invoices:pdf:doctor
        {--probe-storage : Write, read, and remove a private storage probe}';

    protected $description = 'Validate the production readiness of the private invoice PDF pipeline';

    public function handle(): int
    {
        $checks = $this->configurationChecks();

        if ((bool) $this->option('probe-storage')) {
            $checks['storage_round_trip'] = $this->storageRoundTrip();
        }

        $failed = collect($checks)->contains(false);
        $this->line(json_encode([
            'status' => $failed ? 'failed' : 'ready',
            'checks' => $checks,
        ], JSON_THROW_ON_ERROR));

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /** @return array<string, bool> */
    private function configurationChecks(): array
    {
        $disk = trim((string) config('invoice_pdf.disk', ''));
        $archive = trim((string) config('invoice_pdf.archive_disk', ''));
        $connection = trim((string) config('invoice_pdf.prewarm.connection', ''));
        $connection = $connection !== ''
            ? $connection
            : (string) config('background_jobs.connection', '');
        $queue = trim((string) config('invoice_pdf.prewarm.queue', ''));
        $lockStore = trim((string) config('invoice_pdf.lock.store', ''));
        $isProduction = app()->environment('production');
        $jobTimeout = (int) config('invoice_pdf.prewarm.timeout_seconds', 60);
        $lockSeconds = (int) config('invoice_pdf.lock.seconds', 75);
        $declaredVisibilityTimeout = (int) config(
            'invoice_pdf.prewarm.visibility_timeout_seconds',
            90,
        );
        $connectionRetryAfter = config(
            'queue.connections.'.$connection.'.retry_after',
        );
        $effectiveVisibilityTimeout = is_numeric($connectionRetryAfter)
            ? (int) $connectionRetryAfter
            : $declaredVisibilityTimeout;

        return [
            'private_disk_configured' => $disk !== ''
                && $this->diskDefinitionReady($disk),
            'archive_disk_configured' => $archive === ''
                || $this->diskDefinitionReady($archive),
            'queue_connection_configured' => $connection !== ''
                && $connection !== 'sync'
                && config('queue.connections.'.$connection) !== null,
            'queue_name_valid' => preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/', $queue) === 1,
            'queue_timing_safe' => $jobTimeout >= 15
                && $lockSeconds >= ($jobTimeout + 5)
                && $effectiveVisibilityTimeout >= ($lockSeconds + 5),
            'queue_visibility_contract_matches' => ! is_numeric($connectionRetryAfter)
                || (int) $connectionRetryAfter === $declaredVisibilityTimeout,
            'lock_store_configured' => $lockStore !== ''
                && config('cache.stores.'.$lockStore) !== null,
            'template_version_valid' => preg_match(
                '/^[a-zA-Z0-9._-]{1,64}$/',
                (string) config('invoice_pdf.template_version'),
            ) === 1,
            'production_prewarm_enabled' => ! $isProduction
                || (bool) config('invoice_pdf.prewarm.enabled', false),
            'production_sync_fallback_disabled' => ! $isProduction
                || ! (bool) config('invoice_pdf.allow_synchronous_fallback', true),
            'production_lock_is_shared' => ! $isProduction
                || ! in_array(
                    (string) config('cache.stores.'.$lockStore.'.driver'),
                    ['array', 'file', 'null'],
                    true,
                ),
        ];
    }

    private function storageRoundTrip(): bool
    {
        $diskName = trim((string) config('invoice_pdf.disk', ''));

        if ($diskName === '' || config('filesystems.disks.'.$diskName) === null) {
            return false;
        }

        $prefix = trim((string) config('invoice_pdf.prefix', 'invoice-pdf'), '/');
        $prefix = preg_replace('/[^a-zA-Z0-9._\/-]/', '-', $prefix) ?: 'invoice-pdf';
        $path = $prefix.'/_health/'.Str::lower((string) Str::ulid()).'.probe';
        try {
            $payload = random_bytes(32);
            $disk = Storage::disk($diskName);

            if (! $disk->put($path, $payload, ['visibility' => 'private'])) {
                return false;
            }

            return hash_equals(hash('sha256', $payload), hash('sha256', $disk->get($path)));
        } catch (Throwable) {
            return false;
        } finally {
            try {
                Storage::disk($diskName)->delete($path);
            } catch (Throwable) {
                // The probe result is already failed; never mask it.
            }
        }
    }

    private function diskDefinitionReady(string $disk): bool
    {
        $definition = config('filesystems.disks.'.$disk);

        if (! is_array($definition)) {
            return false;
        }

        return match ((string) ($definition['driver'] ?? '')) {
            'local' => is_string($definition['root'] ?? null)
                && trim((string) $definition['root']) !== '',
            's3' => is_string($definition['bucket'] ?? null)
                && trim((string) $definition['bucket']) !== '',
            default => false,
        };
    }
}
