<?php

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AdminPasskeyRegistrationRequest;
use App\Http\Requests\Auth\AdminPasskeyVerificationRequest;
use App\Models\AdminMfaSetting;
use App\Models\User;
use App\Services\AdminMfaManager;
use App\Services\AdminMfaStepUp;
use App\Services\AdminSessionSecurity;
use App\Services\AuthenticationRateLimiter;
use App\Services\CredentialSecurity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Passkeys\Actions\GenerateRegistrationOptions;
use Laravel\Passkeys\Actions\GenerateVerificationOptions;
use Laravel\Passkeys\Actions\StorePasskey;
use Laravel\Passkeys\Actions\VerifyPasskey;
use Laravel\Passkeys\Exceptions\InvalidPasskeyException;
use Laravel\Passkeys\Support\WebAuthn;
use Throwable;
use Webauthn\Exception\WebauthnException;

final class AdminMfaManagementController extends Controller
{
    public function show(Request $request, AdminMfaStepUp $stepUp): JsonResponse
    {
        $user = $this->user($request);
        $setting = $user->adminMfaSetting()->first();
        $passkeys = $user->passkeys()
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->get();
        $recoveryCodesRemaining = is_array($setting?->recovery_codes)
            ? count($setting->recovery_codes)
            : 0;
        $methods = [];

        if ($passkeys->isNotEmpty()) {
            $methods[] = 'passkey';
        }

        if ($setting?->totp_confirmed_at !== null) {
            $methods[] = 'totp';
        }

        if ($recoveryCodesRemaining > 0) {
            $methods[] = 'recovery';
        }

        return response()->json([
            'csrf_token' => $request->session()->token(),
            'mfa' => [
                'enabled' => $setting?->enabled_at !== null,
                'required' => true,
                'passkeys' => $passkeys->map(fn ($passkey): array => [
                    'id' => $passkey->getKey(),
                    'name' => $passkey->name,
                    'authenticator' => $passkey->authenticator,
                    'created_at' => $passkey->created_at?->toIso8601String(),
                    'last_used_at' => $passkey->last_used_at?->toIso8601String(),
                    'can_remove' => $passkeys->count() > 1
                        || $setting?->totp_confirmed_at !== null,
                ])->values(),
                'totp' => [
                    'enabled' => $setting?->totp_confirmed_at !== null,
                    'confirmed_at' => $setting?->totp_confirmed_at?->toIso8601String(),
                    'can_remove' => $setting?->totp_confirmed_at !== null
                        && $passkeys->isNotEmpty(),
                ],
                'recovery_codes' => [
                    'remaining' => $recoveryCodesRemaining,
                    'total' => max(
                        6,
                        min(20, (int) config('security.admin_mfa.recovery_code_count', 10)),
                    ),
                    'generated_at' => $setting?->recovery_codes_generated_at?->toIso8601String(),
                ],
                'last_verified_at' => $setting?->last_verified_at?->toIso8601String(),
                'last_verified_method' => $setting?->last_verified_method,
            ],
            'step_up' => [
                ...$stepUp->status($request, $user),
                'methods' => $methods,
            ],
        ])->withHeaders($this->privateHeaders());
    }

    public function stepUpPasskeyOptions(
        Request $request,
        GenerateVerificationOptions $generate,
    ): JsonResponse {
        $validated = $request->validate([
            'purpose' => ['required', 'string', Rule::in(AdminMfaStepUp::PURPOSES)],
        ]);
        $user = $this->user($request);

        if (! $user->hasPasskeysEnabled()) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $options = $generate($user);
        $request->session()->put([
            'passkey.verification_options' => WebAuthn::toJson($options),
            AdminMfaStepUp::PASSKEY_VERIFICATION_META => $this->ceremonyMeta(
                $request,
                $user,
                'management-step-up',
                $validated['purpose'],
            ),
        ]);

        return response()->json([
            'options' => WebAuthn::toBrowserArray($options),
        ])->withHeaders($this->privateHeaders());
    }

    public function stepUpPasskey(
        AdminPasskeyVerificationRequest $request,
        AdminMfaStepUp $stepUp,
        AuthenticationRateLimiter $limiter,
        VerifyPasskey $verify,
    ): JsonResponse {
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());
        $meta = $this->validateCeremony(
            $request,
            AdminMfaStepUp::PASSKEY_VERIFICATION_META,
            $user,
            'management-step-up',
        );

        $purpose = $meta['purpose'] ?? null;

        if (! is_string($purpose) || ! in_array($purpose, AdminMfaStepUp::PURPOSES, true)) {
            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_expired'),
            ]);
        }

        try {
            $verify($request->credential(), $request->verificationOptions(), $user);
        } catch (InvalidPasskeyException|WebauthnException) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_invalid'),
            ]);
        }

        $limiter->mfaSucceeded($request, $user->getKey());
        $stepUp->markVerified($request, $user, 'passkey', $purpose);

        return response()->json([
            'step_up' => $stepUp->status($request, $user),
        ])->withHeaders($this->privateHeaders());
    }

    public function stepUpTotp(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaStepUp $stepUp,
        AuthenticationRateLimiter $limiter,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['required', 'string', 'regex:/^\s*\d{3}\s*\d{3}\s*$/'],
            'purpose' => ['required', 'string', Rule::in(AdminMfaStepUp::PURPOSES)],
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
        $stepUp->markVerified($request, $user, 'totp', $validated['purpose']);

        return response()->json([
            'step_up' => $stepUp->status($request, $user),
        ])->withHeaders($this->privateHeaders());
    }

    public function stepUpRecoveryCode(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaStepUp $stepUp,
        AuthenticationRateLimiter $limiter,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:128'],
            'purpose' => ['required', 'string', Rule::in(AdminMfaStepUp::PURPOSES)],
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
        $stepUp->markVerified($request, $user, 'recovery_code', $validated['purpose']);

        return response()->json([
            'step_up' => $stepUp->status($request, $user),
        ])->withHeaders($this->privateHeaders());
    }

    public function passkeyRegistrationOptions(
        Request $request,
        GenerateRegistrationOptions $generate,
    ): JsonResponse {
        $user = $this->user($request);
        $options = $generate($user);
        $request->session()->put([
            'passkey.registration_options' => WebAuthn::toJson($options),
            AdminMfaStepUp::PASSKEY_REGISTRATION_META => $this->ceremonyMeta(
                $request,
                $user,
                'management-register',
                'add_passkey',
                $this->mutationVersion($request),
            ),
        ]);

        return response()->json([
            'options' => WebAuthn::toBrowserArray($options),
        ])->withHeaders($this->privateHeaders());
    }

    public function storePasskey(
        AdminPasskeyRegistrationRequest $request,
        AdminMfaStepUp $stepUp,
        CredentialSecurity $credentials,
        StorePasskey $store,
    ): JsonResponse {
        $user = $this->user($request);
        $meta = $this->validateCeremony(
            $request,
            AdminMfaStepUp::PASSKEY_REGISTRATION_META,
            $user,
            'management-register',
            'add_passkey',
        );
        $registrationOptions = $request->registrationOptions();
        $credential = $request->credential();
        $name = $request->string('name')->trim()->toString();

        try {
            $version = DB::transaction(function () use (
                $credential,
                $meta,
                $name,
                $registrationOptions,
                $store,
                $user,
            ): int {
                $lockedUser = User::query()
                    ->whereKey($user->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();
                $setting = AdminMfaSetting::query()
                    ->where('user_id', $lockedUser->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();
                $lockedUser->passkeys()->lockForUpdate()->get(['id']);

                if ((int) $setting->version !== (int) $meta['mfa_version']
                    || $setting->enabled_at === null
                    || $setting->recovery_codes_acknowledged_at === null) {
                    throw ValidationException::withMessages([
                        'credential' => __('auth.mfa_expired'),
                    ]);
                }

                $store(
                    $lockedUser,
                    $name,
                    $credential,
                    $registrationOptions,
                );

                $version = max(1, (int) $setting->version) + 1;
                $setting->forceFill(['version' => $version])->save();

                return $version;
            }, 3);
        } catch (InvalidPasskeyException|WebauthnException) {
            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_invalid'),
            ]);
        }

        $this->finalizeCredentialMutation(
            $request,
            $user,
            $version,
            'passkey_added',
            $stepUp,
            $credentials,
            (string) $meta['mfa_method'],
        );

        return response()->json([
            'message' => 'Passkey berhasil ditambahkan.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function renamePasskey(
        Request $request,
        int $passkeyId,
    ): JsonResponse {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);
        $user = $this->user($request);

        DB::transaction(function () use (
            $passkeyId,
            $user,
            $validated,
        ): void {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $ownedPasskey = $lockedUser->passkeys()
                ->whereKey($passkeyId)
                ->lockForUpdate()
                ->firstOrFail();

            $ownedPasskey->forceFill([
                'name' => trim($validated['name']),
            ])->save();
        }, 3);

        $this->audit('Admin passkey label changed.', [
            'user_id' => $user->getKey(),
            'event' => 'passkey_renamed',
        ]);

        return response()->json([
            'message' => 'Nama passkey berhasil diperbarui.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function destroyPasskey(
        Request $request,
        int $passkeyId,
        AdminMfaManager $mfa,
        AdminMfaStepUp $stepUp,
        CredentialSecurity $credentials,
    ): JsonResponse {
        $user = $this->user($request);
        $expectedVersion = (int) $request->attributes->get(
            AdminMfaStepUp::MUTATION_MFA_VERSION_ATTRIBUTE,
            0,
        );
        $version = $mfa->removeManagedPasskey($user, $passkeyId, $expectedVersion);

        if ($version === null) {
            throw ValidationException::withMessages([
                'passkey' => 'Passkey tidak dapat dihapus. Akun admin wajib memiliki sedikitnya satu faktor MFA aktif.',
            ]);
        }

        $this->finalizeCredentialMutation(
            $request,
            $user,
            $version,
            'passkey_removed',
            $stepUp,
            $credentials,
        );

        return response()->json([
            'message' => 'Passkey berhasil dihapus.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function totpOptions(
        Request $request,
        AdminMfaManager $mfa,
    ): JsonResponse {
        $user = $this->user($request);
        $mutationVersion = $this->mutationVersion($request);
        $options = $mfa->beginManagedTotpEnrollment($user, $mutationVersion);

        if ($options === null) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $request->session()->put([
            AdminMfaStepUp::TOTP_ENROLLMENT_SECRET => $options['secret'],
            AdminMfaStepUp::TOTP_ENROLLMENT_META => $this->ceremonyMeta(
                $request,
                $user,
                'management-totp',
                'replace_totp',
                $mutationVersion,
            ),
        ]);

        return response()->json($options)->withHeaders($this->privateHeaders());
    }

    public function storeTotp(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaStepUp $stepUp,
        AuthenticationRateLimiter $limiter,
        CredentialSecurity $credentials,
    ): JsonResponse {
        $validated = $request->validate([
            'code' => ['required', 'string', 'regex:/^\s*\d{3}\s*\d{3}\s*$/'],
        ]);
        $user = $this->user($request);
        $limiter->beginMfa($request, $user->getKey());
        $meta = $this->validateCeremony(
            $request,
            AdminMfaStepUp::TOTP_ENROLLMENT_META,
            $user,
            'management-totp',
            'replace_totp',
        );
        $secret = $request->session()->pull(AdminMfaStepUp::TOTP_ENROLLMENT_SECRET);

        if (! is_string($secret) || $secret === '') {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'code' => __('auth.mfa_expired'),
            ]);
        }

        $version = $mfa->confirmManagedTotpEnrollment(
            $user,
            $secret,
            $validated['code'],
            (int) $meta['mfa_version'],
        );

        if ($version === null) {
            $limiter->mfaFailed($request, $user->getKey());

            throw ValidationException::withMessages([
                'code' => __('auth.mfa_invalid'),
            ]);
        }

        $limiter->mfaSucceeded($request, $user->getKey());
        $this->finalizeCredentialMutation(
            $request,
            $user,
            $version,
            'totp_replaced',
            $stepUp,
            $credentials,
            (string) $meta['mfa_method'],
        );

        return response()->json([
            'message' => 'Aplikasi authenticator berhasil diperbarui.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function destroyTotp(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaStepUp $stepUp,
        CredentialSecurity $credentials,
    ): JsonResponse {
        $user = $this->user($request);
        $expectedVersion = (int) $request->attributes->get(
            AdminMfaStepUp::MUTATION_MFA_VERSION_ATTRIBUTE,
            0,
        );
        $version = $mfa->removeManagedTotp($user, $expectedVersion);

        if ($version === null) {
            throw ValidationException::withMessages([
                'totp' => 'Authenticator tidak dapat dihapus sebelum passkey aktif tersedia.',
            ]);
        }

        $this->finalizeCredentialMutation(
            $request,
            $user,
            $version,
            'totp_removed',
            $stepUp,
            $credentials,
        );

        return response()->json([
            'message' => 'Aplikasi authenticator berhasil dihapus.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function recoveryCodes(
        Request $request,
        AdminMfaManager $mfa,
    ): JsonResponse {
        $user = $this->user($request);
        $mutationVersion = $this->mutationVersion($request);
        $bundle = $mfa->beginManagedRecoveryCodeRotation($user, $mutationVersion);

        if ($bundle === null) {
            return response()->json(['message' => __('auth.mfa_invalid')], 409);
        }

        $request->session()->put([
            AdminMfaStepUp::RECOVERY_CODES => $bundle['codes'],
            AdminMfaStepUp::RECOVERY_CODES_META => [
                ...$this->ceremonyMeta(
                    $request,
                    $user,
                    'management-recovery',
                    'rotate_recovery_codes',
                    $mutationVersion,
                ),
                'recovery_codes_version' => $bundle['recovery_codes_version'],
            ],
        ]);

        return response()->json([
            'recovery_codes' => $bundle['codes'],
            'recovery_codes_version' => $bundle['recovery_codes_version'],
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function acknowledgeRecoveryCodes(
        Request $request,
        AdminMfaManager $mfa,
        AdminMfaStepUp $stepUp,
        CredentialSecurity $credentials,
    ): JsonResponse {
        $validated = $request->validate([
            'acknowledged' => ['accepted'],
            'recovery_codes_version' => ['required', 'integer', 'min:1'],
        ]);
        $user = $this->user($request);
        $meta = $this->validateCeremony(
            $request,
            AdminMfaStepUp::RECOVERY_CODES_META,
            $user,
            'management-recovery',
            'rotate_recovery_codes',
        );
        $codes = $request->session()->pull(AdminMfaStepUp::RECOVERY_CODES, []);
        $recoveryCodesVersion = (int) $validated['recovery_codes_version'];

        if (! is_array($codes)
            || $codes === []
            || $recoveryCodesVersion !== (int) ($meta['recovery_codes_version'] ?? 0)) {
            throw ValidationException::withMessages([
                'acknowledged' => __('auth.mfa_expired'),
            ]);
        }

        $version = $mfa->confirmManagedRecoveryCodeRotation(
            $user,
            $codes,
            $recoveryCodesVersion,
            (int) $meta['mfa_version'],
        );

        if ($version === null) {
            throw ValidationException::withMessages([
                'acknowledged' => __('auth.mfa_expired'),
            ]);
        }

        $this->finalizeCredentialMutation(
            $request,
            $user,
            $version,
            'recovery_codes_rotated',
            $stepUp,
            $credentials,
            (string) $meta['mfa_method'],
        );

        return response()->json([
            'message' => 'Kode pemulihan baru telah diaktifkan.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    public function cancelRecoveryCodes(Request $request): JsonResponse
    {
        $request->session()->forget([
            AdminMfaStepUp::RECOVERY_CODES,
            AdminMfaStepUp::RECOVERY_CODES_META,
            AdminMfaStepUp::GRANT,
        ]);

        return response()->json([
            'message' => 'Pembuatan kode pemulihan dibatalkan. Kode sebelumnya tetap aktif.',
            'csrf_token' => $request->session()->token(),
        ])->withHeaders($this->privateHeaders());
    }

    /**
     * @return array{user_id:int|string,intent:string,purpose:?string,issued_at:int,nonce:string,mfa_version:int,mfa_method:?string,session_fingerprint:string}
     */
    private function ceremonyMeta(
        Request $request,
        User $user,
        string $intent,
        ?string $purpose = null,
        ?int $mfaVersion = null,
    ): array {
        return [
            'user_id' => $user->getKey(),
            'intent' => $intent,
            'purpose' => $purpose,
            'issued_at' => now()->getTimestamp(),
            'nonce' => bin2hex(random_bytes(16)),
            'mfa_version' => $mfaVersion
                ?? (int) ($user->adminMfaSetting()->value('version') ?? 0),
            'mfa_method' => $mfaVersion === null
                ? null
                : $this->mutationMethod($request),
            'session_fingerprint' => $this->ceremonySessionFingerprint($request),
        ];
    }

    /** @return array<string, mixed> */
    private function validateCeremony(
        Request $request,
        string $sessionKey,
        User $user,
        string $intent,
        ?string $purpose = null,
    ): array {
        $meta = $request->session()->pull($sessionKey);
        $issuedAt = is_array($meta) ? (int) ($meta['issued_at'] ?? 0) : 0;
        $ttl = $this->ceremonyTtlSeconds($intent);
        $currentVersion = (int) ($user->adminMfaSetting()->value('version') ?? 0);
        $sessionFingerprint = $this->ceremonySessionFingerprint($request);
        $valid = is_array($meta)
            && (string) ($meta['user_id'] ?? '') === (string) $user->getKey()
            && ($meta['intent'] ?? null) === $intent
            && ($purpose === null || ($meta['purpose'] ?? null) === $purpose)
            && is_string($meta['nonce'] ?? null)
            && strlen($meta['nonce']) === 32
            && $issuedAt > 0
            && $issuedAt <= now()->getTimestamp() + 30
            && now()->getTimestamp() - $issuedAt < $ttl
            && (int) ($meta['mfa_version'] ?? 0) === $currentVersion
            && ($intent === 'management-step-up'
                || (is_string($meta['mfa_method'] ?? null)
                    && in_array($meta['mfa_method'], ['passkey', 'totp', 'recovery_code'], true)))
            && is_string($meta['session_fingerprint'] ?? null)
            && hash_equals($meta['session_fingerprint'], $sessionFingerprint);

        if (! $valid) {
            $this->clearCeremonyArtifacts($request, $intent);

            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_expired'),
            ]);
        }

        return $meta;
    }

    private function mutationVersion(Request $request): int
    {
        $version = (int) $request->attributes->get(
            AdminMfaStepUp::MUTATION_MFA_VERSION_ATTRIBUTE,
            0,
        );

        if ($version < 1) {
            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_expired'),
            ]);
        }

        return $version;
    }

    private function mutationMethod(Request $request): string
    {
        $method = $request->attributes->get(
            AdminMfaStepUp::MUTATION_MFA_METHOD_ATTRIBUTE,
        );

        if (! is_string($method)
            || ! in_array($method, ['passkey', 'totp', 'recovery_code'], true)) {
            throw ValidationException::withMessages([
                'credential' => __('auth.mfa_expired'),
            ]);
        }

        return $method;
    }

    private function ceremonySessionFingerprint(Request $request): string
    {
        $instance = $request->session()->get(AdminSessionSecurity::SESSION_INSTANCE);

        if (! is_string($instance) || strlen($instance) !== 64) {
            $instance = bin2hex(random_bytes(32));
            $request->session()->put(AdminSessionSecurity::SESSION_INSTANCE, $instance);
        }

        return hash_hmac('sha256', $instance, (string) config('app.key'));
    }

    private function ceremonyTtlSeconds(string $intent): int
    {
        if (in_array($intent, ['management-totp', 'management-recovery'], true)) {
            return max(
                1,
                min(
                    30,
                    (int) config('security.admin_mfa.management_ceremony_minutes', 10),
                ),
            ) * 60;
        }

        return max(
            30,
            min(300, (int) config('security.admin_mfa.challenge_seconds', 90)),
        );
    }

    private function clearCeremonyArtifacts(Request $request, string $intent): void
    {
        $keys = match ($intent) {
            'management-step-up' => ['passkey.verification_options'],
            'management-register' => ['passkey.registration_options'],
            'management-totp' => [AdminMfaStepUp::TOTP_ENROLLMENT_SECRET],
            'management-recovery' => [AdminMfaStepUp::RECOVERY_CODES],
            default => [],
        };

        if ($keys !== []) {
            $request->session()->forget($keys);
        }
    }

    private function finalizeCredentialMutation(
        Request $request,
        User $user,
        int $version,
        string $event,
        AdminMfaStepUp $stepUp,
        CredentialSecurity $credentials,
        ?string $verifiedMethod = null,
    ): void {
        $stepUp->synchronizeVersion($request, $version, $verifiedMethod);
        $credentials->purgePersistedSessions(
            $user->getAuthIdentifier(),
            $request->session()->getId(),
        );

        $this->audit('Admin MFA configuration changed.', [
            'user_id' => $user->getKey(),
            'event' => $event,
            'version' => $version,
        ]);
    }

    /** @param array<string, int|string> $context */
    private function audit(string $message, array $context): void
    {
        try {
            Log::notice($message, $context);
        } catch (Throwable) {
            // The credential mutation is authoritative. A transient logging
            // outage must not turn a completed security change into a 500.
        }
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    /** @return array<string, string> */
    private function privateHeaders(): array
    {
        return [
            'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ];
    }
}
