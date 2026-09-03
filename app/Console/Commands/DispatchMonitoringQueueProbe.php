<?php

namespace App\Console\Commands;

use App\Jobs\RecordQueueWorkerHeartbeat;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Monitoring\MonitoringIncidentManager;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Log;
use Throwable;

class DispatchMonitoringQueueProbe extends Command
{
    protected $signature = 'monitoring:queue-probe
        {--connection= : Queue connection to probe}
        {--queue= : Queue name to probe}';

    protected $description = 'Dispatch one deduplicated queue-worker heartbeat probe';

    public function handle(MonitoringIncidentManager $incidents): int
    {
        if (! (bool) config('monitoring.enabled', true)) {
            return self::SUCCESS;
        }

        $connection = trim((string) ($this->option('connection')
            ?: config('monitoring.queue.connection', 'database')));
        $queue = trim((string) ($this->option('queue')
            ?: config('monitoring.queue.queue', 'default')));

        if (! $this->validIdentifier($connection)
            || ! $this->validIdentifier($queue)
            || config('queue.connections.'.$connection) === null) {
            if (! $this->option('quiet')) {
                $this->components->error('The queue probe configuration is invalid.');
            }

            return self::INVALID;
        }

        $incidentKey = MonitoringHeartbeatRecorder::queueIncidentKey(
            'dispatch',
            $connection,
            $queue,
        );

        try {
            $job = (new RecordQueueWorkerHeartbeat(
                probeConnection: $connection,
                probeQueue: $queue,
                dispatchedAt: now()->toIso8601String(),
            ))
                ->onConnection($connection)
                ->onQueue($queue);

            Bus::dispatch($job);
            $incidents->resolve($incidentKey);

            if (! $this->option('quiet')) {
                $this->components->info('Queue heartbeat probe dispatched or already pending.');
            }

            return self::SUCCESS;
        } catch (Throwable $exception) {
            Log::error('monitoring.queue_probe_dispatch_failed', [
                'failure_class' => $exception::class,
            ]);

            try {
                $incidents->openOrRefresh(
                    key: $incidentKey,
                    source: 'queue',
                    title: 'Queue probe tidak dapat dikirim',
                    severity: 'critical',
                    summary: 'Aplikasi gagal mengirim probe untuk memverifikasi worker queue.',
                    context: [
                        'connection' => $connection,
                        'queue' => $queue,
                        'failure_class' => $exception::class,
                    ],
                );
            } catch (Throwable) {
                // The database/cache may be the failed dependency. Preserve
                // the non-zero exit code for external process supervision.
            }

            if (! $this->option('quiet')) {
                $this->components->error('Queue heartbeat probe could not be dispatched.');
            }

            return self::FAILURE;
        }
    }

    private function validIdentifier(string $value): bool
    {
        return preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/', $value) === 1;
    }
}
