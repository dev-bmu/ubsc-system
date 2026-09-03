<?php

namespace App\Http\Controllers;

use App\Services\Monitoring\ExternalSliIngestor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

final class ExternalSliIngestController
{
    public function __invoke(Request $request, ExternalSliIngestor $ingestor): JsonResponse
    {
        if (! $request->isJson()) {
            return response()->json(['message' => 'JSON content is required.'], 415);
        }

        try {
            $result = $ingestor->ingest(
                rawBody: $request->getContent(),
                requestTimestamp: (string) $request->header('X-UBSC-Synthetic-Timestamp', ''),
                probeId: (string) $request->header('X-UBSC-Synthetic-Id', ''),
                keyId: (string) $request->header('X-UBSC-Synthetic-Key-Id', ''),
                signature: (string) $request->header('X-UBSC-Synthetic-Signature', ''),
            );
        } catch (InvalidArgumentException) {
            // Deliberately generic: do not reveal which key, signature,
            // timestamp, target, or payload invariant rejected the caller.
            return response()->json(['message' => 'Invalid synthetic evidence.'], 401);
        }

        return response()->json($result, $result['duplicate'] ? 200 : 202);
    }
}
