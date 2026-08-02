<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceCanonicalHost
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $this->canonicalOrigin($request);

        if ($origin === null) {
            return $next($request);
        }

        $canonicalHost = parse_url($origin, PHP_URL_HOST);
        $canonicalScheme = parse_url($origin, PHP_URL_SCHEME)
            ?: ($request->isSecure() ? 'https' : 'http');
        $canonicalPort = parse_url($origin, PHP_URL_PORT)
            ?: ($canonicalScheme === 'https' ? 443 : 80);
        $forwardedProto = strtolower(trim(explode(',', (string) $request->header('X-Forwarded-Proto'))[0]));
        $requestScheme = $forwardedProto ?: $request->getScheme();
        $forwardedPort = trim(explode(',', (string) $request->header('X-Forwarded-Port'))[0]);
        $requestPort = ctype_digit($forwardedPort)
            ? (int) $forwardedPort
            : ($forwardedProto !== ''
                ? ($requestScheme === 'https' ? 443 : 80)
                : $request->getPort());

        if ($canonicalHost
            && ($request->getHost() !== $canonicalHost
                || $requestScheme !== $canonicalScheme
                || $requestPort !== $canonicalPort)) {
            $target = rtrim($origin, '/').'/'.ltrim($request->getRequestUri(), '/');

            /*
             * Both codes preserve the request method. Production may cache
             * the permanent canonical host, while local development uses a
             * temporary redirect so changing APP_URL never traps the browser.
             */
            return redirect()->away(
                $target,
                app()->environment('production') ? 308 : 307,
            );
        }

        return $next($request);
    }

    private function canonicalOrigin(Request $request): ?string
    {
        if (app()->environment('production')) {
            return rtrim((string) config('seo.canonical_origin'), '/');
        }

        /*
         * localhost and 127.0.0.1 are different cookie origins. During local
         * development, normalize only loopback aliases to APP_URL; never
         * redirect arbitrary preview hosts or LAN devices.
         */
        $appOrigin = rtrim((string) config('app.url'), '/');
        $appHost = parse_url($appOrigin, PHP_URL_HOST);
        $loopbackHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];

        if (! is_string($appHost)
            || ! in_array($appHost, $loopbackHosts, true)
            || ! in_array($request->getHost(), $loopbackHosts, true)) {
            return null;
        }

        return $appOrigin;
    }
}
