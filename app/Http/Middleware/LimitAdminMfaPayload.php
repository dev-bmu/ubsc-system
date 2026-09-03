<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LimitAdminMfaPayload
{
    private const MAX_BYTES = 1_048_576;

    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->isMethodSafe()) {
            $declaredLength = (int) $request->server('CONTENT_LENGTH', 0);
            $actualLength = strlen($request->getContent());

            if ($declaredLength > self::MAX_BYTES || $actualLength > self::MAX_BYTES) {
                return response()->json([
                    'message' => __('auth.mfa_invalid'),
                ], 413)->withHeaders([
                    'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                    'Pragma' => 'no-cache',
                    'Expires' => '0',
                ]);
            }
        }

        return $next($request);
    }
}
