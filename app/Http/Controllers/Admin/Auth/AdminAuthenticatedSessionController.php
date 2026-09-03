<?php

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AdminLoginRequest;
use App\Services\AdminMfaPreauthentication;
use App\Services\AuthenticationRateLimiter;
use App\Services\AuthSessionCoordinator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AdminAuthenticatedSessionController extends Controller
{
    public function create(
        Request $request,
        AdminMfaPreauthentication $preauthentication,
    ): Response|RedirectResponse {
        if ($preauthentication->pendingUser($request)) {
            return redirect()->route('ubsc-staff.mfa');
        }

        return Inertia::render('Admin/Auth/Login', [
            'status' => session('status'),
        ]);
    }

    public function store(
        AdminLoginRequest $request,
        AuthenticationRateLimiter $limiter,
        AdminMfaPreauthentication $preauthentication,
    ): RedirectResponse {
        $verifiedCredential = $request->verifyStaffCredentials($limiter);
        $preauthentication->start($request, $verifiedCredential);
        Inertia::clearHistory();

        return redirect()->route('ubsc-staff.mfa');
    }

    public function destroy(
        Request $request,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse {
        $sessions->logoutAndInvalidate($request);
        Inertia::clearHistory();

        return redirect()->route('ubsc-staff.login');
    }
}
