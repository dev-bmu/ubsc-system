<?php

namespace App\Http\Controllers;

use App\Enums\MonitoringStatus;
use App\Services\Monitoring\LogIngestionReceiptStore;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

final class LogIngestionReceiptController
{
    public function __invoke(
        Request $request,
        LogIngestionReceiptStore $receipts,
        MonitoringHeartbeatRecorder $heartbeats,
    ): JsonResponse {
        if (! $request->isJson()) {
            return $this->response(['message' => 'JSON content is required.'], 415);
        }

        $maximumBytes = (int) config(
            'observability.log_receipts.maximum_envelope_bytes',
            32_768,
        );
        $declaredLength = trim((string) $request->header('Content-Length', ''));
        if ($declaredLength !== ''
            && (preg_match('/\A[0-9]{1,12}\z/', $declaredLength) !== 1
                || (int) $declaredLength > $maximumBytes)) {
            return $this->response(['message' => 'Request body is too large.'], 413);
        }

        try {
            $result = $receipts->ingest($request->getContent());
            $receipt = $result['receipt'];
            $heartbeats->record(
                key: (string) config(
                    'observability.log_receipts.heartbeat_key',
                    'monitoring-log-export-receipt',
                ),
                category: 'observability',
                status: MonitoringStatus::Operational,
                message: 'The off-host log provider confirmed canary ingestion.',
                context: [
                    'provider' => (string) $receipt->provider,
                    'operation_id' => (string) $receipt->operation_id,
                ],
                observedAt: $receipt->ingested_at,
            );
        } catch (InvalidArgumentException) {
            return $this->response(['message' => 'Invalid log receipt.'], 401);
        }

        return $this->response([
            'accepted' => true,
            'duplicate' => $result['duplicate'],
        ], $result['duplicate'] ? 200 : 202);
    }

    /** @param array<string, mixed> $body */
    private function response(array $body, int $status): JsonResponse
    {
        return response()->json($body, $status, [
            'Cache-Control' => 'no-store, private, max-age=0',
            'Pragma' => 'no-cache',
        ]);
    }
}
