<?php

namespace App\Services;

use App\Models\User;
use App\Support\AdminAccess;
use App\Support\AuthenticationIdentity;
use App\Support\VerifiedAdminCredential;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class AdminMfaPreauthentication
{
    public const USER_ID = 'ubsc.admin_mfa.pending_user_id';

    public const ISSUED_AT = 'ubsc.admin_mfa.pending_issued_at';

    public const NONCE = 'ubsc.admin_mfa.pending_nonce';

    public const USER_AGENT = 'ubsc.admin_mfa.pending_user_agent';

    public const CREDENTIAL_FINGERPRINT = 'ubsc.admin_mfa.pending_credential_fingerprint';

    public const MFA_VERSION = 'ubsc.admin_mfa.pending_version';

    public const ENROLLMENT_METHOD = 'ubsc.admin_mfa.enrollment_method';

    public const RECOVERY_CODES = 'ubsc.admin_mfa.recovery_codes';

    public const RECOVERY_CODES_VERSION = 'ubsc.admin_mfa.recovery_codes_version';

    public const TOTP_ENROLLMENT_SECRET = 'ubsc.admin_mfa.totp_enrollment_secret';

    public const TOTP_ENROLLMENT_KIND = 'ubsc.admin_mfa.totp_enrollment_kind';

    public function __construct(
        private readonly AuthSessionCoordinator $sessions,
        private readonly AdminSessionSecurity $adminSession,
    ) {}

    public function start(
        Request $request,
        VerifiedAdminCredential $verifiedCredential,
    ): void {
        Auth::guard('web')->logout();
        $this->clear($request);
        $this->sessions->regenerate($request);

        [$credentialFingerprint, $mfaVersion] = DB::transaction(
            function () use ($verifiedCredential): array {
                $lockedUser = User::query()
                    ->whereKey($verifiedCredential->userId)
                    ->lockForUpdate()
                    ->first();

                if (! AdminAccess::allows($lockedUser)
                    || ! hash_equals(
                        $verifiedCredential->fingerprint,
                        $lockedUser === null
                            ? str_repeat('0', 64)
                            : $this->credentialFingerprint($lockedUser),
                    )) {
                    throw ValidationException::withMessages([
                        'email' => __('auth.failed'),
                    ]);
                }

                $setting = $lockedUser->adminMfaSetting()
                    ->firstOrCreate([], ['version' => 1]);

                return [
                    $this->credentialFingerprint($lockedUser),
                    (int) $setting->version,
                ];
            },
            3,
        );
        $request->session()->put([
            self::USER_ID => $verifiedCredential->userId,
            self::ISSUED_AT => now()->getTimestamp(),
            self::NONCE => bin2hex(random_bytes(32)),
            self::USER_AGENT => $this->adminSession->fingerprint($request),
            self::CREDENTIAL_FINGERPRINT => $credentialFingerprint,
            self::MFA_VERSION => $mfaVersion,
        ]);
    }

    public function pendingUser(Request $request): ?User
    {
        $session = $request->session();
        $userId = $session->get(self::USER_ID);
        $issuedAt = (int) $session->get(self::ISSUED_AT, 0);
        $nonce = $session->get(self::NONCE);
        $fingerprint = $session->get(self::USER_AGENT);
        $credentialFingerprint = $session->get(self::CREDENTIAL_FINGERPRINT);
        $mfaVersion = (int) $session->get(self::MFA_VERSION, 0);
        $now = now()->getTimestamp();
        $ttl = max(1, (int) config('security.admin_mfa.preauth_minutes', 5)) * 60;

        $validEnvelope = (is_int($userId) || ctype_digit((string) $userId))
            && $issuedAt > 0
            && $issuedAt <= $now + 30
            && $now - $issuedAt < $ttl
            && is_string($nonce)
            && strlen($nonce) === 64
            && is_string($fingerprint)
            && is_string($credentialFingerprint)
            && strlen($credentialFingerprint) === 64
            && $mfaVersion > 0
            && hash_equals($fingerprint, $this->adminSession->fingerprint($request));

        if (! $validEnvelope) {
            $this->clear($request);

            return null;
        }

        $user = User::query()->find((int) $userId);

        if (! AdminAccess::allows($user)) {
            $this->clear($request);

            return null;
        }

        $currentMfaVersion = (int) ($user->adminMfaSetting()->value('version') ?? 0);

        if (! hash_equals($credentialFingerprint, $this->credentialFingerprint($user))
            || $mfaVersion !== $currentMfaVersion) {
            $this->clear($request);

            return null;
        }

        return $user;
    }

    /** @param array<int, string> $recoveryCodes */
    public function markEnrollmentVerified(
        Request $request,
        string $method,
        array $recoveryCodes,
        int $recoveryCodesVersion,
    ): void {
        $request->session()->put([
            self::ENROLLMENT_METHOD => $method,
            self::RECOVERY_CODES => $recoveryCodes,
            self::RECOVERY_CODES_VERSION => $recoveryCodesVersion,
        ]);
    }

    /** @return array<int, string> */
    public function recoveryCodes(Request $request): array
    {
        $codes = $request->session()->get(self::RECOVERY_CODES, []);

        return is_array($codes)
            ? array_values(array_filter($codes, 'is_string'))
            : [];
    }

    public function recoveryCodesVersion(Request $request): ?int
    {
        $version = $request->session()->get(self::RECOVERY_CODES_VERSION);

        if (! is_int($version) && ! ctype_digit((string) $version)) {
            return null;
        }

        $version = (int) $version;

        return $version > 0 ? $version : null;
    }

    public function complete(Request $request, User $user, string $method): void
    {
        $pending = $this->pendingUser($request);

        abort_unless($pending?->is($user), 401);

        $pendingUserId = (int) $request->session()->get(self::USER_ID);
        $expectedCredentialFingerprint = (string) $request->session()
            ->get(self::CREDENTIAL_FINGERPRINT);
        $expectedMfaVersion = (int) $request->session()->get(self::MFA_VERSION);

        $completed = DB::transaction(function () use (
            $expectedCredentialFingerprint,
            $expectedMfaVersion,
            $method,
            $pendingUserId,
            $request,
            $user,
        ): bool {
            $lockedUser = User::query()
                ->whereKey($pendingUserId)
                ->lockForUpdate()
                ->first();

            if (! $lockedUser
                || ! $lockedUser->is($user)
                || ! AdminAccess::allows($lockedUser)
                || ! hash_equals(
                    $expectedCredentialFingerprint,
                    $this->credentialFingerprint($lockedUser),
                )) {
                return false;
            }

            $setting = $lockedUser->adminMfaSetting()
                ->lockForUpdate()
                ->first();

            if (! $setting
                || $expectedMfaVersion !== (int) $setting->version
                || $setting->enabled_at === null
                || $setting->recovery_codes_acknowledged_at === null
                || ($setting->totp_confirmed_at === null
                    && ! $lockedUser->hasPasskeysEnabled())) {
                return false;
            }

            $setting->forceFill([
                'last_verified_at' => now(),
                'last_verified_method' => $method,
            ])->save();

            // Keep the credential rows locked until the authenticated session
            // is fully initialized. A concurrent password replacement or MFA
            // reset must therefore run either entirely before this proof is
            // accepted, or afterwards and revoke the newly issued session.
            $this->clear($request);
            Auth::guard('web')->login($lockedUser, false);
            $this->sessions->regenerate($request);
            $this->adminSession->initialize(
                $request,
                mfaMethod: $method,
                mfaVersion: $expectedMfaVersion,
            );

            return true;
        });

        if (! $completed) {
            Auth::guard('web')->logout();
            $this->clear($request);

            abort(401);
        }

        Inertia::clearHistory();
        Log::notice('Admin MFA verification completed.', [
            'user_id' => $pendingUserId,
            'method' => $method,
        ]);
    }

    public function clear(Request $request): void
    {
        $request->session()->forget([
            self::USER_ID,
            self::ISSUED_AT,
            self::NONCE,
            self::USER_AGENT,
            self::CREDENTIAL_FINGERPRINT,
            self::MFA_VERSION,
            self::ENROLLMENT_METHOD,
            self::RECOVERY_CODES,
            self::RECOVERY_CODES_VERSION,
            self::TOTP_ENROLLMENT_SECRET,
            self::TOTP_ENROLLMENT_KIND,
            'passkey.registration_options',
            'passkey.verification_options',
            'ubsc.admin_mfa.passkey_registration_meta',
            'ubsc.admin_mfa.passkey_verification_meta',
        ]);
    }

    private function credentialFingerprint(User $user): string
    {
        return AuthenticationIdentity::credentialFingerprint(
            $user->getKey(),
            $user->getAuthPassword(),
        );
    }
}
