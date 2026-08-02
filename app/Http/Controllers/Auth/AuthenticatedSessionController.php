<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\AuthSessionCoordinator;
use App\Support\PublicReturnPath;
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

    public function store(
        LoginRequest $request,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse {
        $request->authenticate();

        $user = Auth::user();

        // GATE 2: Staff accounts must use the staff portal
        if ($user->hasAnyRole(['Administrator', 'Manager', 'Finance', 'Staff Central', 'Staff Front Office'])) {
            Auth::logout();
            $sessions->invalidate($request);
            Inertia::clearHistory();

            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        $sessions->regenerate($request);

        if ($returnTo = PublicReturnPath::normalize($request->input('return_to'))) {
            $request->session()->put('url.intended', $returnTo);
        }

        Inertia::clearHistory();

        return redirect()->intended('/');
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(
        Request $request,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse {
        $returnTo = PublicReturnPath::normalize(
            $request->input('return_to'),
        ) ?? '/';

        Auth::guard('web')->logout();

        $sessions->invalidate($request);
        Inertia::clearHistory();

        return redirect()->to($returnTo);
    }

    /**
     * Return the server-authoritative authentication state.
     *
     * The frontend uses this deliberately small, non-cacheable response to
     * reconcile pages restored by browser history or the back-forward cache.
     */
    public function state(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();

        return response()
            ->json([
                'authenticated' => $user !== null,
                'user_id' => $user?->getAuthIdentifier(),
            ])
            ->withHeaders([
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0',
                'Vary' => 'Cookie',
            ]);
    }
}
