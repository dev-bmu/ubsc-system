<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Symfony\Component\HttpFoundation\Response;

/**
 * Apply the coarse traffic envelope before cookies and sessions are opened.
 *
 * This deliberately composes, rather than extends, Laravel's throttle
 * middleware. Route middleware subclasses inherit Laravel's default priority
 * and would otherwise be moved behind StartSession, allowing abusive traffic
 * to consume session I/O before it is rejected.
 */
final class EnforceTrafficRateLimits
{
    public function __construct(
        private readonly ThrottleRequests $throttle,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        return $this->throttle->handle($request, $next, 'web-traffic');
    }
}
