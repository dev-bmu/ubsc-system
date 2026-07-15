<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceCanonicalHost
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->environment('production')) {
            return $next($request);
        }

        $origin = (string) config('facility-gallery.canonical_origin');
        $canonicalHost = parse_url($origin, PHP_URL_HOST);
        $canonicalScheme = parse_url($origin, PHP_URL_SCHEME) ?: 'https';
        $forwardedProto = strtolower(trim(explode(',', (string) $request->header('X-Forwarded-Proto'))[0]));
        $requestScheme = $forwardedProto ?: $request->getScheme();

        if ($canonicalHost
            && ($request->getHost() !== $canonicalHost || $requestScheme !== $canonicalScheme)) {
            $target = rtrim($origin, '/').'/'.ltrim($request->getRequestUri(), '/');

            return redirect()->away($target, 301);
        }

        return $next($request);
    }
}
