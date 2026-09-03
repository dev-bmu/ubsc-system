<?php

namespace App\Jobs;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Monitoring\MonitoringIncidentManager;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use RuntimeException;
use Throwable;

class RecordQueueWorkerHeartbeat implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 30;

    public bool $failOnTimeout = true;

    // A worker crash must not leave the dead-man probe permanently locked.
    // Duplicate probes after this bounded TTL are harmless idempotent writes.
    public int $uniqueFor = 180;

    public function __construct(
        public readonly string $probeConnection,
        public readonly string $probeQueue,
        public readonly string $dispatchedAt,
    ) {}

    public function uniqueId(): string
    {
        return MonitoringHeartbeatRecorder::queueKey(
            $this->probeConnection,
            $this->probeQueue,
        );
    }

    public function handle(
        MonitoringHeartbeatRecorder $heartbeats,
        MonitoringIncidentManager $incidents,
    ): void {
        $dispatchedAt = \Carbon\CarbonImmutable::parse($this->dispatchedAt);
        $observedAt = now();
        $maximumClockSkew = max(1, (int) config(
            'process_supervision.safety.maximum_heartbeat_clock_skew_seconds',
            30,
        ));

        if ($dispatchedAt->getTimestamp() > ($observedAt->getTimestamp() + $maximumClockSkew)) {
            throw new RuntimeException('Queue probe dispatch timestamp exceeds the clock-skew allowance.');
        }

        $latencyMs = max(
            0,
            ($observedAt->getTimestamp() - $dispatchedAt->getTimestamp()) * 1_000,
        );
        $key = MonitoringHeartbeatRecorder::queueKey(
            $this->probeConnection,
            $this->probeQueue,
        );

        $heartbeats->record(
            key: $key,
            category: 'queue',
            status: MonitoringStatus::Operational,
            latencyMs: $latencyMs,
            context: [
                'connection' => $this->probeConnection,
                'queue' => $this->probeQueue,
            ],
        );

        $incidents->resolve(MonitoringHeartbeatRecorder::queueIncidentKey(
            'execution',
            $this->probeConnection,
            $this->probeQueue,
        ));
    }

    public function failed(?Throwable $exception): void
    {
        try {
            app(MonitoringHeartbeatRecorder::class)->record(
                key: MonitoringHeartbeatRecorder::queueKey(
                    $this->probeConnection,
                    $this->probeQueue,
                ),
                category: 'queue',
                status: MonitoringStatus::Outage,
                message: 'Queue probe failed during execution.',
                context: [
                    'connection' => $this->probeConnection,
                    'queue' => $this->probeQueue,
                    'failure_class' => $exception ? $exception::class : 'unknown',
                ],
            );

            app(MonitoringIncidentManager::class)->openOrRefresh(
                key: MonitoringHeartbeatRecorder::queueIncidentKey(
                    'execution',
                    $this->probeConnection,
                    $this->probeQueue,
                ),
                source: 'queue',
                title: 'Queue probe gagal dijalankan',
                severity: 'critical',
                summary: 'Worker mengambil probe tetapi tidak dapat menyelesaikannya.',
                context: [
                    'connection' => $this->probeConnection,
                    'queue' => $this->probeQueue,
                    'failure_class' => $exception ? $exception::class : 'unknown',
                ],
            );
        } catch (Throwable) {
            // The queue callback must never recursively fail while recording
            // the original failure. Off-host logs remain the fallback signal.
        }
    }
}
