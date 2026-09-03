<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AdminPresenceService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class AdminPresenceController extends Controller
{
    public function __invoke(
        Request $request,
        AdminPresenceService $presence,
    ): Response {
        $validated = $request->validate([
            'state' => ['required', 'string', Rule::in([
                AdminPresenceService::ONLINE,
                AdminPresenceService::IDLE,
            ])],
            'tab_id' => [
                'required',
                'string',
                'size:36',
                'regex:/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i',
            ],
            'sequence' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'user_id' => ['prohibited'],
        ]);

        /** @var User $user */
        $user = $request->user();

        $presence->heartbeat(
            $user,
            $presence->sessionInstance($request),
            $validated['tab_id'],
            (int) $validated['sequence'],
            $validated['state'],
        );

        return response()->noContent()->withHeaders([
            'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ]);
    }
}
