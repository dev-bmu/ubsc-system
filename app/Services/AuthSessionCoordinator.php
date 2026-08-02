<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Session\SessionManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class AuthSessionCoordinator
{
    public const BOUNDARY_ATTRIBUTE = 'ubsc.auth.session_boundary';

    private const RETIRED_SESSION_PREFIX = 'ubsc:auth:retired-session:';

    public function __construct(
        private readonly SessionManager $sessions,
    ) {}

    /**
     * Rotate an authenticated session and permanently retire the previous ID.
     *
     * Destroying the old ID is important, but is not sufficient on its own:
     * an already-running request from another tab can otherwise recreate it
     * and return its old cookie after this response has completed. The short-
     * lived tombstone lets the outer response middleware identify that race.
     */
    public function regenerate(Request $request): void
    {
        $this->retire($request->session()->getId());

        $request->session()->regenerate(true);
        $request->attributes->set(self::BOUNDARY_ATTRIBUTE, true);
    }

    /**
     * Invalidate a logged-in session while retaining a fresh guest session
     * and CSRF token for the redirect that follows.
     */
    public function invalidate(Request $request): void
    {
        $this->retire($request->session()->getId());

        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $request->attributes->set(self::BOUNDARY_ATTRIBUTE, true);
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
            Log::warning('Unable to record an authentication session tombstone.', [
                'exception' => $exception::class,
            ]);
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
            Log::warning('Unable to read an authentication session tombstone.', [
                'exception' => $exception::class,
            ]);

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
            Log::warning('Unable to destroy a retired authentication session.', [
                'exception' => $exception::class,
            ]);
        }
    }

    private function retiredKey(string $sessionId): string
    {
        return self::RETIRED_SESSION_PREFIX.hash('sha256', $sessionId);
    }
}
