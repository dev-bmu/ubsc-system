<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Spatie\Permission\Exceptions\UnauthorizedException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            Route::prefix('ubsc-staff')
                ->group(base_path('routes/admin-auth.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'role'               => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission'         => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
        ]);

        // Condition A: guests hitting /ubsc-staff/* go to the staff login, not the public login
        $middleware->redirectGuestsTo(function ($request) {
            return $request->is('ubsc-staff*')
                ? route('ubsc-staff.login')
                : route('login');
        });

        $middleware->redirectUsersTo(function ($request) {
            return $request->user()?->hasAnyRole([
                'Administrator',
                'Manager',
                'Finance',
                'Staff Central',
                'Staff Front Office',
            ])
                ? route('admin.dashboard')
                : '/';
        });
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $forbiddenResponse = fn (Request $request) => Inertia::render('Errors/Forbidden')
            ->toResponse($request)
            ->setStatusCode(403);

        // Condition B: render a polished 403 page for authenticated users who lack permission.
        $exceptions->render(function (AuthorizationException $e, Request $request) use ($forbiddenResponse) {
            if (! $request->expectsJson()) {
                return $forbiddenResponse($request);
            }
        });

        // Condition C: Spatie role/permission failures use the same polished 403 page.
        $exceptions->render(function (UnauthorizedException $e, Request $request) use ($forbiddenResponse) {
            if (! $request->expectsJson()) {
                return $forbiddenResponse($request);
            }
        });

        // Plain abort(403) calls from controllers should never fall back to Laravel's default template.
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) use ($forbiddenResponse) {
            if ($e->getStatusCode() === 403 && ! $request->expectsJson()) {
                return $forbiddenResponse($request);
            }
        });

        // 404 → render the custom NotFound Inertia page
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if (! $request->expectsJson()) {
                return Inertia::render('Errors/NotFound')
                    ->toResponse($request)
                    ->setStatusCode(404);
            }
        });
    })->create();
