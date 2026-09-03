<?php

namespace App\Http\Middleware;

use App\Services\Monitoring\RequestPerformanceRecorder;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrackRequestPerformance
{
    private const START_ATTRIBUTE = 'ubsc.performance.started_at_ns';

    public function handle(Request $request, Closure $next): Response
    {
        if ((bool) config('performance.enabled', false)) {
            $request->attributes->set(self::START_ATTRIBUTE, hrtime(true));
        }

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $startedAt = $request->attributes->get(self::START_ATTRIBUTE);

        if (! is_int($startedAt) && ! is_float($startedAt)) {
            return;
        }

        $durationMs = max(
            0,
            (int) round((hrtime(true) - (int) $startedAt) / 1_000_000),
        );

        app(RequestPerformanceRecorder::class)->record(
            $request,
            $response,
            $durationMs,
        );
    }
}
