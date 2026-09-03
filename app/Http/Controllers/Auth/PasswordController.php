<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthSessionCoordinator;
use App\Services\CredentialSecurity;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;

class PasswordController extends Controller
{
    /**
     * Update the user's password.
     */
    public function update(
        Request $request,
        CredentialSecurity $credentials,
        AuthSessionCoordinator $sessions,
    ): RedirectResponse {
        $validated = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', Password::defaults(), 'confirmed'],
        ]);

        $user = $request->user();
        $isStaff = $credentials->replacePassword(
            $user,
            $validated['password'],
            $request->session()->getId(),
        );

        if ($isStaff) {
            $sessions->logoutAndInvalidate($request);
            Inertia::clearHistory();

            return redirect()
                ->route('ubsc-staff.login')
                ->with('status', 'Kata sandi diperbarui. Silakan masuk dan verifikasi MFA kembali.');
        }

        $sessions->regenerate($request);

        return back()->with('status', 'password-updated');
    }
}
