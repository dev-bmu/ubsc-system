<?php

namespace App\Http\Middleware;

use App\Services\AdminSessionSecurity;
use App\Services\AuthSessionCoordinator;
use App\Support\AdminSessionRoutePolicy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class EnforceAdminSessionSecurity
{
    public function __construct(
        private readonly AuthSessionCoordinator $sessions,
        private readonly AdminSessionSecurity $security,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()) {
            return $next($request);
        }

        $session = $request->session();
        $now = now()->getTimestamp();
        $idleSeconds = max(1, (int) config('security.admin_session.idle_minutes', 30)) * 60;
        $absoluteSeconds = max(1, (int) config('security.admin_session.absolute_minutes', 480)) * 60;
        $rotateSeconds = max(1, (int) config('security.admin_session.rotate_minutes', 15)) * 60;

        $issuedAt = (int) $session->get(AdminSessionSecurity::ISSUED_AT, 0);
        $lastActivityAt = (int) $session->get(AdminSessionSecurity::LAST_ACTIVITY_AT, 0);
        $rotatedAt = (int) $session->get(AdminSessionSecurity::ROTATED_AT, 0);
        $fingerprint = $this->security->fingerprint($request);
        $boundFingerprint = $session->get(AdminSessionSecurity::USER_AGENT_FINGERPRINT);
        $mfaVerifiedAt = (int) $session->get(AdminSessionSecurity::MFA_VERIFIED_AT, 0);
        $mfaMethod = $session->get(AdminSessionSecurity::MFA_METHOD);
        $mfaVersion = (int) $session->get(AdminSessionSecurity::MFA_VERSION, 0);
        $setting = $request->user()->adminMfaSetting()->first();

        $hasNoSecurityState = $issuedAt === 0
            && $lastActivityAt === 0
            && $rotatedAt === 0
            && ! is_string($boundFingerprint);
        $hasCompleteSecurityState = $issuedAt > 0
            && $lastActivityAt > 0
            && $rotatedAt > 0
            && is_string($boundFingerprint)
            && $mfaVerifiedAt > 0
            && is_string($mfaMethod)
            && in_array($mfaMethod, ['passkey', 'totp', 'recovery_code'], true)
            && $mfaVersion > 0;
        $hasInvalidSecurityState = ! $hasNoSecurityState
            && (! $hasCompleteSecurityState
                || $issuedAt > $now + 300
                || $lastActivityAt < $issuedAt
                || $lastActivityAt > $now + 300
                || $rotatedAt < $issuedAt
                || $rotatedAt > $now + 300
                || $mfaVerifiedAt < $issuedAt
                || $mfaVerifiedAt > $now + 300);

        $hasExpired = $hasCompleteSecurityState
            && ($now - $issuedAt >= $absoluteSeconds
                || $now - $lastActivityAt >= $idleSeconds);
        $fingerprintChanged = (bool) config('security.admin_session.bind_user_agent', true)
            && $hasCompleteSecurityState
            && ! hash_equals($boundFingerprint, $fingerprint);
        $mfaStateRevoked = $setting === null
            || $setting->enabled_at === null
            || $setting->recovery_codes_acknowledged_at === null
            || ($setting->totp_confirmed_at === null
                && ! $request->user()->hasPasskeysEnabled())
            || $mfaVersion !== (int) $setting->version;

        if (Auth::guard('web')->viaRemember()
            || $hasNoSecurityState
            || $hasInvalidSecurityState
            || $hasExpired
            || $fingerprintChanged
            || $mfaStateRevoked) {
            return $this->terminateSession($request);
        }

        $isReadOnlySession = AdminSessionRoutePolicy::isReadOnly($request);

        if (! $isReadOnlySession && $now - $rotatedAt >= $rotateSeconds) {
            $this->sessions->regenerate($request, regenerateCsrfToken: false);
            $session->put(AdminSessionSecurity::ROTATED_AT, $now);
        }

        $isBackgroundPoll = $request->header('X-UBSC-Background-Poll') === '1'
            && $request->header('X-Inertia') === 'true';

        if (! $isReadOnlySession && ! $isBackgroundPoll) {
            $session->put(AdminSessionSecurity::LAST_ACTIVITY_AT, $now);
        }

        $response = $next($request);

        $response->headers->set(
            'Cache-Control',
            'private, no-store, max-age=0, must-revalidate',
        );
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');
        $response->setVary(array_values(array_unique([
            ...$response->getVary(),
            'Cookie',
        ])));

        return $response;
    }

    private function terminateSession(Request $request): Response
    {
        $this->sessions->logoutAndInvalidate($request);
        Inertia::clearHistory();

        if ($request->expectsJson()) {
            return response()->json([
                'message' => 'Sesi staf telah berakhir. Silakan masuk kembali.',
            ], 401)->withHeaders([
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0',
            ]);
        }

        return redirect()
            ->route('ubsc-staff.login')
            ->withErrors([
                'email' => 'Sesi staf telah berakhir. Silakan masuk kembali.',
            ])
            ->withHeaders([
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0',
            ]);
    }
}
