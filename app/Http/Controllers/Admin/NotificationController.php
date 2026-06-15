<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AdminNotificationCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request, AdminNotificationCenter $notifications): JsonResponse
    {
        return response()->json($notifications->for($request));
    }

    public function markRead(Request $request, AdminNotificationCenter $notifications): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['nullable', 'array'],
            'ids.*' => ['string', 'max:160'],
        ]);

        return response()->json($notifications->markRead($request, $validated['ids'] ?? null));
    }

    public function clearRead(Request $request, AdminNotificationCenter $notifications): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['nullable', 'array'],
            'ids.*' => ['string', 'max:160'],
        ]);

        return response()->json($notifications->clearRead($request, $validated['ids'] ?? null));
    }
}
