<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\LogIngestionReceiptStore;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Console\Command;
use Throwable;

final class AwaitLogIngestionReceipt extends Command
{
    protected $signature = 'monitoring:logs:await-receipt
        {operation-id : Exact canary operation identifier}
        {--wait= : Maximum bounded wait in seconds}
        {--poll-ms= : Poll interval in milliseconds}';

    protected $description = 'Require provider-signed proof that an exact canary reached off-host log storage';

    public function handle(
        LogIngestionReceiptStore $receipts,
        MonitoringHeartbeatRecorder $heartbeats,
    ): int {
        $operationId = trim((string) $this->argument('operation-id'));
        $waitSeconds = $this->option('wait') === null
            ? (int) config('observability.log_receipts.wait_seconds', 60)
            : (int) $this->option('wait');
        $pollMilliseconds = $this->option('poll-ms') === null
            ? (int) config('observability.log_receipts.poll_milliseconds', 500)
            : (int) $this->option('poll-ms');

        if (preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}\z/', $operationId) !== 1
            || $waitSeconds < 5
            || $waitSeconds > 120
            || $pollMilliseconds < 100
            || $pollMilliseconds > 2_000) {
            $this->components->error('The log-receipt acceptance boundary is invalid.');

            return self::INVALID;
        }

        $deadline = hrtime(true) + ($waitSeconds * 1_000_000_000);
        try {
            do {
                $receipt = $receipts->forOperation($operationId);
                if ($receipt !== null) {
                    $heartbeats->record(
                        key: (string) config(
                            'observability.log_receipts.heartbeat_key',
                            'monitoring-log-export-receipt',
                        ),
                        category: 'observability',
                        status: MonitoringStatus::Operational,
                        message: 'Exact off-host log canary ingestion was independently confirmed.',
                        context: [
                            'provider' => (string) $receipt->provider,
                            'operation_id' => $operationId,
                        ],
                        observedAt: $receipt->ingested_at,
                    );
                    $this->components->info(
                        'Provider-signed off-host log receipt verified.',
                    );

                    return self::SUCCESS;
                }

                usleep($pollMilliseconds * 1_000);
            } while (hrtime(true) < $deadline);
        } catch (Throwable) {
            $this->recordFailure($heartbeats, $operationId, 'receipt_integrity_or_storage_failure');
            $this->components->error('Off-host log receipt verification failed.');

            return self::FAILURE;
        }

        $this->recordFailure($heartbeats, $operationId, 'receipt_timeout');
        $this->components->error('The off-host log provider did not confirm this canary in time.');

        return self::FAILURE;
    }

    private function recordFailure(
        MonitoringHeartbeatRecorder $heartbeats,
        string $operationId,
        string $reason,
    ): void {
        try {
            $heartbeats->record(
                key: (string) config(
                    'observability.log_receipts.heartbeat_key',
                    'monitoring-log-export-receipt',
                ),
                category: 'observability',
                status: MonitoringStatus::Outage,
                message: 'Exact off-host log canary ingestion was not confirmed.',
                context: [
                    'operation_id' => $operationId,
                    'reason' => $reason,
                ],
            );
        } catch (Throwable) {
            // The non-zero command result remains authoritative when the
            // heartbeat store is the failing dependency.
        }
    }
}
