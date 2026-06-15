<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    /**
     * Spatie role names that constitute staff (bypass to admin portal).
     */
    private const STAFF_ROLES = [
        'Administrator',
        'Manager',
        'Finance',
        'Staff Central',
        'Staff Front Office',
    ];

    /**
     * Display the login view.
     *
     * If the already-authenticated user is a staff member, bounce them
     * to the admin dashboard so they never see the public login form.
     */
    public function create(): Response
    {
        $user = Auth::user();

        if ($user && $user->hasAnyRole(self::STAFF_ROLES)) {
            return redirect()->route('admin.dashboard', absolute: false);
        }

        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'status' => session('status'),
        ]);
    }

    public function store(LoginRequest $request): RedirectResponse
    {
        $request->authenticate();

        $user = Auth::user();

        // GATE 2: Staff accounts must use the staff portal
        if ($user->hasAnyRole(['Administrator', 'Manager', 'Finance', 'Staff Central', 'Staff Front Office'])) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
    }
}
