<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;

final class AdminMfaStepUp
{
    public const GRANT = 'ubsc.admin_mfa.management.grant';

    public const MUTATION_MFA_VERSION_ATTRIBUTE = 'ubsc.admin_mfa.management.mutation_version';

    public const MUTATION_MFA_METHOD_ATTRIBUTE = 'ubsc.admin_mfa.management.mutation_method';

    public const PASSKEY_REGISTRATION_META = 'ubsc.admin_mfa.management.passkey_registration_meta';

    public const PASSKEY_VERIFICATION_META = 'ubsc.admin_mfa.management.passkey_verification_meta';

    public const TOTP_ENROLLMENT_SECRET = 'ubsc.admin_mfa.management.totp_enrollment_secret';

    public const TOTP_ENROLLMENT_META = 'ubsc.admin_mfa.management.totp_enrollment_meta';

    public const RECOVERY_CODES = 'ubsc.admin_mfa.management.recovery_codes';

    public const RECOVERY_CODES_META = 'ubsc.admin_mfa.management.recovery_codes_meta';

    /** @var list<string> */
    public const PURPOSES = [
        'add_passkey',
        'remove_passkey',
        'replace_totp',
        'remove_totp',
        'rotate_recovery_codes',
        'manage_staff_accounts',
    ];

    public function __construct(
        private readonly AdminSessionSecurity $sessionSecurity,
        private readonly AuthSessionCoordinator $sessions,
    ) {}

    public function markVerified(
        Request $request,
        User $user,
        string $method,
        string $purpose,
    ): bool {
        if (! in_array($purpose, self::PURPOSES, true)) {
            return false;
        }

        $request->session()->put(self::GRANT, [
            ...$this->proofEnvelope($request, $user, $purpose),
            'method' => $method,
        ]);
        $this->clearCeremonies($request);

        return true;
    }

    public function isVerifiedFor(Request $request, User $user, string $purpose): bool
    {
        return $this->validGrant($request, $user, $purpose) !== null;
    }

    public function consume(Request $request, User $user, string $purpose): ?int
    {
        $grant = $this->validGrant($request, $user, $purpose);

        // Pull regardless of validity so a captured or stale grant cannot be
        // replayed after the account/session state changes.
        $request->session()->forget(self::GRANT);

        if ($grant === null) {
            return null;
        }

        $version = (int) $grant['mfa_version'];
        $request->attributes->set(self::MUTATION_MFA_VERSION_ATTRIBUTE, $version);
        $request->attributes->set(
            self::MUTATION_MFA_METHOD_ATTRIBUTE,
            (string) $grant['method'],
        );

        return $version;
    }

    /** @return array{verified:bool,password_verified:bool,mfa_verified:bool,expires_at:?string,method:?string,purpose:?string} */
    public function status(Request $request, User $user): array
    {
        $grant = $request->session()->get(self::GRANT);
        $purpose = is_array($grant) && is_string($grant['purpose'] ?? null)
            ? $grant['purpose']
            : '';
        $valid = $purpose !== '' ? $this->validGrant($request, $user, $purpose) : null;

        if ($valid === null) {
            $request->session()->forget(self::GRANT);

            return [
                'verified' => false,
                'password_verified' => false,
                'mfa_verified' => false,
                'expires_at' => null,
                'method' => null,
                'purpose' => null,
            ];
        }

        return [
            'verified' => true,
            'password_verified' => false,
            'mfa_verified' => true,
            'expires_at' => now()
                ->setTimestamp((int) $valid['issued_at'] + $this->ttlSeconds())
                ->toIso8601String(),
            'method' => $valid['method'] === 'recovery_code'
                ? 'recovery'
                : (string) $valid['method'],
            'purpose' => (string) $valid['purpose'],
        ];
    }

    public function synchronizeVersion(
        Request $request,
        int $version,
        ?string $verifiedMethod = null,
    ): void {
        $grant = $request->session()->get(self::GRANT);
        $method = $verifiedMethod
            ?? $request->attributes->get(self::MUTATION_MFA_METHOD_ATTRIBUTE)
            ?? (is_array($grant) && is_string($grant['method'] ?? null)
            ? (string) $grant['method']
            : null);

        if (! is_string($method)
            || ! in_array($method, ['passkey', 'totp', 'recovery_code'], true)) {
            $method = null;
        }

        $this->sessions->regenerate($request);
        $state = [
            AdminSessionSecurity::MFA_VERSION => $version,
            AdminSessionSecurity::ROTATED_AT => now()->getTimestamp(),
        ];

        if ($method !== null) {
            $state[AdminSessionSecurity::MFA_VERIFIED_AT] = now()->getTimestamp();
            $state[AdminSessionSecurity::MFA_METHOD] = $method;
        }

        $request->session()->put($state);
        $request->session()->forget(self::GRANT);
    }

    public function clear(Request $request): void
    {
        $request->session()->forget(self::GRANT);
        $this->clearCeremonies($request);
    }

    public function clearCeremonies(Request $request): void
    {
        $request->session()->forget([
            self::PASSKEY_REGISTRATION_META,
            self::PASSKEY_VERIFICATION_META,
            self::TOTP_ENROLLMENT_SECRET,
            self::TOTP_ENROLLMENT_META,
            self::RECOVERY_CODES,
            self::RECOVERY_CODES_META,
            'passkey.registration_options',
            'passkey.verification_options',
        ]);
    }

    /** @return array<string, mixed>|null */
    private function validGrant(Request $request, User $user, string $purpose): ?array
    {
        $grant = $request->session()->get(self::GRANT);
        $now = now()->getTimestamp();

        if (! is_array($grant)
            || ! in_array($purpose, self::PURPOSES, true)
            || (string) ($grant['user_id'] ?? '') !== (string) $user->getKey()
            || ($grant['purpose'] ?? null) !== $purpose
            || ! is_string($grant['method'] ?? null)
            || ! in_array($grant['method'], ['passkey', 'totp', 'recovery_code'], true)
            || ! is_string($grant['nonce'] ?? null)
            || strlen($grant['nonce']) !== 64
            || (int) ($grant['issued_at'] ?? 0) <= 0
            || (int) $grant['issued_at'] > $now + 30
            || $now - (int) $grant['issued_at'] >= $this->ttlSeconds()
            || (int) ($grant['mfa_version'] ?? 0) !== $this->currentVersion($user)
            || ! is_string($grant['session_fingerprint'] ?? null)
            || ! hash_equals($grant['session_fingerprint'], $this->sessionFingerprint($request))
            || ! is_string($grant['user_agent_fingerprint'] ?? null)
            || ! hash_equals(
                $grant['user_agent_fingerprint'],
                $this->sessionSecurity->fingerprint($request),
            )) {
            return null;
        }

        return $grant;
    }

    /** @return array<string, int|string> */
    private function proofEnvelope(Request $request, User $user, string $purpose): array
    {
        return [
            'user_id' => $user->getKey(),
            'issued_at' => now()->getTimestamp(),
            'purpose' => $purpose,
            'mfa_version' => $this->currentVersion($user),
            'session_fingerprint' => $this->sessionFingerprint($request),
            'user_agent_fingerprint' => $this->sessionSecurity->fingerprint($request),
            'nonce' => bin2hex(random_bytes(32)),
        ];
    }

    private function currentVersion(User $user): int
    {
        return (int) ($user->adminMfaSetting()->value('version') ?? 0);
    }

    private function sessionFingerprint(Request $request): string
    {
        $instance = $request->session()->get(AdminSessionSecurity::SESSION_INSTANCE);

        if (! is_string($instance) || strlen($instance) !== 64) {
            $instance = bin2hex(random_bytes(32));
            $request->session()->put(AdminSessionSecurity::SESSION_INSTANCE, $instance);
        }

        return hash_hmac(
            'sha256',
            $instance,
            (string) config('app.key'),
        );
    }

    private function ttlSeconds(): int
    {
        return max(
            1,
            (int) config('security.admin_mfa.management_step_up_minutes', 5),
        ) * 60;
    }
}
