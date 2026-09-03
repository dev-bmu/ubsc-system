<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use Throwable;

final class LogExportReceiptStatus
{
    public function __construct(private readonly LogIngestionReceiptStore $receipts) {}

    /** @return array{status:string,last_seen_at:?string,message:string} */
    public function summary(): array
    {
        try {
            $receipt = $this->receipts->latestForCurrentRelease();
        } catch (Throwable) {
            return [
                'status' => MonitoringStatus::Outage->value,
                'last_seen_at' => null,
                'message' => 'Signed off-host log receipt storage or integrity validation failed.',
            ];
        }

        if ($receipt?->ingested_at === null) {
            return [
                'status' => MonitoringStatus::Unknown->value,
                'last_seen_at' => null,
                'message' => 'No signed off-host log-ingestion receipt exists for this release.',
            ];
        }

        $age = max(0, (int) $receipt->ingested_at->diffInSeconds(now('UTC')));
        $warning = (int) config(
            'observability.log_receipts.warning_after_seconds',
            90_000,
        );
        $outage = (int) config(
            'observability.log_receipts.outage_after_seconds',
            172_800,
        );
        $status = match (true) {
            $receipt->retention_until?->lessThanOrEqualTo(now('UTC')) !== false,
            $age >= $outage => MonitoringStatus::Outage,
            $age >= $warning => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };

        return [
            'status' => $status->value,
            'last_seen_at' => $receipt->ingested_at->toIso8601String(),
            'message' => match ($status) {
                MonitoringStatus::Operational => 'A current provider-signed off-host log-ingestion receipt is valid.',
                MonitoringStatus::Degraded => 'The latest provider-signed off-host log receipt is approaching its outage boundary.',
                default => 'The latest provider-signed off-host log receipt is stale or no longer retained.',
            },
        ];
    }
}
