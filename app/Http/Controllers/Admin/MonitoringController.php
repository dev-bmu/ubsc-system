<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Monitoring\MonitoringSnapshotService;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Inertia\Response;

class MonitoringController extends Controller
{
    public function index(MonitoringSnapshotService $monitoring): Response
    {
        $this->authorize('view-system-operations');

        return Inertia::render('Admin/Settings/Monitoring/Index', [
            'snapshot' => $monitoring->snapshot(),
            'snapshot_url' => route('admin.settings.monitoring.snapshot'),
        ]);
    }

    public function snapshot(MonitoringSnapshotService $monitoring): JsonResponse
    {
        $this->authorize('view-system-operations');

        return response()->json($monitoring->snapshot())->withHeaders([
            // The service already uses a short bounded server-side cache.
            // Browsers and intermediary proxies must not retain staff data.
            'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ]);
    }
}
