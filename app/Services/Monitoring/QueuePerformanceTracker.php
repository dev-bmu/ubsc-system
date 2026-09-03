<?php

namespace App\Services\Monitoring;

use Illuminate\Contracts\Queue\Job;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Throwable;

class QueuePerformanceTracker
{
    /** @var array<int, array{started_at_ns:int,wait_ms:int}> */
    private array $active = [];

    public function __construct(
        private readonly PerformanceMetricRepository $metrics,
    ) {}

    public function processing(JobProcessing $event): void
    {
        if (! $this->shouldTrack($event->connectionName, $event->job)) {
            return;
        }

        $this->active[spl_object_id($event->job)] = [
            'started_at_ns' => hrtime(true),
            'wait_ms' => $this->waitMs($event->job),
        ];
    }

    public function processed(JobProcessed $event): void
    {
        $this->complete($event->connectionName, $event->job, false);
    }

    public function failed(JobFailed $event): void
    {
        $this->complete($event->connectionName, $event->job, true);
    }

    public function exceptionOccurred(JobExceptionOccurred $event): void
    {
        // Non-terminal retries do not count as processed or failed jobs, but
        // their process-local timer must be released to avoid worker leaks.
        unset($this->active[spl_object_id($event->job)]);
    }

    private function complete(string $connection, Job $job, bool $failed): void
    {
        if (! $this->shouldTrack($connection, $job)) {
            return;
        }

        $key = spl_object_id($job);
        $active = $this->active[$key] ?? null;
        unset($this->active[$key]);
        $runtimeMs = $active === null
            ? 0
            : max(0, (int) round((hrtime(true) - $active['started_at_ns']) / 1_000_000));

        try {
            $this->metrics->recordQueue(
                connection: $connection,
                queue: $job->getQueue() ?: 'default',
                waitMs: $active['wait_ms'] ?? $this->waitMs($job),
                runtimeMs: $runtimeMs,
                failed: $failed,
            );
        } catch (Throwable) {
            // The job result is authoritative. Telemetry failure must not
            // convert successful background work into a retry or failed job.
        }
    }

    private function shouldTrack(string $connection, Job $job): bool
    {
        if (! (bool) config('performance.enabled', false)) {
            return false;
        }

        $definition = config('queue.connections.'.$connection);

        if (! is_array($definition)
            || in_array((string) ($definition['driver'] ?? ''), ['sync', 'null'], true)) {
            return false;
        }

        $name = (string) data_get($job->payload(), 'data.commandName', $job->resolveName());

        return ! in_array($name, (array) config('performance.excluded_jobs', []), true);
    }

    private function waitMs(Job $job): int
    {
        $createdAt = data_get($job->payload(), 'createdAt');

        return is_numeric($createdAt)
            ? max(0, (int) round((microtime(true) - (float) $createdAt) * 1_000))
            : 0;
    }
}
