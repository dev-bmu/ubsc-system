<?php

namespace App\Console\Commands;

use App\Jobs\ProcessGalleryMedia;
use App\Jobs\RecoverInterruptedPayments;
use App\Services\Monitoring\BackgroundQueueRegistry;
use App\Services\Monitoring\ExternalAvailabilityConfiguration;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Throwable;

class ValidateBackgroundJobPipeline extends Command
{
    protected $signature = 'background-jobs:doctor
        {--probe-backends : Perform read-only queue backend connectivity probes}';

    protected $description = 'Validate queue leases, priority lanes, failed-job storage, and performance telemetry';

    public function handle(
        BackgroundQueueRegistry $registry,
        ExternalAvailabilityConfiguration $externalAvailability,
    ): int {
        $errors = [];
        $warnings = [];
        $regular = (string) config('background_jobs.connection', '');
        $media = (string) config('background_jobs.media_connection', '');
        $invoiceConnection = trim((string) config('invoice_pdf.prewarm.connection', ''));
        $invoiceConnection = $invoiceConnection !== '' ? $invoiceConnection : $regular;

        $this->validateConnection(
            $regular,
            max(
                (new RecoverInterruptedPayments)->timeout,
                (int) config('invoice_pdf.prewarm.timeout_seconds', 60),
                60,
            ),
            'regular background jobs',
            $errors,
            $warnings,
        );
        $this->validateConnection(
            $media,
            (new ProcessGalleryMedia(1))->timeout,
            'long-running media jobs',
            $errors,
            $warnings,
        );

        if ($invoiceConnection !== $regular) {
            $this->validateConnection(
                $invoiceConnection,
                (int) config('invoice_pdf.prewarm.timeout_seconds', 60),
                'invoice document jobs',
                $errors,
                $warnings,
            );
        }

        $queues = array_filter((array) config('background_jobs.queues', []), 'is_string');
        $normalized = array_map(static fn (string $queue): string => trim($queue), $queues);

        if (in_array('', $normalized, true)
            || count($normalized) !== count(array_unique($normalized))) {
            $errors[] = 'Background queue names must be non-empty and unique.';
        }

        if ((string) config('queue.failed.driver', 'null') === 'null') {
            $errors[] = 'Failed-job persistence is disabled.';
        }

        foreach (array_keys((array) config('background_jobs.queues', [])) as $key) {
            $minimum = (int) config("background_jobs.worker_capacity.minimum.{$key}", 0);
            $maximum = (int) config("background_jobs.worker_capacity.maximum.{$key}", 0);

            if ($minimum < 0 || $maximum < 1 || $minimum > $maximum) {
                $errors[] = "Worker capacity bounds for [{$key}] are invalid.";
            }
        }

        if ((bool) config('monitoring.external.enabled', false)
            && ! (bool) $externalAvailability->summary()['external_monitoring_configured']) {
            $errors[] = 'External monitoring is enabled without a complete HTTPS provider contract.';
        }

        $performanceDriver = strtolower((string) config('performance.driver', 'database'));

        if (! in_array($performanceDriver, ['database', 'redis'], true)) {
            $errors[] = 'PERFORMANCE_METRICS_DRIVER must be database or redis.';
        } elseif ($performanceDriver === 'database') {
            if (! Schema::hasTable('performance_request_buckets')
                || ! Schema::hasTable('performance_queue_buckets')) {
                $errors[] = 'Performance metric migrations have not been applied.';
            }

            if (app()->environment('production')) {
                $warnings[] = 'Database telemetry is safe as a baseline; Redis is recommended before sustained high traffic.';
            }
        } else {
            $connection = (string) config('performance.redis_connection', 'cache');

            if (! is_array(config('database.redis.'.$connection))) {
                $errors[] = "Redis performance connection [{$connection}] is not configured.";
            }
        }

        if ((bool) $this->option('probe-backends')) {
            $this->probeBackends($registry, $errors);
        }

        foreach ($warnings as $warning) {
            $this->components->warn($warning);
        }

        foreach ($errors as $error) {
            $this->components->error($error);
        }

        if ($errors !== []) {
            return self::FAILURE;
        }

        $this->components->info('Background job and performance telemetry contracts are valid.');

        return self::SUCCESS;
    }

    /** @param list<string> $errors */
    private function probeBackends(
        BackgroundQueueRegistry $registry,
        array &$errors,
    ): void {
        $connections = collect($registry->all())->unique('connection')->values();

        foreach ($connections as $definition) {
            try {
                Queue::connection($definition['connection'])
                    ->size($definition['queue']);
            } catch (Throwable) {
                $errors[] = sprintf(
                    'Queue backend [%s] failed its read-only connectivity probe.',
                    $definition['connection'],
                );
            }
        }
    }

    /**
     * @param  list<string>  $errors
     * @param  list<string>  $warnings
     */
    private function validateConnection(
        string $connection,
        int $maximumJobTimeout,
        string $label,
        array &$errors,
        array &$warnings,
    ): void {
        $definition = config('queue.connections.'.$connection);

        if (! is_array($definition)) {
            $errors[] = "Queue connection [{$connection}] for {$label} is not configured.";

            return;
        }

        $driver = strtolower((string) ($definition['driver'] ?? ''));

        if (in_array($driver, ['sync', 'null'], true) && app()->environment('production')) {
            $errors[] = "Queue connection [{$connection}] for {$label} cannot use {$driver} in production.";
        }

        if ($driver === 'redis') {
            $redisConnection = trim((string) ($definition['connection'] ?? ''));
            $blockFor = (float) ($definition['block_for'] ?? 0);
            $readTimeout = (float) config(
                "database.redis.{$redisConnection}.read_timeout",
                0,
            );

            if ($blockFor < 1 || $readTimeout <= $blockFor || $readTimeout > 30) {
                $errors[] = sprintf(
                    'Redis queue [%s] read timeout (%.1fs) must exceed block_for (%.1fs) and remain at most 30s.',
                    $connection,
                    $readTimeout,
                    $blockFor,
                );
            }
        }

        $retryAfter = $definition['retry_after'] ?? null;

        if (is_numeric($retryAfter) && $maximumJobTimeout >= (int) $retryAfter) {
            $errors[] = sprintf(
                'Queue [%s] retry_after (%ds) must exceed the maximum %s timeout (%ds).',
                $connection,
                (int) $retryAfter,
                $label,
                $maximumJobTimeout,
            );
        } elseif (! is_numeric($retryAfter)
            && in_array($driver, ['database', 'redis', 'beanstalkd'], true)) {
            $warnings[] = "Queue [{$connection}] does not expose a numeric retry_after lease.";
        }
    }
}
