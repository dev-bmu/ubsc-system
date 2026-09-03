<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

class ApplySecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        // One request-scoped nonce is shared by Vite, Ziggy and server-rendered
        // structured data. Inline application scripts without it are blocked.
        $nonce = Vite::useCspNonce();

        return $this->applyToResponse($request, $next($request), $nonce);
    }

    /**
     * Exception responses are rendered outside the normal middleware unwind.
     * Exposing this operation lets Laravel's exception finalizer apply the
     * exact same policy to 4xx/5xx pages without duplicating configuration.
     */
    public function applyToResponse(
        Request $request,
        Response $response,
        ?string $nonce = null,
    ): Response {
        $nonce ??= Vite::cspNonce() ?: Vite::useCspNonce();

        $response->headers->set('Content-Security-Policy', $this->policy($nonce));
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=(self), payment=(self), usb=()',
        );
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

        $requestId = $request->attributes->get((string) config(
            'observability.request_correlation.attribute',
            'ubsc.observability.request_id',
        ));
        if (is_string($requestId)
            && preg_match('/^[0-9a-f-]{36}$/i', $requestId) === 1) {
            $response->headers->set(
                (string) config('observability.request_correlation.header', 'X-Request-ID'),
                $requestId,
            );
        }

        $canonicalScheme = strtolower((string) parse_url(
            (string) config('app.url'),
            PHP_URL_SCHEME,
        ));

        if (app()->isProduction()
            && ($request->isSecure() || $canonicalScheme === 'https')) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000',
            );
        }

        return $response;
    }

    private function policy(string $nonce): string
    {
        $scriptSources = ["'self'", "'nonce-{$nonce}'"];
        $connectSources = ["'self'", 'https:', 'wss:'];
        $developmentSources = [];

        if (app()->environment('local', 'testing')) {
            $developmentSources = [
                'http://localhost:*',
                'http://127.0.0.1:*',
                'http://[::1]:*',
            ];
            $scriptSources = [...$scriptSources, ...$developmentSources];
            $connectSources = [
                ...$connectSources,
                ...$developmentSources,
                'ws://localhost:*',
                'ws://127.0.0.1:*',
                'ws://[::1]:*',
            ];
        }

        $directives = [
            "default-src 'self'",
            'script-src '.implode(' ', $scriptSources),
            "style-src 'self' 'unsafe-inline' https://fonts.bunny.net ".implode(' ', $developmentSources),
            "font-src 'self' data: https://fonts.bunny.net ".implode(' ', $developmentSources),
            "img-src 'self' data: blob: https: ".implode(' ', $developmentSources),
            "media-src 'self' blob: https: ".implode(' ', $developmentSources),
            'connect-src '.implode(' ', $connectSources),
            "worker-src 'self' blob:",
            "frame-src 'self' https://www.google.com https://maps.google.com",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ];

        if (app()->isProduction()) {
            $directives[] = 'upgrade-insecure-requests';
        }

        return implode('; ', $directives).';';
    }
}
