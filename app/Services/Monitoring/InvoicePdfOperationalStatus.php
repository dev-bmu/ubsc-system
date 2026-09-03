<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\InvoicePdfArtifact;
use App\Models\MonitoringHeartbeat;
use App\Services\Invoices\InvoicePdfTelemetry;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Throwable;

class InvoicePdfOperationalStatus
{
    public function __construct(
        private readonly MonitoringTelemetryReader $telemetry,
    ) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $enabled = (bool) config('invoice_pdf.prewarm.enabled', false);
        $connection = trim((string) config('invoice_pdf.prewarm.connection', ''));
        $connection = $connection !== ''
            ? $connection
            : (string) config('background_jobs.connection', 'database');
        $queue = trim((string) config('invoice_pdf.prewarm.queue', 'documents')) ?: 'documents';
        $disk = trim((string) config('invoice_pdf.disk', 'invoice-pdf'));
        $sampleLimit = (int) config('invoice_pdf.monitoring.sample_limit', 1_000);
        $queueState = $this->telemetry->queueFor(
            connection: $connection,
            queue: $queue,
            thresholds: [
                'warning_depth' => (int) config('invoice_pdf.monitoring.pending_warning', 25),
                'outage_depth' => (int) config('invoice_pdf.monitoring.pending_outage', 100),
                'warning_age_seconds' => (int) config('invoice_pdf.monitoring.worker_warning_seconds', 180),
                'outage_age_seconds' => (int) config('invoice_pdf.monitoring.worker_outage_seconds', 600),
            ],
            sampleLimit: $sampleLimit,
        );
        $latest = $this->latestArtifact();
        $renderer = $this->rendererHeartbeat();
        $lifecycle = $this->lifecycleBacklog($sampleLimit);
        $storage = $this->storageState($disk, $latest);
        $statuses = [];
        $messages = [];

        if (! $enabled) {
            $statuses[] = MonitoringStatus::Unknown;
            $messages[] = 'Invoice prewarm is disabled.';
        } elseif ($connection === 'sync') {
            $statuses[] = MonitoringStatus::Outage;
            $messages[] = 'The document queue uses the synchronous driver.';
        } else {
            $statuses[] = MonitoringStatus::tryFrom((string) $queueState['status'])
                ?? MonitoringStatus::Unknown;
        }

        $statuses[] = $this->failedJobsStatus($queueState['failed_recent']);
        $statuses[] = $this->lifecycleStatus($lifecycle['expired_hot']);
        $statuses[] = $storage['status'];

        if ($renderer !== null) {
            $statuses[] = MonitoringStatus::tryFrom((string) $renderer->status)
                ?? MonitoringStatus::Unknown;

            if ($renderer->message) {
                $messages[] = $renderer->message;
            }
        }

        if (is_string($queueState['message'] ?? null) && $queueState['message'] !== '') {
            $messages[] = $queueState['message'];
        }

        if ($lifecycle['is_capped']) {
            $messages[] = 'Expired document artifacts exceed the bounded monitoring sample.';
        }

        if ($storage['message'] !== null) {
            $messages[] = $storage['message'];
        }

        return [
            'status' => MonitoringStatus::worst($statuses)->value,
            'prewarm_enabled' => $enabled,
            'connection' => $connection,
            'queue' => $queue,
            'disk' => $disk,
            'archive_configured' => trim((string) config('invoice_pdf.archive_disk', '')) !== '',
            'template_version' => (string) config('invoice_pdf.template_version'),
            'hot_retention_days' => (int) config('invoice_pdf.lifecycle.hot_retention_days', 90),
            'pending' => $queueState['depth'],
            'pending_is_capped' => $queueState['depth_is_capped'],
            'oldest_age_seconds' => $queueState['oldest_age_seconds'],
            'failed_recent' => $queueState['failed_recent'],
            'failed_recent_is_capped' => $queueState['failed_recent_is_capped'],
            'worker_last_seen_at' => $queueState['worker_last_seen_at'],
            'worker_lag_seconds' => $queueState['worker_lag_seconds'],
            'renderer_last_seen_at' => $renderer?->observed_at?->toIso8601String(),
            'renderer_last_failure_at' => $renderer?->last_failure_at?->toIso8601String(),
            'latest_generated_at' => $latest?->generated_at?->toIso8601String(),
            'latest_size_bytes' => $latest?->size_bytes,
            'latest_render_duration_ms' => $latest?->render_duration_ms,
            'latest_storage_tier' => $latest?->storage_tier,
            'expired_hot' => $lifecycle['expired_hot'],
            'expired_hot_is_capped' => $lifecycle['is_capped'],
            'storage_free_bytes' => $storage['free_bytes'],
            'storage_total_bytes' => $storage['total_bytes'],
            'storage_free_percent' => $storage['free_percent'],
            'message' => $messages === []
                ? 'Private invoice rendering and delivery are within configured limits.'
                : implode(' ', array_values(array_unique($messages))),
        ];
    }

    private function latestArtifact(): ?InvoicePdfArtifact
    {
        try {
            if (! Schema::hasTable('invoice_pdf_artifacts')) {
                return null;
            }

            return InvoicePdfArtifact::query()
                ->orderByDesc('generated_at')
                ->orderByDesc('id')
                ->first([
                    'id', 'disk', 'path', 'storage_tier', 'size_bytes',
                    'render_duration_ms', 'generated_at',
                ]);
        } catch (Throwable) {
            return null;
        }
    }

    private function rendererHeartbeat(): ?MonitoringHeartbeat
    {
        try {
            if (! Schema::hasTable('monitoring_heartbeats')) {
                return null;
            }

            return MonitoringHeartbeat::query()->find(InvoicePdfTelemetry::HEARTBEAT_KEY);
        } catch (Throwable) {
            return null;
        }
    }

    /** @return array{expired_hot: int|null, is_capped: bool} */
    private function lifecycleBacklog(int $limit): array
    {
        try {
            if (! Schema::hasTable('invoice_pdf_artifacts')) {
                return ['expired_hot' => null, 'is_capped' => false];
            }

            $rows = InvoicePdfArtifact::query()
                ->where('storage_tier', InvoicePdfArtifact::TIER_HOT)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now())
                ->orderBy('expires_at')
                ->orderBy('id')
                ->limit($limit + 1)
                ->pluck('id');

            return [
                'expired_hot' => min($rows->count(), $limit),
                'is_capped' => $rows->count() > $limit,
            ];
        } catch (Throwable) {
            return ['expired_hot' => null, 'is_capped' => false];
        }
    }

    private function failedJobsStatus(mixed $failed): MonitoringStatus
    {
        if (! is_numeric($failed)) {
            return MonitoringStatus::Unknown;
        }

        $warning = max(1, (int) config('invoice_pdf.monitoring.failed_warning', 1));
        $outage = max($warning + 1, (int) config('invoice_pdf.monitoring.failed_outage', 10));

        return match (true) {
            (int) $failed >= $outage => MonitoringStatus::Outage,
            (int) $failed >= $warning => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
    }

    private function lifecycleStatus(mixed $expired): MonitoringStatus
    {
        if (! is_numeric($expired)) {
            return MonitoringStatus::Unknown;
        }

        $warning = max(1, (int) config('invoice_pdf.monitoring.lifecycle_warning', 250));
        $outage = max($warning + 1, (int) config('invoice_pdf.monitoring.lifecycle_outage', 1_000));

        return match (true) {
            (int) $expired >= $outage => MonitoringStatus::Outage,
            (int) $expired >= $warning => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
    }

    /**
     * @return array{status: MonitoringStatus, free_bytes: int|null, total_bytes: int|null, free_percent: float|null, message: string|null}
     */
    private function storageState(string $disk, ?InvoicePdfArtifact $latest): array
    {
        if ($disk === '' || config('filesystems.disks.'.$disk) === null) {
            return [
                'status' => MonitoringStatus::Outage,
                'free_bytes' => null,
                'total_bytes' => null,
                'free_percent' => null,
                'message' => 'The private invoice storage disk is not configured.',
            ];
        }

        try {
            if ($latest !== null && ! Storage::disk($latest->disk)->exists($latest->path)) {
                return [
                    'status' => MonitoringStatus::Outage,
                    'free_bytes' => null,
                    'total_bytes' => null,
                    'free_percent' => null,
                    'message' => 'The latest invoice artifact is missing from private storage.',
                ];
            }

            if ((string) config('filesystems.disks.'.$disk.'.driver') !== 'local') {
                return [
                    'status' => MonitoringStatus::Operational,
                    'free_bytes' => null,
                    'total_bytes' => null,
                    'free_percent' => null,
                    'message' => null,
                ];
            }

            $root = (string) config('filesystems.disks.'.$disk.'.root', storage_path('app'));
            $probe = is_dir($root) ? $root : storage_path('app');
            $free = disk_free_space($probe);
            $total = disk_total_space($probe);

            if ($free === false || $total === false || $total <= 0) {
                throw new \RuntimeException('Disk capacity is unavailable.');
            }

            $freeBytes = max(0, (int) $free);
            $totalBytes = max(1, (int) $total);
            $freePercent = round(($freeBytes / $totalBytes) * 100, 2);
            $warning = (float) config('invoice_pdf.monitoring.storage_warning_free_percent', 15);
            $outage = min(
                $warning,
                (float) config('invoice_pdf.monitoring.storage_outage_free_percent', 5),
            );
            $status = match (true) {
                $freePercent <= $outage => MonitoringStatus::Outage,
                $freePercent <= $warning => MonitoringStatus::Degraded,
                default => MonitoringStatus::Operational,
            };

            return [
                'status' => $status,
                'free_bytes' => $freeBytes,
                'total_bytes' => $totalBytes,
                'free_percent' => $freePercent,
                'message' => $status === MonitoringStatus::Operational
                    ? null
                    : 'Private invoice storage capacity is below its safe threshold.',
            ];
        } catch (Throwable) {
            return [
                'status' => MonitoringStatus::Unknown,
                'free_bytes' => null,
                'total_bytes' => null,
                'free_percent' => null,
                'message' => 'Private invoice storage telemetry is unavailable.',
            ];
        }
    }
}
