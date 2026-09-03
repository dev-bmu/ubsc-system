<?php

namespace App\Services\Invoices;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Support\Facades\Log;
use Throwable;

class InvoicePdfTelemetry
{
    public const HEARTBEAT_KEY = 'invoice-pdf-renderer';

    public function __construct(
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    public function generated(
        string $kind,
        int $durationMs,
        int $sizeBytes,
        string $templateVersion,
    ): void {
        $context = [
            'kind' => $kind,
            'size_bytes' => max(0, $sizeBytes),
            'template_version_hash' => substr(hash('sha256', $templateVersion), 0, 16),
        ];

        try {
            $this->heartbeats->record(
                key: self::HEARTBEAT_KEY,
                category: 'documents',
                status: MonitoringStatus::Operational,
                latencyMs: max(0, $durationMs),
                context: $context,
            );
        } catch (Throwable) {
            // Document delivery must not fail merely because telemetry storage
            // is temporarily unavailable.
        }

        Log::info('invoice_pdf.generated', [
            ...$context,
            'duration_ms' => max(0, $durationMs),
        ]);
    }

    public function failed(string $kind, string $failureCode): void
    {
        $context = [
            'kind' => $kind,
            'failure_code' => preg_match('/^[a-z0-9_.-]{1,64}$/', $failureCode) === 1
                ? $failureCode
                : 'unclassified',
        ];

        try {
            $this->heartbeats->record(
                key: self::HEARTBEAT_KEY,
                category: 'documents',
                status: MonitoringStatus::Degraded,
                message: 'Invoice PDF generation failed.',
                context: $context,
            );
        } catch (Throwable) {
            // Preserve the original failure path.
        }

        Log::warning('invoice_pdf.generation_failed', $context);
    }
}
