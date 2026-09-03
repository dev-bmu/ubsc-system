<?php

namespace App\Providers;

use App\Support\AuthenticationIdentity;
use App\Support\TrustedProxyPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;
use Laravel\Passkeys\Passkeys;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // The package's passwordless public routes would bypass UBSC's
        // mandatory password + MFA admin policy. Only scoped staff routes are
        // registered by this application.
        Passkeys::ignoreRoutes();

        // The framework registers its own StartSession through a factory so
        // route locks receive the cache resolver. Preserve that contract for
        // UBSC's read-only-aware subclass instead of relying on auto-wiring.
        $this->app->singleton(
            \App\Http\Middleware\StartSession::class,
            static fn ($app) => new \App\Http\Middleware\StartSession(
                $app->make(\Illuminate\Session\SessionManager::class),
                static fn () => $app->make(\Illuminate\Contracts\Cache\Factory::class),
                $app->make(\App\Services\AuthSessionCoordinator::class),
            ),
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureTrustedProxies();
        $this->validateProductionSecurityConfiguration();
        Vite::prefetch(concurrency: 3);

        $loginThrottleResponse = static function (Request $request, array $headers) {
            Inertia::clearHistory();

            return back()
                ->withErrors(['email' => __('auth.throttle_generic')])
                ->withHeaders($headers);
        };

        RateLimiter::for('public-login-edge', function (Request $request) use ($loginThrottleResponse): array {
            $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'public-login-edge-ip');

            return [
                Limit::perMinute(30)->by('public-login-edge:ip:minute:'.$ip)->response($loginThrottleResponse),
                Limit::perHour(300)->by('public-login-edge:ip:hour:'.$ip)->response($loginThrottleResponse),
                Limit::perMinute(600)->by('public-login-edge:global')->response($loginThrottleResponse),
            ];
        });

        RateLimiter::for('admin-login-edge', function (Request $request) use ($loginThrottleResponse): array {
            $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'admin-login-edge-ip');

            return [
                Limit::perMinute(15)->by('admin-login-edge:ip:minute:'.$ip)->response($loginThrottleResponse),
                Limit::perHour(100)->by('admin-login-edge:ip:hour:'.$ip)->response($loginThrottleResponse),
                Limit::perMinute(120)->by('admin-login-edge:global')->response($loginThrottleResponse),
            ];
        });

        RateLimiter::for('booking-availability', function (Request $request): array {
            $visitor = $request->user()
                ? 'user:'.$request->user()->getAuthIdentifier()
                : 'session:'.($request->hasSession()
                    ? $request->session()->getId()
                    : $request->ip());

            return [
                Limit::perMinute(240)->by('booking-availability:'.$visitor),
                Limit::perMinute(4_000)->by('booking-availability:ip:'.$request->ip()),
            ];
        });

        RateLimiter::for('booking-slots', function (Request $request): array {
            $visitor = $request->user()
                ? 'user:'.$request->user()->getAuthIdentifier()
                : 'session:'.($request->hasSession()
                    ? $request->session()->getId()
                    : $request->ip());

            return [
                Limit::perMinute(180)->by('booking-slots:'.$visitor),
                Limit::perMinute(3_000)->by('booking-slots:ip:'.$request->ip()),
            ];
        });

        RateLimiter::for('booking-checkout', function (Request $request): array {
            $actor = $request->user()
                ? 'user:'.$request->user()->getAuthIdentifier()
                : 'ip:'.$request->ip();

            return [
                Limit::perMinute(6)->by('booking-checkout:'.$actor),
                Limit::perHour(60)->by('booking-checkout-hour:'.$actor),
                Limit::perMinute(300)->by('booking-checkout-ip:'.$request->ip()),
            ];
        });

        RateLimiter::for('booking-payment', function (Request $request): array {
            $actor = $request->user()
                ? 'user:'.$request->user()->getAuthIdentifier()
                : 'ip:'.$request->ip();

            return [
                Limit::perMinute(12)->by('booking-payment:'.$actor),
                Limit::perHour(120)->by('booking-payment-hour:'.$actor),
                Limit::perMinute(360)->by('booking-payment-ip:'.$request->ip()),
            ];
        });

        RateLimiter::for('auth-state', function (Request $request): array {
            $visitor = $request->user()
                ? 'user:'.$request->user()->getAuthIdentifier()
                : ($request->cookies->has((string) config('session.cookie'))
                    ? 'session:'.($request->hasSession()
                        ? $request->session()->getId()
                        : $request->ip())
                    : 'guest-ip:'.$request->ip());

            return [
                Limit::perMinute(120)->by('auth-state:'.$visitor),
                Limit::perMinute(600)->by('auth-state:ip:'.$request->ip()),
            ];
        });

        $recoveryResponse = static function (Request $request, array $headers) {
            return back()
                ->with('status', __('passwords.sent'))
                ->withHeaders($headers);
        };

        RateLimiter::for('password-recovery', function (Request $request) use ($recoveryResponse): array {
            $email = AuthenticationIdentity::normalizeEmail($request->input('email'));
            $account = AuthenticationIdentity::opaque($email, 'password-recovery-account');
            $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'password-recovery-ip');

            return [
                Limit::perMinutes(15, 3)
                    ->by('password-recovery:account:burst:'.$account)
                    ->response($recoveryResponse),
                Limit::perHour(5)
                    ->by('password-recovery:account:hour:'.$account)
                    ->response($recoveryResponse),
                Limit::perMinutes(15, 10)
                    ->by('password-recovery:ip:burst:'.$ip)
                    ->response($recoveryResponse),
                Limit::perHour(40)
                    ->by('password-recovery:ip:hour:'.$ip)
                    ->response($recoveryResponse),
                Limit::perMinutes(15, 120)
                    ->by('password-recovery:global')
                    ->response($recoveryResponse),
            ];
        });

        RateLimiter::for('password-reset', function (Request $request): array {
            $email = AuthenticationIdentity::normalizeEmail($request->input('email'));
            $account = AuthenticationIdentity::opaque($email, 'password-reset-account');
            $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'password-reset-ip');

            return [
                Limit::perMinutes(15, 5)->by('password-reset:account:'.$account),
                Limit::perMinutes(15, 20)->by('password-reset:ip:'.$ip),
                Limit::perMinutes(15, 240)->by('password-reset:global'),
            ];
        });

        RateLimiter::for('admin-mfa-options', function (Request $request): array {
            $pendingUser = (string) ($request->user()?->getAuthIdentifier()
                ?? $request->session()->get(
                    \App\Services\AdminMfaPreauthentication::USER_ID,
                    'unknown',
                ));
            $account = AuthenticationIdentity::opaque($pendingUser, 'admin-mfa-options-account');
            $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'admin-mfa-options-ip');
            $response = static fn (Request $request, array $headers) => response()->json([
                'message' => __('auth.throttle_generic'),
            ], 429, $headers);

            return [
                Limit::perMinute(30)
                    ->by('admin-mfa-options:account:'.$account)
                    ->response($response),
                Limit::perMinute(60)
                    ->by('admin-mfa-options:ip:'.$ip)
                    ->response($response),
                Limit::perMinute(600)
                    ->by('admin-mfa-options:global')
                    ->response($response),
            ];
        });

        RateLimiter::for('admin-presence', function (Request $request): array {
            $account = AuthenticationIdentity::opaque(
                (string) ($request->user()?->getAuthIdentifier() ?? 'guest'),
                'admin-presence-account',
            );
            $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'admin-presence-ip');
            $response = static fn (Request $request, array $headers) => response()->json([
                'message' => __('auth.throttle_generic'),
            ], 429, $headers)->withHeaders([
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0',
            ]);

            return [
                Limit::perMinute(12)
                    ->by('admin-presence:account:'.$account)
                    ->response($response),
                Limit::perMinute(240)
                    ->by('admin-presence:ip:'.$ip)
                    ->response($response),
            ];
        });
    }

    private function validateProductionSecurityConfiguration(): void
    {
        if ($this->app->environment(['local', 'testing'])) {
            return;
        }

        $appKey = (string) config('app.key');
        $passkeySecret = (string) config('passkeys.user_handle_secret');
        $recoveryPepper = (string) config('security.admin_mfa.recovery_pepper');

        if ((bool) config('app.debug')) {
            throw new \RuntimeException(
                'APP_DEBUG must be disabled outside local/testing environments.',
            );
        }

        if (! $this->isValidApplicationKey(
            $appKey,
            (string) config('app.cipher', 'AES-256-CBC'),
        )) {
            throw new \RuntimeException(
                'APP_KEY must be a valid key for the configured application cipher.',
            );
        }

        if (! (bool) config('passkeys.user_handle_secret_is_dedicated')
            || strlen($passkeySecret) < 32
            || hash_equals($appKey, $passkeySecret)) {
            throw new \RuntimeException(
                'PASSKEYS_USER_HANDLE_SECRET must be a dedicated stable secret of at least 32 bytes.',
            );
        }

        if (! (bool) config('security.admin_mfa.recovery_pepper_is_dedicated')
            || strlen($recoveryPepper) < 32
            || hash_equals($appKey, $recoveryPepper)
            || hash_equals($passkeySecret, $recoveryPepper)) {
            throw new \RuntimeException(
                'ADMIN_MFA_RECOVERY_PEPPER must be an independent stable secret of at least 32 bytes.',
            );
        }

        $origins = (array) config('passkeys.allowed_origins', []);
        $relyingPartyId = strtolower(trim((string) config('passkeys.relying_party_id')));
        $validRelyingParty = $relyingPartyId !== ''
            && filter_var($relyingPartyId, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false
            && filter_var($relyingPartyId, FILTER_VALIDATE_IP) === false
            && $relyingPartyId !== 'localhost'
            && ! str_ends_with($relyingPartyId, '.localhost')
            && ! str_contains($relyingPartyId, ':');

        if (! $validRelyingParty
            || $origins === []
            || collect($origins)->contains(
                fn (mixed $origin): bool => ! $this->isValidProductionPasskeyOrigin(
                    $origin,
                    $relyingPartyId,
                ),
            )) {
            throw new \RuntimeException(
                'Passkey RP ID and origins must be exact, compatible HTTPS hosts in production.',
            );
        }

        $expectedOrigins = [
            $this->normalizedHttpsOrigin(config('app.url')),
            $this->normalizedHttpsOrigin(config('seo.canonical_origin')),
        ];

        if (in_array(null, $expectedOrigins, true)
            || collect($expectedOrigins)->contains(
                static fn (?string $origin): bool => ! in_array($origin, $origins, true),
            )) {
            throw new \RuntimeException(
                'APP_URL and SEO_CANONICAL_ORIGIN must be exact HTTPS passkey origins.',
            );
        }

        if (! (bool) config('session.encrypt')
            || ! (bool) config('session.secure')
            || ! (bool) config('session.http_only')
            || ! in_array(config('session.same_site'), ['lax', 'strict'], true)) {
            throw new \RuntimeException(
                'Admin MFA requires encrypted, Secure, HttpOnly, Lax/Strict session cookies.',
            );
        }

        if (! in_array(config('session.driver'), ['database', 'redis'], true)) {
            throw new \RuntimeException(
                'Admin MFA requires a server-side database or Redis session driver.',
            );
        }

        if (! in_array(config('cache.default'), ['database', 'redis'], true)) {
            throw new \RuntimeException(
                'Authentication rate limits require a shared database or Redis cache store.',
            );
        }

        $databaseDriver = config(
            'database.connections.'.config('database.default').'.driver',
        );

        if (! in_array($databaseDriver, ['mysql', 'mariadb', 'pgsql', 'sqlsrv'], true)) {
            throw new \RuntimeException(
                'Production security invariants require a database engine with row-level locking.',
            );
        }

        if (config('queue.default') === 'sync') {
            throw new \RuntimeException(
                'A non-sync queue is required in production for enumeration-safe password recovery.',
            );
        }

        if ($this->mailerChainUsesNonDeliveryTransport(
            (string) config('mail.default'),
        )) {
            throw new \RuntimeException(
                'Production password recovery requires delivery mailers; log and array transports are forbidden.',
            );
        }

        if (collect($this->trustedProxies())->contains(
            fn (string $proxy): bool => ! TrustedProxyPolicy::allows($proxy),
        )) {
            throw new \RuntimeException(
                'TRUSTED_PROXIES may contain only explicit proxy IP addresses or bounded CIDRs.',
            );
        }
    }

    private function configureTrustedProxies(): void
    {
        $proxies = $this->trustedProxies();

        if ($proxies === []) {
            return;
        }

        TrustProxies::at($proxies);
        TrustProxies::withHeaders(
            Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
                | Request::HEADER_X_FORWARDED_PREFIX,
        );
    }

    /** @return array<int, string> */
    private function trustedProxies(): array
    {
        return array_values(array_filter(array_map(
            'trim',
            explode(',', (string) config('security.trusted_proxies', '')),
        )));
    }

    private function isValidProductionPasskeyOrigin(
        mixed $origin,
        string $relyingPartyId,
    ): bool {
        if (! is_string($origin) || str_contains($origin, '*')) {
            return false;
        }

        $parts = parse_url($origin);

        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || ! isset($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || ! in_array((string) ($parts['path'] ?? ''), ['', '/'], true)) {
            return false;
        }

        $host = strtolower(rtrim((string) $parts['host'], '.'));

        return $host === $relyingPartyId
            || str_ends_with($host, '.'.$relyingPartyId);
    }

    private function normalizedHttpsOrigin(mixed $url): ?string
    {
        if (! is_string($url)) {
            return null;
        }

        $parts = parse_url($url);

        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || ! isset($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || ! in_array((string) ($parts['path'] ?? ''), ['', '/'], true)) {
            return null;
        }

        $host = strtolower(rtrim((string) $parts['host'], '.'));
        $port = isset($parts['port']) && (int) $parts['port'] !== 443
            ? ':'.(int) $parts['port']
            : '';

        return 'https://'.$host.$port;
    }

    private function isValidApplicationKey(string $configuredKey, string $cipher): bool
    {
        $key = $configuredKey;

        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), true);

            if ($decoded === false) {
                return false;
            }

            $key = $decoded;
        }

        return Encrypter::supported($key, $cipher);
    }

    /**
     * Resolve composite mailers recursively so a failover/round-robin chain
     * cannot quietly send a password-reset credential to logs or nowhere.
     *
     * @param  array<string, true>  $visited
     */
    private function mailerChainUsesNonDeliveryTransport(
        string $mailer,
        array $visited = [],
    ): bool {
        if ($mailer === '' || isset($visited[$mailer])) {
            return true;
        }

        $configuration = config('mail.mailers.'.$mailer);

        if (! is_array($configuration)) {
            return true;
        }

        $transport = strtolower((string) ($configuration['transport'] ?? ''));

        if (in_array($transport, ['log', 'array'], true)) {
            return true;
        }

        if (! in_array($transport, ['failover', 'roundrobin'], true)) {
            return $transport === '';
        }

        $children = $configuration['mailers'] ?? [];

        if (! is_array($children) || $children === []) {
            return true;
        }

        $visited[$mailer] = true;

        foreach ($children as $child) {
            if (! is_string($child)
                || $this->mailerChainUsesNonDeliveryTransport($child, $visited)) {
                return true;
            }
        }

        return false;
    }
}
