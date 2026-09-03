<?php

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AdminPasskeyRegistrationRequest;
use App\Http\Requests\Auth\AdminPasskeyVerificationRequest;
use App\Models\User;
use App\Services\AdminMfaManager;
use App\Services\AdminMfaPreauthentication;
use App\Services\AuthenticationRateLimiter;
use App\Services\AuthSessionCoordinator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Passkeys\Actions\GenerateRegistrationOptions;
use Laravel\Passkeys\Actions\GenerateVerificationOptions;
use Laravel\Passkeys\Actions\StorePasskey;
use Laravel\Passkeys\Actions\VerifyPasskey;
use Laravel\Passkeys\Exceptions\InvalidPasskeyException;
use Laravel\Passkeys\Support\WebAuthn;
use Webauthn\Exception\WebauthnException;

class AdminMfaController extends Controller
{
    private const REGISTRATION_META = 'ubsc.admin_mfa.passkey_registration_meta';

    private const VERIFICATION_META = 'ubsc.admin_mfa.passkey_verification_meta';

    public function show(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
    ): Response {
        $user = $this->user($request);
        $setting = $user->adminMfaSetting()->first();
        $recoveryCodes = $preauthentication->recoveryCodes($request);

        return Inertia::render('Admin/Auth/Mfa', [
            'mode' => $mfa->isConfigured($user) ? 'challenge' : 'enroll',
            'staffName' => $user->name,
            'csrfToken' => $request->session()->token(),
            'preauthRemainingSeconds' => max(
                0,
                (int) $request->session()->get(
                    AdminMfaPreauthentication::ISSUED_AT,
                    now()->getTimestamp(),
                )
                    + max(1, (int) config('security.admin_mfa.preauth_minutes', 5)) * 60
                    - now()->getTimestamp(),
            ),
            'passkeyEnabled' => $user->hasPasskeysEnabled(),
            'totpEnabled' => $setting?->totp_confirmed_at !== null,
            'recoveryCodes' => $recoveryCodes,
            'recovery_codes_version' => $recoveryCodes === []
                ? null
                : $preauthentication->recoveryCodesVersion($request),
        ]);
    }

    public function passkeyRegistrationOptions(
        Request $request,
        AdminMfaManager $mfa,
        GenerateRegistrationOptions $generate,
    ): JsonResponse {
        $user = $this->user($request);

        if ($mfa->isConfigured($user)) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $options = $generate($user);
        $request->session()->put([
            'passkey.registration_options' => WebAuthn::toJson($options),
            self::REGISTRATION_META => $this->ceremonyMeta($user, 'register'),
        ]);

        return response()->json([
            'options' => WebAuthn::toBrowserArray($options),
        ]);
    }

    public function registerPasskey(
        AdminPasskeyRegistrationRequest $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
        AuthenticationRateLimiter $limiter,
        StorePasskey $store,
    ): JsonResponse {
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());

        if ($mfa->isConfigured($user)) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $this->validateCeremony($request, self::REGISTRATION_META, $user, 'register');
        $registrationOptions = $request->registrationOptions();

        try {
            $bundle = DB::transaction(function () use (
                $mfa,
                $registrationOptions,
                $request,
                $store,
                $user,
            ): array {
                $lockedUser = User::query()
                    ->whereKey($user->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($mfa->isConfigured($lockedUser)) {
                    throw ValidationException::withMessages([
                        'credential' => __('auth.mfa_invalid'),
                    ]);
                }

                $store(
                    $lockedUser,
                    $request->string('name')->toString(),
                    $request->credential(),
                    $registrationOptions,
                );

                return $mfa->enableAfterPasskeyEnrollment($lockedUser);
            }, 3);
        } catch (InvalidPasskeyException|WebauthnException) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_invalid'),
            ]);
        }

        $preauthentication->markEnrollmentVerified(
            $request,
            'passkey',
            $bundle['codes'],
            $bundle['version'],
        );
        $this->forgetTotpEnrollment($request);
        $limiter->mfaSucceeded($request, $user->getKey());

        return response()->json([
            'recovery_codes' => $bundle['codes'],
            'recovery_codes_version' => $bundle['version'],
        ]);
    }

    public function passkeyVerificationOptions(
        Request $request,
        GenerateVerificationOptions $generate,
    ): JsonResponse {
        $user = $this->user($request);

        if (! $user->hasPasskeysEnabled()) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $options = $generate($user);
        $request->session()->put([
            'passkey.verification_options' => WebAuthn::toJson($options),
            self::VERIFICATION_META => $this->ceremonyMeta($user, 'verify'),
        ]);

        return response()->json([
            'options' => WebAuthn::toBrowserArray($options),
        ]);
    }

    public function verifyPasskey(
        AdminPasskeyVerificationRequest $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
        AuthenticationRateLimiter $limiter,
        VerifyPasskey $verify,
    ): JsonResponse {
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());
        $this->validateCeremony($request, self::VERIFICATION_META, $user, 'verify');
        $verificationOptions = $request->verificationOptions();

        try {
            $verify(
                $request->credential(),
                $verificationOptions,
                $user,
            );
        } catch (InvalidPasskeyException|WebauthnException) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_invalid'),
            ]);
        }

        $limiter->mfaSucceeded($request, $user->getKey());

        return $this->finishVerifiedFactor(
            $request,
            $user,
            'passkey',
            $mfa,
            $preauthentication,
        );
    }

    public function totpOptions(
        Request $request,
        AdminMfaManager $mfa,
    ): JsonResponse {
        $user = $this->user($request);
        $secondary = $mfa->isConfigured($user);

        $options = $secondary
            ? ($this->isSecondaryTotpContext($request, $user)
                ? $mfa->beginSecondaryTotpEnrollment($user)
                : null)
            : $mfa->beginTotpEnrollment($user);

        if ($options === null) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $request->session()->put([
            AdminMfaPreauthentication::TOTP_ENROLLMENT_SECRET => $options['secret'],
            AdminMfaPreauthentication::TOTP_ENROLLMENT_KIND => $secondary
                ? 'secondary'
                : 'initial',
        ]);

        return response()->json($options);
    }

    public function enrollTotp(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
        AuthenticationRateLimiter $limiter,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['required', 'string', 'regex:/^\s*\d{3}\s*\d{3}\s*$/'],
        ]);
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());
        $secret = $request->session()->get(
            AdminMfaPreauthentication::TOTP_ENROLLMENT_SECRET,
        );
        $kind = $request->session()->get(
            AdminMfaPreauthentication::TOTP_ENROLLMENT_KIND,
        );

        if (! is_string($secret) || $secret === '') {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'code' => __('auth.mfa_invalid'),
            ]);
        }

        if ($mfa->isConfigured($user)) {
            if ($kind !== 'secondary'
                || ! $this->isSecondaryTotpContext($request, $user)
                || ! $mfa->confirmSecondaryTotpEnrollment(
                    $user,
                    $secret,
                    $validated['code'],
                )) {
                $limiter->mfaFailed($request, $user->getKey());

                throw ValidationException::withMessages([
                    'code' => __('auth.mfa_invalid'),
                ]);
            }

            $this->forgetTotpEnrollment($request);
            $limiter->mfaSucceeded($request, $user->getKey());

            return response()->json([
                'recovery_codes' => $preauthentication->recoveryCodes($request),
                'recovery_codes_version' => $preauthentication->recoveryCodesVersion($request),
                'secondary_totp_enabled' => true,
            ]);
        }

        $bundle = $kind === 'initial'
            ? $mfa->confirmTotpEnrollment($user, $secret, $validated['code'])
            : null;

        if ($bundle === null) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'code' => __('auth.mfa_invalid'),
            ]);
        }

        $preauthentication->markEnrollmentVerified(
            $request,
            'totp',
            $bundle['codes'],
            $bundle['version'],
        );
        $this->forgetTotpEnrollment($request);
        $limiter->mfaSucceeded($request, $user->getKey());

        return response()->json([
            'recovery_codes' => $bundle['codes'],
            'recovery_codes_version' => $bundle['version'],
        ]);
    }

    public function verifyTotp(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
        AuthenticationRateLimiter $limiter,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['required', 'string', 'regex:/^\s*\d{3}\s*\d{3}\s*$/'],
        ]);
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());

        if (! $mfa->verifyTotp($user, $validated['code'])) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'code' => __('auth.mfa_invalid'),
            ]);
        }

        $limiter->mfaSucceeded($request, $user->getKey());

        return $this->finishVerifiedFactor(
            $request,
            $user,
            'totp',
            $mfa,
            $preauthentication,
        );
    }

    public function useRecoveryCode(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
        AuthenticationRateLimiter $limiter,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:128'],
        ]);
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());

        if (! $mfa->consumeRecoveryCode($user, $validated['code'])) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'code' => __('auth.mfa_invalid'),
            ]);
        }

        $limiter->mfaSucceeded($request, $user->getKey());

        return $this->finishVerifiedFactor(
            $request,
            $user,
            'recovery_code',
            $mfa,
            $preauthentication,
        );
    }

    public function acknowledgeRecoveryCodes(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
        AuthSessionCoordinator $sessions,
    ): JsonResponse {
        $validated = $request->validate([
            'acknowledged' => ['accepted'],
            'recovery_codes_version' => ['required', 'integer', 'min:1'],
        ]);
        $user = $this->user($request);
        $method = $request->session()->get(AdminMfaPreauthentication::ENROLLMENT_METHOD);
        $codes = $preauthentication->recoveryCodes($request);
        $submittedCodesVersion = (int) $validated['recovery_codes_version'];
        $sessionCodesVersion = $preauthentication->recoveryCodesVersion($request);

        if (! in_array($method, ['passkey', 'totp', 'recovery_code'], true) || $codes === []) {
            throw ValidationException::withMessages([
                'acknowledged' => __('auth.mfa_invalid'),
            ]);
        }

        if ($sessionCodesVersion === null
            || $submittedCodesVersion !== $sessionCodesVersion
            || ! $mfa->acknowledgeRecoveryCodes($user, $submittedCodesVersion)) {
            return $this->restartAfterStaleRecoveryCodes(
                $request,
                $preauthentication,
                $sessions,
            );
        }

        $preauthentication->complete($request, $user, $method);

        return response()->json(['redirect' => route('admin.dashboard')]);
    }

    public function cancel(
        Request $request,
        AdminMfaPreauthentication $preauthentication,
        AuthSessionCoordinator $sessions,
    ): JsonResponse|RedirectResponse {
        $preauthentication->clear($request);
        $sessions->invalidate($request);
        Inertia::clearHistory();

        if ($request->expectsJson()) {
            return response()->json([
                'redirect' => route('ubsc-staff.login'),
            ]);
        }

        return redirect()->route('ubsc-staff.login');
    }

    private function user(Request $request): User
    {
        $user = $request->attributes->get('admin_mfa_user');
        abort_unless($user instanceof User, 401);

        return $user;
    }

    /** @return array{user_id:int|string, intent:string, issued_at:int, nonce:string} */
    private function ceremonyMeta(User $user, string $intent): array
    {
        return [
            'user_id' => $user->getKey(),
            'intent' => $intent,
            'issued_at' => now()->getTimestamp(),
            'nonce' => bin2hex(random_bytes(16)),
        ];
    }

    private function validateCeremony(
        Request $request,
        string $sessionKey,
        User $user,
        string $intent,
    ): void {
        $meta = $request->session()->pull($sessionKey);
        $issuedAt = is_array($meta) ? (int) ($meta['issued_at'] ?? 0) : 0;
        $ttl = max(30, (int) config('security.admin_mfa.challenge_seconds', 90));
        $valid = is_array($meta)
            && (string) ($meta['user_id'] ?? '') === (string) $user->getKey()
            && ($meta['intent'] ?? null) === $intent
            && is_string($meta['nonce'] ?? null)
            && strlen($meta['nonce']) === 32
            && $issuedAt > 0
            && $issuedAt <= now()->getTimestamp() + 30
            && now()->getTimestamp() - $issuedAt <= $ttl;

        if (! $valid) {
            $request->session()->forget([
                'passkey.registration_options',
                'passkey.verification_options',
            ]);

            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_expired'),
            ]);
        }
    }

    private function finishVerifiedFactor(
        Request $request,
        User $user,
        string $method,
        AdminMfaManager $mfa,
        AdminMfaPreauthentication $preauthentication,
    ): JsonResponse {
        $bundle = $mfa->reissueUnacknowledgedRecoveryCodes($user);

        if ($bundle !== null) {
            $preauthentication->markEnrollmentVerified(
                $request,
                $method,
                $bundle['codes'],
                $bundle['version'],
            );

            return response()->json([
                'recovery_codes' => $bundle['codes'],
                'recovery_codes_version' => $bundle['version'],
            ]);
        }

        $preauthentication->complete($request, $user, $method);

        return response()->json(['redirect' => route('admin.dashboard')]);
    }

    private function isSecondaryTotpContext(Request $request, User $user): bool
    {
        return $user->hasPasskeysEnabled()
            && $request->session()->get(AdminMfaPreauthentication::ENROLLMENT_METHOD) === 'passkey'
            && $request->session()->has(AdminMfaPreauthentication::RECOVERY_CODES_VERSION)
            && $request->session()->get(AdminMfaPreauthentication::RECOVERY_CODES, []) !== [];
    }

    private function forgetTotpEnrollment(Request $request): void
    {
        $request->session()->forget([
            AdminMfaPreauthentication::TOTP_ENROLLMENT_SECRET,
            AdminMfaPreauthentication::TOTP_ENROLLMENT_KIND,
        ]);
    }

    private function restartAfterStaleRecoveryCodes(
        Request $request,
        AdminMfaPreauthentication $preauthentication,
        AuthSessionCoordinator $sessions,
    ): JsonResponse {
        $preauthentication->clear($request);
        $sessions->invalidate($request);
        Inertia::clearHistory();

        return response()->json([
            'message' => __('auth.mfa_expired'),
            'redirect' => route('ubsc-staff.login'),
        ], 409);
    }
}
