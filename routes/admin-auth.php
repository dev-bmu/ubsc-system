<?php

use App\Http\Controllers\Admin\Auth\AdminAuthenticatedSessionController;
use App\Http\Controllers\Admin\Auth\AdminMfaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin Authentication Routes  (/ubsc-staff/*)
|--------------------------------------------------------------------------
|
| Staff-only login portal. Only users with Spatie admin roles are allowed
| through the gate. No registration endpoint exists here.
|
| Note: The /ubsc-staff prefix is applied in bootstrap/app.php so this
| file can be re-used by dropping in a different prefix if needed.
| The web middleware stack (StartSession, etc.) is explicitly listed here
| because admin-auth.php is loaded via then: (after the web stack).
|
*/

Route::middleware(['web', 'guest'])->group(function () {
    Route::get('login', [AdminAuthenticatedSessionController::class, 'create'])
        ->name('ubsc-staff.login');

    Route::post('login', [AdminAuthenticatedSessionController::class, 'store'])
        ->middleware('throttle:admin-login-edge')
        ->name('ubsc-staff.login.store');
});

Route::middleware(['web', 'guest', 'admin.mfa.payload', 'admin.mfa.preauth'])->group(function () {
    Route::get('mfa', [AdminMfaController::class, 'show'])
        ->name('ubsc-staff.mfa');

    Route::get('mfa/passkey/register/options', [AdminMfaController::class, 'passkeyRegistrationOptions'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/passkey/register', [AdminMfaController::class, 'registerPasskey'])
        ->middleware('throttle:admin-mfa-options');
    Route::get('mfa/passkey/verify/options', [AdminMfaController::class, 'passkeyVerificationOptions'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/passkey/verify', [AdminMfaController::class, 'verifyPasskey'])
        ->middleware('throttle:admin-mfa-options');

    Route::post('mfa/totp/options', [AdminMfaController::class, 'totpOptions'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/totp/enroll', [AdminMfaController::class, 'enrollTotp'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/totp/verify', [AdminMfaController::class, 'verifyTotp'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/recovery', [AdminMfaController::class, 'useRecoveryCode'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/recovery-codes/acknowledge', [AdminMfaController::class, 'acknowledgeRecoveryCodes'])
        ->middleware('throttle:admin-mfa-options');
    Route::post('mfa/cancel', [AdminMfaController::class, 'cancel']);
});

// Dedicated admin logout — avoids conflict with the public logout route
Route::middleware([
    'web',
    'auth',
    'auth.session',
    'role:Administrator|Manager|Finance|Staff Front Office|Staff Central',
    'admin.session',
])->group(function () {
    Route::post('logout', [AdminAuthenticatedSessionController::class, 'destroy'])
        ->name('ubsc-staff.logout');
});
