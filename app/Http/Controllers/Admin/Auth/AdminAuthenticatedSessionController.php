<?php

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\AuthSessionCoordinator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AdminAuthenticatedSessionController extends Controller
{
    private const STAFF_ROLES = [
        'Administrator',
        'Manager',
        'Finance',
        'Staff Central',
        'Staff Front Office',
    ];

    public function create(): Response
    {
        return Inertia::render('Admin/Auth/Login', [
            'status' => session('status'),
        ]);
    }

    public function store(
        LoginRequest $request,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse
    {
        $request->authenticate();

        $user = Auth::user();

        if (! $user->hasAnyRole(self::STAFF_ROLES)) {
            Auth::logout();
            $sessions->invalidate($request);
            Inertia::clearHistory();

            throw ValidationException::withMessages([
                'email' => 'Access Denied. You do not have staff privileges.',
            ]);
        }

        $sessions->regenerate($request);
        Inertia::clearHistory();

        return redirect()->intended(route('admin.dashboard'));
    }

    public function destroy(
        Request $request,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse
    {
        Auth::guard('web')->logout();
        $sessions->invalidate($request);
        Inertia::clearHistory();

        return redirect()->route('ubsc-staff.login');
    }
}
