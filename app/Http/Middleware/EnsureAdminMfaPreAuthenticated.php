<?php

namespace App\Http\Middleware;

use App\Services\AdminMfaPreauthentication;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminMfaPreAuthenticated
{
    public function __construct(
        private readonly AdminMfaPreauthentication $preauthentication,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $this->preauthentication->pendingUser($request);

        if (! $user) {
            Inertia::clearHistory();

            if ($request->expectsJson()) {
                return response()->json([
                    'message' => __('auth.mfa_expired'),
                    'redirect' => route('ubsc-staff.login'),
                ], 401);
            }

            return redirect()
                ->route('ubsc-staff.login')
                ->withErrors(['email' => __('auth.mfa_expired')]);
        }

        $request->attributes->set('admin_mfa_user', $user);

        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');

        return $response;
    }
}
