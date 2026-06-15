<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RedirectStaffFromPublic
{
    private const STAFF_ROLES = [
        'Administrator',
        'Manager',
        'Finance',
        'Staff Central',
        'Staff Front Office',
    ];

    /**
     * Prevent staff sessions from being rendered inside public user-facing pages.
     *
     * Staff accounts have their own admin surface. Letting the same session pass
     * through the public navbar makes admin users look like customer accounts.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->hasAnyRole(self::STAFF_ROLES)) {
            if ($request->expectsJson() || ! $request->isMethodSafe()) {
                abort(403, 'Staff accounts cannot access public user surfaces.');
            }

            return redirect()->route('admin.dashboard');
        }

        return $next($request);
    }
}
