<?php

namespace App\Services;

use Illuminate\Http\Request;

class AdminSessionSecurity
{
    public const ISSUED_AT = 'ubsc.admin_session.issued_at';

    public const LAST_ACTIVITY_AT = 'ubsc.admin_session.last_activity_at';

    public const ROTATED_AT = 'ubsc.admin_session.rotated_at';

    public const USER_AGENT_FINGERPRINT = 'ubsc.admin_session.user_agent';

    public const SESSION_INSTANCE = 'ubsc.admin_session.instance';

    public const MFA_VERIFIED_AT = 'ubsc.admin_session.mfa_verified_at';

    public const MFA_METHOD = 'ubsc.admin_session.mfa_method';

    public const MFA_VERSION = 'ubsc.admin_session.mfa_version';

    /**
     * Bind a newly authenticated staff session before its cookie leaves the
     * login response. This closes the race between login and the first admin
     * page request.
     */
    public function initialize(
        Request $request,
        ?int $timestamp = null,
        ?string $mfaMethod = null,
        ?int $mfaVersion = null,
    ): void {
        $timestamp ??= now()->getTimestamp();

        $state = [
            self::ISSUED_AT => $timestamp,
            self::LAST_ACTIVITY_AT => $timestamp,
            self::ROTATED_AT => $timestamp,
            self::USER_AGENT_FINGERPRINT => $this->fingerprint($request),
            self::SESSION_INSTANCE => bin2hex(random_bytes(32)),
        ];

        if ($mfaMethod !== null && $mfaVersion !== null) {
            $state[self::MFA_VERIFIED_AT] = $timestamp;
            $state[self::MFA_METHOD] = $mfaMethod;
            $state[self::MFA_VERSION] = $mfaVersion;
        }

        $request->session()->put($state);
    }

    public function fingerprint(Request $request): string
    {
        $userAgent = strtolower(trim((string) $request->userAgent()));
        $userAgent = preg_replace('/\s+/', ' ', $userAgent) ?: 'unknown';
        $key = (string) config('app.key', 'ubsc-admin-session');

        return hash_hmac('sha256', $userAgent, $key);
    }
}
