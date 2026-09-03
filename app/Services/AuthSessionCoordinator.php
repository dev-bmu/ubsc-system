<?php

namespace App\Services;

use App\Models\User;
use App\Support\AdminAccess;
use Illuminate\Http\Request;
use Illuminate\Session\SessionManager;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class AuthSessionCoordinator
{
    public const BOUNDARY_ATTRIBUTE = 'ubsc.auth.session_boundary';

    public const RECOVERED_RETIRED_SESSION_ATTRIBUTE = 'ubsc.auth.recovered_retired_session';

    private const RETIRED_SESSION_PREFIX = 'ubsc:auth:retired-session:';

    public function __construct(
        private readonly SessionManager $sessions,
        private readonly AdminPresenceService $presence,
    ) {}

    /**
     * Rotate an authenticated session and permanently retire the previous ID.
     *
     * Destroying the old ID is important, but is not sufficient on its own:
     * an already-running request from another tab can otherwise recreate it
     * and return its old cookie after this response has completed. The short-
     * lived tombstone lets the outer response middleware identify that race.
     */
    public function regenerate(
        Request $request,
        bool $regenerateCsrfToken = true,
    ): void {
        $this->retire($request->session()->getId());

        $request->session()->regenerate(true);

        if ($regenerateCsrfToken) {
            $request->session()->regenerateToken();
        }

        $this->markBoundary($request);
    }

    /**
     * Invalidate a logged-in session while retaining a fresh guest session
     * and CSRF token for the redirect that follows.
     */
    public function invalidate(Request $request): void
    {
        $user = $request->user();

        if ($user instanceof User) {
            $this->clearAdminPresenceWithoutFailure($request, $user);
        }

        $this->invalidateSession($request);
    }

    /**
     * End one authenticated login and its presence slots as one boundary.
     * The presence identifier is captured before the session is invalidated.
     */
    public function logoutAndInvalidate(Request $request, string $guard = 'web'): void
    {
        $user = Auth::guard($guard)->user();

        if ($user instanceof User) {
            $this->clearAdminPresenceWithoutFailure($request, $user);
        }

        Auth::guard($guard)->logout();
        $this->invalidateSession($request);
    }

    private function invalidateSession(Request $request): void
    {
        $this->retire($request->session()->getId());

        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $this->markBoundary($request);
    }

    public function isBoundaryRequest(Request $request): bool
    {
        return $request->attributes->get(self::BOUNDARY_ATTRIBUTE) === true;
    }

    public function retire(?string $sessionId): void
    {
        if (! is_string($sessionId) || $sessionId === '') {
            return;
        }

        try {
            Cache::put(
                $this->retiredKey($sessionId),
                true,
                now()->addMinutes(max(15, (int) config('session.lifetime', 120))),
            );
        } catch (Throwable $exception) {
            // Authentication must remain available during a transient cache
            // outage. Session destruction still provides the primary guard.
            $this->warningWithoutFailure(
                'Unable to record an authentication session tombstone.',
                $exception,
            );
        }
    }

    public function isRetired(?string $sessionId): bool
    {
        if (! is_string($sessionId) || $sessionId === '') {
            return false;
        }

        try {
            return Cache::has($this->retiredKey($sessionId));
        } catch (Throwable $exception) {
            $this->warningWithoutFailure(
                'Unable to read an authentication session tombstone.',
                $exception,
            );

            return false;
        }
    }

    /**
     * Remove a stale session after StartSession has finished writing it.
     */
    public function destroySession(?string $sessionId): void
    {
        if (! is_string($sessionId) || $sessionId === '') {
            return;
        }

        try {
            $this->sessions
                ->driver()
                ->getHandler()
                ->destroy($sessionId);
        } catch (Throwable $exception) {
            $this->warningWithoutFailure(
                'Unable to destroy a retired authentication session.',
                $exception,
            );
        }
    }

    private function retiredKey(string $sessionId): string
    {
        return self::RETIRED_SESSION_PREFIX.hash('sha256', $sessionId);
    }

    private function clearAdminPresenceWithoutFailure(
        Request $request,
        User $user,
    ): void {
        try {
            if (! AdminAccess::allows($user)) {
                return;
            }

            $this->presence->clearSession(
                (int) $user->getKey(),
                $this->presence->sessionInstance($request),
            );
        } catch (Throwable $exception) {
            // Presence is advisory. A cache or role-store outage must never
            // prevent the authoritative authentication logout boundary.
            $this->warningWithoutFailure(
                'Unable to clear admin presence during session invalidation.',
                $exception,
            );
        }
    }

    /**
     * FormRequest is a request clone. Authentication controllers can rotate
     * the session through that clone while outer middleware still owns the
     * original container request. Mark both so a legitimate replacement
     * cookie is never mistaken for a delayed response from a retired tab.
     */
    private function markBoundary(Request $request): void
    {
        $request->attributes->set(self::BOUNDARY_ATTRIBUTE, true);

        $rootRequest = app('request');

        if ($rootRequest instanceof Request && $rootRequest !== $request) {
            $rootRequest->attributes->set(self::BOUNDARY_ATTRIBUTE, true);
        }
    }

    private function warningWithoutFailure(
        string $message,
        Throwable $exception,
    ): void {
        try {
            Log::warning($message, [
                'exception' => $exception::class,
            ]);
        } catch (Throwable) {
            // Session boundaries remain authoritative even when telemetry is
            // temporarily unavailable.
        }
    }
}
