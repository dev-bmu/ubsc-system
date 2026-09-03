<?php

namespace App\Http\Controllers;

use App\Services\Monitoring\ReadinessService;
use Illuminate\Http\JsonResponse;

class ReadinessController extends Controller
{
    public function __invoke(ReadinessService $readiness): JsonResponse
    {
        $report = $readiness->report();
        $status = $report['ready'] ? 200 : 503;
        $healthState = ! $report['ready']
            ? 'not-ready'
            : (($report['degraded'] ?? false) ? 'degraded' : 'ready');
        $instanceId = trim((string) config('high_availability.load_balancer.instance_id'));
        $exposeInstance = (bool) config(
            'high_availability.load_balancer.expose_instance_header',
            false,
        );
        $instanceHeader = $instanceId !== '' && $exposeInstance
            ? substr(hash('sha256', $instanceId), 0, 16)
            : null;
        $release = trim((string) config('monitoring.release'));
        $exposeRelease = (bool) config(
            'high_availability.load_balancer.expose_release_header',
            false,
        );
        $releaseHeader = $release !== '' && $exposeRelease
            ? substr(hash('sha256', $release), 0, 16)
            : null;

        return response()->json([
            'status' => $report['ready'] ? 'ready' : 'not_ready',
            'checked_at' => $report['checked_at'],
        ], $status)->withHeaders(array_filter([
            'Cache-Control' => 'no-store, max-age=0',
            'Pragma' => 'no-cache',
            'X-Robots-Tag' => 'noindex, nofollow',
            'X-UBSC-Health' => 'readiness',
            'X-UBSC-Health-State' => $healthState,
            'X-UBSC-Instance' => $instanceHeader,
            'X-UBSC-Release' => $releaseHeader,
            'Retry-After' => $report['ready'] ? null : '10',
        ]));
    }
}
