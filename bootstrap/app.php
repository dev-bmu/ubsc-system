<?php

use App\Exceptions\Payments\InvalidPaymentTransition;
use App\Exceptions\Payments\PaymentContextMismatch;
use App\Exceptions\Payments\PaymentIdempotencyConflict;
use App\Support\AdminSessionRoutePolicy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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

            // StartSession acquires these locks before loading session state,
            // preventing overlapping admin tabs/polls from writing an older
            // MFA or activity snapshot over a newer authentication boundary.
            $lockSeconds = max(10, (int) config('security.admin_session.lock_seconds', 60));
            $waitSeconds = max(1, (int) config('security.admin_session.lock_wait_seconds', 15));

            foreach (Route::getRoutes()->getRoutes() as $route) {
                if (str_starts_with($route->uri(), 'ubsc-staff')
                    && ! AdminSessionRoutePolicy::routeIsReadOnly($route)) {
                    $route->block($lockSeconds, $waitSeconds);
                }
            }
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Correlation is global so liveness/readiness, stateless probes, and
        // stateful web traffic all receive an independent server trace ID.
        $middleware->prepend(\App\Http\Middleware\AssignRequestCorrelationId::class);

        $middleware->web(
            append: [
                \App\Http\Middleware\EnforceCanonicalHost::class,
                \App\Http\Middleware\HandleInertiaRequests::class,
                \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
            ],
            prepend: [
                \App\Http\Middleware\ApplySecurityHeaders::class,
                \App\Http\Middleware\EnforceRequestResourceEnvelope::class,
                \App\Http\Middleware\EnforceTrafficRateLimits::class,
                \App\Http\Middleware\SuppressAuthProbeSessionCookie::class,
                \App\Http\Middleware\TrackRequestPerformance::class,
            ],
            replace: [
                \Illuminate\Session\Middleware\StartSession::class => \App\Http\Middleware\StartSession::class,
            ],
        );

        // The auth-state response guard must unwind after StartSession has
        // attached cookies. Keeping this relation explicit also prevents a
        // future prioritized middleware from silently reversing it.
        $middleware->prependToPriorityList(
            [
                \Illuminate\Session\Middleware\StartSession::class,
                \App\Http\Middleware\StartSession::class,
            ],
            \App\Http\Middleware\SuppressAuthProbeSessionCookie::class,
        );

        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
            'admin.session' => \App\Http\Middleware\EnforceAdminSessionSecurity::class,
            'admin.mfa.preauth' => \App\Http\Middleware\EnsureAdminMfaPreAuthenticated::class,
            'admin.mfa.payload' => \App\Http\Middleware\LimitAdminMfaPayload::class,
            'admin.mfa.stepup' => \App\Http\Middleware\EnsureRecentAdminMfaStepUp::class,
            'idempotency' => \App\Http\Middleware\RequireIdempotencyKey::class,
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
        $exceptions->respond(function (
            \Symfony\Component\HttpFoundation\Response $response,
            \Throwable $exception,
            Request $request,
        ) {
            return app(\App\Http\Middleware\ApplySecurityHeaders::class)
                ->applyToResponse($request, $response);
        });

        $exceptions->dontFlash([
            '_token',
            'token',
            'code',
            'credential',
            'totp_code',
            'recovery_code',
            'recovery_codes',
            'mfa_secret',
            'provisioning_uri',
            'state',
            'password',
            'password_confirmation',
            'current_password',
            'authorization',
            'cookie',
            'client_secret',
            'api_key',
            'access_token',
            'refresh_token',
            'id_token',
            'remember_token',
        ]);

        $forbiddenResponse = fn (Request $request) => Inertia::render('Errors/Forbidden')
            ->toResponse($request)
            ->setStatusCode(403);

        $paymentConflictResponse = static function (
            Request $request,
            string $message,
        ) {
            if ($request->expectsJson()) {
                return response()->json([
                    'message' => $message,
                    'errors' => [
                        'payment_method' => [$message],
                    ],
                ], 409);
            }

            return back()->withErrors([
                'payment_method' => $message,
            ]);
        };

        // A replay, a second tab, or a delayed provider response may observe
        // a state transition that another request has already won. These are
        // safe conflicts, not opaque server failures; the database state stays
        // authoritative and the customer receives a recoverable instruction.
        $exceptions->render(function (
            PaymentIdempotencyConflict $exception,
            Request $request,
        ) use ($paymentConflictResponse) {
            if (! $request->routeIs('checkout.*')) {
                return null;
            }

            return $paymentConflictResponse(
                $request,
                'Pembayaran untuk transaksi ini sedang diproses di tab atau permintaan lain. Sinkronkan status sebelum mencoba kembali; tidak ada tagihan ganda yang dibuat.',
            );
        });

        $exceptions->render(function (
            InvalidPaymentTransition $exception,
            Request $request,
        ) use ($paymentConflictResponse) {
            if (! $request->routeIs('checkout.*')) {
                return null;
            }

            return $paymentConflictResponse(
                $request,
                'Status pembayaran baru saja berubah. Sinkronkan status transaksi sebelum melanjutkan.',
            );
        });

        $exceptions->render(function (
            PaymentContextMismatch $exception,
            Request $request,
        ) use ($paymentConflictResponse) {
            if (! $request->routeIs('checkout.*')) {
                return null;
            }

            // Never log request payloads, identities, provider payloads, or
            // exception text here. Correlation middleware supplies the trace
            // identifier needed by operations without exposing customer data.
            Log::critical('Checkout payment context failed closed.', [
                'exception_type' => $exception::class,
                'route' => (string) $request->route()?->getName(),
            ]);

            return $paymentConflictResponse(
                $request,
                'Detail pembayaran tidak lagi cocok dengan transaksi. Tidak ada pembayaran yang diteruskan; sinkronkan status atau hubungi tim reservasi.',
            );
        });

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
