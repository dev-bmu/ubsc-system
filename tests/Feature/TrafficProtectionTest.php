<?php

namespace Tests\Feature;

use App\Http\Middleware\EnforceRequestResourceEnvelope;
use App\Http\Middleware\EnforceTrafficRateLimits;
use App\Http\Middleware\StartSession;
use App\Http\Middleware\SuppressAuthProbeSessionCookie;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route as RouteFacade;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

final class TrafficProtectionTest extends TestCase
{
    public function test_request_envelope_rejects_oversized_work_before_downstream_middleware(): void
    {
        config()->set('ddos_protection.application.resource_envelope.enabled', true);
        config()->set(
            'ddos_protection.application.resource_envelope.maximum_request_target_bytes',
            64,
        );

        $request = Request::create('/login?payload='.str_repeat('x', 80), 'GET');
        $downstreamCalled = false;

        $response = (new EnforceRequestResourceEnvelope)->handle(
            $request,
            function () use (&$downstreamCalled): Response {
                $downstreamCalled = true;

                return response('unexpected');
            },
        );

        self::assertSame(414, $response->getStatusCode());
        self::assertFalse($downstreamCalled);
        self::assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        self::assertStringContainsString('private', (string) $response->headers->get('Cache-Control'));
    }

    public function test_request_envelope_rejects_ambiguous_framing_and_default_oversized_bodies(): void
    {
        config()->set('ddos_protection.application.resource_envelope.enabled', true);
        config()->set('ddos_protection.application.resource_envelope.default_body_bytes', 1_024);

        $ambiguous = Request::create('/register', 'POST');
        $ambiguous->headers->set('Content-Length', '128');
        $ambiguous->headers->set('Transfer-Encoding', 'chunked');

        $middleware = new EnforceRequestResourceEnvelope;
        $ambiguousResponse = $middleware->handle($ambiguous, fn (): Response => response('unexpected'));

        self::assertSame(400, $ambiguousResponse->getStatusCode());

        $oversized = Request::create('/register', 'POST');
        $oversized->headers->set('Content-Length', '1025');
        $oversizedResponse = $middleware->handle($oversized, fn (): Response => response('unexpected'));

        self::assertSame(413, $oversizedResponse->getStatusCode());
    }

    public function test_named_upload_route_receives_only_its_explicit_body_allowance(): void
    {
        config()->set('ddos_protection.application.resource_envelope.enabled', true);
        config()->set('ddos_protection.application.resource_envelope.default_body_bytes', 1_024);
        config()->set('ddos_protection.application.resource_envelope.route_body_bytes', [
            'profile.update' => 8_388_608,
        ]);

        $request = Request::create('/profile', 'PATCH');
        $request->headers->set('Content-Length', '8388608');
        $route = new Route(['PATCH'], '/profile', fn (): Response => response('ok'));
        $route->name('profile.update');
        $request->setRouteResolver(static fn (): Route => $route);

        $response = (new EnforceRequestResourceEnvelope)->handle(
            $request,
            fn (): Response => response('accepted', 202),
        );

        self::assertSame(202, $response->getStatusCode());

        $request->headers->set('Content-Length', '8388609');
        $rejected = (new EnforceRequestResourceEnvelope)->handle(
            $request,
            fn (): Response => response('unexpected'),
        );

        self::assertSame(413, $rejected->getStatusCode());
    }

    public function test_stateless_monitoring_ingestion_uses_its_small_named_body_envelope(): void
    {
        config()->set('ddos_protection.application.resource_envelope.enabled', true);

        foreach ([
            'monitoring.external-sli.ingest' => 16_384,
            'monitoring.log-receipts.ingest' => 32_768,
        ] as $routeName => $maximumBytes) {
            $route = RouteFacade::getRoutes()->getByName($routeName);
            self::assertInstanceOf(Route::class, $route);

            $request = Request::create('/'.$route->uri(), 'POST');
            $request->setRouteResolver(static fn (): Route => $route);
            $request->headers->set('Content-Length', (string) ($maximumBytes + 1));

            $response = (new EnforceRequestResourceEnvelope)->handle(
                $request,
                fn (): Response => response('unexpected'),
            );

            self::assertSame(413, $response->getStatusCode());
        }
    }

    public function test_global_limiter_is_layered_and_does_not_store_raw_client_identity(): void
    {
        config()->set('ddos_protection.application.enabled', true);
        config()->set('ddos_protection.application.limits.web', [
            'per_ip_per_second' => 40,
            'per_ip_per_minute' => 1_200,
            'per_network_per_minute' => 12_000,
            'global_per_second' => 600,
            'global_per_minute' => 24_000,
        ]);

        $request = Request::create('/', 'GET', server: ['REMOTE_ADDR' => '203.0.113.77']);
        $resolver = RateLimiter::limiter('web-traffic');

        self::assertIsCallable($resolver);
        $limits = $resolver($request);

        self::assertIsArray($limits);
        self::assertCount(5, $limits);
        self::assertContainsOnlyInstancesOf(Limit::class, $limits);
        self::assertSame([40, 1_200, 12_000, 600, 24_000], array_column($limits, 'maxAttempts'));
        self::assertStringNotContainsString(
            '203.0.113.77',
            implode('|', array_map(static fn (Limit $limit): string => (string) $limit->key, $limits)),
        );
    }

    public function test_coarse_limit_rejects_before_a_session_cookie_is_created(): void
    {
        config()->set('ddos_protection.application.enabled', true);
        config()->set('ddos_protection.application.limits.web', [
            'per_ip_per_second' => 100,
            'per_ip_per_minute' => 1,
            'per_network_per_minute' => 100,
            'global_per_second' => 100,
            'global_per_minute' => 100,
        ]);

        RouteFacade::middleware('web')->get(
            '/_test/coarse-traffic-limit',
            static fn (): Response => response()->json(['ok' => true]),
        );

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.44'])
            ->getJson('/_test/coarse-traffic-limit')
            ->assertOk();

        $rejected = $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.44'])
            ->getJson('/_test/coarse-traffic-limit');

        $rejected
            ->assertStatus(429)
            ->assertExactJson([
                'message' => 'Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi.',
            ])
            ->assertCookieMissing((string) config('session.cookie'));
    }

    public function test_abuse_prone_public_routes_retain_named_limiters(): void
    {
        $routes = RouteFacade::getRoutes()->getRoutes();
        $registration = collect($routes)->first(
            static fn (Route $route): bool => $route->uri() === 'register'
                && in_array('POST', $route->methods(), true),
        );

        self::assertInstanceOf(Route::class, $registration);
        self::assertContains('throttle:public-registration', $registration->gatherMiddleware());
        self::assertContains(
            'throttle:review-write',
            RouteFacade::getRoutes()->getByName('reviews.store')?->gatherMiddleware() ?? [],
        );
        self::assertContains(
            'throttle:oauth-entry',
            RouteFacade::getRoutes()->getByName('google.login')?->gatherMiddleware() ?? [],
        );
        self::assertContains(
            'throttle:sitemap-read',
            RouteFacade::getRoutes()->getByName('sitemap.news')?->gatherMiddleware() ?? [],
        );
        self::assertContains(
            'throttle:public-analytics',
            RouteFacade::getRoutes()->getByName('gallery.events')?->gatherMiddleware() ?? [],
        );

        foreach ([
            'monitoring.external-sli.ingest' => 'throttle:monitoring-external-sli',
            'monitoring.log-receipts.ingest' => 'throttle:monitoring-log-receipts',
        ] as $routeName => $namedLimiter) {
            $middleware = RouteFacade::getRoutes()->getByName($routeName)?->gatherMiddleware() ?? [];

            self::assertContains(EnforceRequestResourceEnvelope::class, $middleware);
            self::assertContains(EnforceTrafficRateLimits::class, $middleware);
            self::assertContains($namedLimiter, $middleware);
        }
    }

    public function test_coarse_traffic_rejection_and_cookie_guard_wrap_session_io(): void
    {
        $route = RouteFacade::getRoutes()->getByName('auth.session-state');

        self::assertInstanceOf(Route::class, $route);

        $middleware = app('router')->gatherRouteMiddleware($route);
        $trafficIndex = array_search(EnforceTrafficRateLimits::class, $middleware, true);
        $cookieGuardIndex = array_search(SuppressAuthProbeSessionCookie::class, $middleware, true);
        $sessionIndex = array_search(StartSession::class, $middleware, true);

        self::assertIsInt($trafficIndex);
        self::assertIsInt($cookieGuardIndex);
        self::assertIsInt($sessionIndex);
        self::assertLessThan($sessionIndex, $trafficIndex);
        self::assertLessThan($sessionIndex, $cookieGuardIndex);
    }
}
