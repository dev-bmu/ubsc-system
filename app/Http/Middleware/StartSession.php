<?php

namespace App\Http\Middleware;

use App\Services\AuthSessionCoordinator;
use App\Support\AdminSessionRoutePolicy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession as LaravelStartSession;
use Illuminate\Session\SessionManager;

/**
 * Start sessions normally, while keeping parallel gallery data-plane
 * requests read-only after authentication has consumed the session state.
 *
 * Laravel's default middleware writes the complete session payload after the
 * controller returns. A slow upload could therefore overwrite a newer MFA,
 * logout or last-activity snapshot from another tab. Skipping that final
 * write (and its cookie refresh) makes these routes safe to run concurrently.
 */
class StartSession extends LaravelStartSession
{
    public function __construct(
        SessionManager $manager,
        ?callable $cacheFactoryResolver = null,
        private readonly ?AuthSessionCoordinator $authSessions = null,
    ) {
        parent::__construct($manager, $cacheFactoryResolver);
    }

    public function getSession(Request $request)
    {
        $session = parent::getSession($request);

        if ($this->authSessions !== null
            && $this->authSessions->isRetired($session->getId())) {
            $this->authSessions->destroySession($session->getId());
            $session->flush();
            $session->setExists(false);
            $session->setId(null);
            $request->attributes->set(
                AuthSessionCoordinator::BOUNDARY_ATTRIBUTE,
                true,
            );
            $request->attributes->set(
                AuthSessionCoordinator::RECOVERED_RETIRED_SESSION_ATTRIBUTE,
                true,
            );
        }

        return $session;
    }

    protected function handleStatefulRequest(Request $request, $session, Closure $next)
    {
        if (! AdminSessionRoutePolicy::isReadOnly($request)
            || $request->attributes->get(
                AuthSessionCoordinator::RECOVERED_RETIRED_SESSION_ATTRIBUTE,
            ) === true) {
            return parent::handleStatefulRequest($request, $session, $next);
        }

        $request->setLaravelSession(
            $this->startSession($request, $session),
        );
        $this->collectGarbage($session);

        return $next($request);
    }
}
