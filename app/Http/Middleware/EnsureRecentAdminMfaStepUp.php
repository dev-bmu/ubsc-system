<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\AdminMfaStepUp;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureRecentAdminMfaStepUp
{
    public function __construct(
        private readonly AdminMfaStepUp $stepUp,
    ) {}

    public function handle(
        Request $request,
        Closure $next,
        string $purpose,
        string $mode = 'consume',
    ): Response {
        $user = $request->user();

        $verified = $user instanceof User
            && ($mode === 'peek'
                ? $this->stepUp->isVerifiedFor($request, $user, $purpose)
                : $this->stepUp->consume($request, $user, $purpose) !== null);

        if (! $verified) {
            if ($request->header('X-Inertia') === 'true') {
                return back()->withErrors([
                    'mfa_step_up' => 'Verifikasi keamanan ulang diperlukan untuk melanjutkan.',
                ]);
            }

            return response()->json([
                'message' => 'Verifikasi keamanan ulang diperlukan untuk melanjutkan.',
                'code' => 'mfa_step_up_required',
            ], 428);
        }

        return $next($request);
    }
}
