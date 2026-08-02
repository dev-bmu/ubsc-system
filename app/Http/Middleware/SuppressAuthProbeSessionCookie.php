<?php

namespace App\Http\Middleware;

use App\Services\AuthSessionCoordinator;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SuppressAuthProbeSessionCookie
{
    public function __construct(
        private readonly AuthSessionCoordinator $sessions,
    ) {}

    /**
     * Keep read-only auth probes and delayed responses from replacing the
     * newest session/CSRF cookies created by another tab.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $sessionCookie = (string) config('session.cookie');
        $hadSessionCookie = $request->cookies->has($sessionCookie);

        $response = $next($request);

        if ($request->routeIs('auth.session-state')) {
            $this->removeStateCookies($response);
            $this->mergeVaryHeaders($response);

            if (! $hadSessionCookie && $request->hasSession()) {
                $this->sessions->destroySession($request->session()->getId());
            }

            return $response;
        }

        if (! $request->hasSession()
            || $this->sessions->isBoundaryRequest($request)) {
            return $response;
        }

        /*
         * EncryptCookies has decrypted the incoming cookie by the time the
         * inner stack returns, so this is the actual session ID. If another
         * tab retired it while this request was running, never allow this
         * late response to put that old ID (or its CSRF token) back.
         */
        $incomingSessionId = $request->cookies->get($sessionCookie);

        if (! is_string($incomingSessionId)
            || ! $this->sessions->isRetired($incomingSessionId)) {
            return $response;
        }

        $this->removeStateCookies($response);
        $this->sessions->destroySession($incomingSessionId);

        return $response;
    }

    private function removeStateCookies(Response $response): void
    {
        $stateCookieNames = [
            (string) config('session.cookie'),
            'XSRF-TOKEN',
        ];

        foreach ($response->headers->getCookies() as $cookie) {
            if (! in_array($cookie->getName(), $stateCookieNames, true)) {
                continue;
            }

            $response->headers->removeCookie(
                $cookie->getName(),
                $cookie->getPath(),
                $cookie->getDomain()
            );
        }
    }

    private function mergeVaryHeaders(Response $response): void
    {
        $response->setVary(
            array_values(array_unique([
                ...$response->getVary(),
                'Cookie',
                'X-Inertia',
            ])),
        );
    }

}
