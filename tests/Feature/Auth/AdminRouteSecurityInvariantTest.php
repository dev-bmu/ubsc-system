<?php

namespace Tests\Feature\Auth;

use App\Support\AdminSessionRoutePolicy;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Session\Middleware\StartSession as LaravelStartSession;
use Illuminate\Session\SessionManager;
use Illuminate\Support\Facades\Route as RouteFacade;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class AdminRouteSecurityInvariantTest extends TestCase
{
    public function test_every_admin_application_route_has_the_complete_security_chain(): void
    {
        $excludedPrefixes = [
            'ubsc-staff/login',
            'ubsc-staff/mfa',
        ];

        $routes = collect(RouteFacade::getRoutes()->getRoutes())
            ->filter(fn (Route $route): bool => str_starts_with($route->uri(), 'ubsc-staff'))
            ->reject(fn (Route $route): bool => collect($excludedPrefixes)->contains(
                fn (string $prefix): bool => str_starts_with($route->uri(), $prefix),
            ));

        $this->assertNotEmpty($routes);

        foreach ($routes as $route) {
            $middleware = array_values($route->middleware());
            $auth = array_search('auth', $middleware, true);
            $authenticatedSession = array_search('auth.session', $middleware, true);
            $role = collect($middleware)->search(
                fn (string $name): bool => str_starts_with($name, 'role:'),
            );
            $adminSession = array_search('admin.session', $middleware, true);

            $this->assertIsInt($auth, $route->uri().' is missing auth');
            $this->assertIsInt($authenticatedSession, $route->uri().' is missing auth.session');
            $this->assertIsInt($role, $route->uri().' is missing role authorization');
            $this->assertIsInt($adminSession, $route->uri().' is missing admin.session');
            $this->assertTrue(
                $auth < $authenticatedSession
                    && $authenticatedSession < $role
                    && $role < $adminSession,
                $route->uri().' has an unsafe middleware order',
            );
        }
    }

    public function test_no_generic_passwordless_passkey_routes_are_registered(): void
    {
        $unsafe = collect(RouteFacade::getRoutes()->getRoutes())
            ->map(fn (Route $route): string => $route->uri())
            ->filter(fn (string $uri): bool => str_starts_with($uri, 'passkeys/')
                || str_starts_with($uri, 'user/passkeys'));

        $this->assertSame([], $unsafe->values()->all());
    }

    public function test_admin_session_boundaries_are_locked_while_heavy_gallery_workers_are_not(): void
    {
        $routes = collect(RouteFacade::getRoutes()->getRoutes())
            ->filter(fn (Route $route): bool => str_starts_with($route->uri(), 'ubsc-staff'));

        $this->assertNotEmpty($routes);

        foreach ($routes as $route) {
            if (AdminSessionRoutePolicy::routeIsReadOnly($route)) {
                $this->assertNull($route->locksFor(), $route->uri().' unexpectedly has a session lock');
                $this->assertNull($route->waitsFor(), $route->uri().' unexpectedly waits for a session lock');

                continue;
            }

            $this->assertIsInt($route->locksFor(), $route->uri().' is missing a session lock');
            $this->assertGreaterThan(0, $route->locksFor(), $route->uri().' has an invalid lock lifetime');
            $this->assertIsInt($route->waitsFor(), $route->uri().' is missing a session lock wait');
            $this->assertGreaterThan(0, $route->waitsFor(), $route->uri().' has an invalid lock wait');
        }

        foreach (AdminSessionRoutePolicy::READ_ONLY_ROUTE_NAMES as $routeName) {
            $route = RouteFacade::getRoutes()->getByName($routeName);

            $this->assertInstanceOf(Route::class, $route, $routeName.' is not registered');
            $this->assertNull($route->locksFor(), $routeName.' must allow parallel workers');
        }

        foreach ([
            'ubsc-staff.login',
            'ubsc-staff.login.store',
            'ubsc-staff.mfa',
            'ubsc-staff.logout',
        ] as $routeName) {
            $route = RouteFacade::getRoutes()->getByName($routeName);

            $this->assertInstanceOf(Route::class, $route, $routeName.' is not registered');
            $this->assertIsInt($route->locksFor(), $routeName.' must serialize session boundaries');
            $this->assertGreaterThan(0, $route->locksFor(), $routeName.' has an invalid lock lifetime');
        }
    }

    public function test_heavy_gallery_routes_keep_the_full_admin_authentication_chain(): void
    {
        foreach (AdminSessionRoutePolicy::READ_ONLY_ROUTE_NAMES as $routeName) {
            $route = RouteFacade::getRoutes()->getByName($routeName);

            $this->assertInstanceOf(Route::class, $route, $routeName.' is not registered');

            $middleware = array_values($route->middleware());

            $this->assertContains('auth', $middleware, $routeName.' is missing auth');
            $this->assertContains('auth.session', $middleware, $routeName.' is missing auth.session');
            $this->assertContains('admin.session', $middleware, $routeName.' is missing admin.session');
            $this->assertTrue(
                collect($middleware)->contains(
                    fn (string $name): bool => str_starts_with($name, 'role:'),
                ),
                $routeName.' is missing role authorization',
            );
        }
    }

    public function test_web_stack_uses_the_read_only_aware_session_middleware(): void
    {
        $middleware = app('router')->getMiddlewareGroups()['web'] ?? [];

        $this->assertContains(\App\Http\Middleware\StartSession::class, $middleware);
        $this->assertNotContains(LaravelStartSession::class, $middleware);
    }

    public function test_read_only_gallery_worker_cannot_persist_a_stale_session_snapshot(): void
    {
        config([
            'session.driver' => 'array',
            'session.encrypt' => false,
            'session.lottery' => [0, 100],
        ]);

        $manager = new SessionManager($this->app);
        $handler = $manager->driver()->getHandler();
        $sessionId = str_repeat('a', 40);
        $cookieName = (string) config('session.cookie');
        $original = [
            'marker' => 'newer-session-state',
            'ubsc.admin_session.last_activity_at' => 1_725_000_000,
        ];

        $handler->write($sessionId, serialize($original));

        $route = (new Route(['POST'], '/_test/gallery-worker', fn () => null))
            ->name('admin.gallery.items.store');
        $request = Request::create(
            '/_test/gallery-worker',
            'POST',
            cookies: [$cookieName => $sessionId],
        );
        $request->setRouteResolver(fn (): Route => $route);

        $response = (new \App\Http\Middleware\StartSession($manager))->handle(
            $request,
            function (Request $request): Response {
                $this->assertSame('newer-session-state', $request->session()->get('marker'));

                // Simulate a late auth.session/admin-session mutation. The
                // worker may consume it in-memory, but must never write it.
                $request->session()->put('marker', 'stale-worker-state');
                $request->session()->put('ubsc.admin_session.last_activity_at', 1_724_000_000);

                return response('ok');
            },
        );

        $this->assertSame($original, unserialize((string) $handler->read($sessionId)));
        $this->assertSame([], $response->headers->getCookies());
    }
}
