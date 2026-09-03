<?php

namespace App\Providers;

use App\Support\AuthenticationIdentity;
use App\Support\TrafficIdentity;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\HttpFoundation\Response;

final class TrafficProtectionServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('web-traffic', function (Request $request): array|Limit {
            if (! $this->enabled()) {
                return Limit::none();
            }

            $limits = (array) config('ddos_protection.application.limits.web', []);

            return [
                Limit::perSecond((int) ($limits['per_ip_per_second'] ?? 40))
                    ->by('web:second:'.TrafficIdentity::client($request, 'web'))
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['per_ip_per_minute'] ?? 1_200))
                    ->by('web:minute:'.TrafficIdentity::client($request, 'web'))
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['per_network_per_minute'] ?? 12_000))
                    ->by('web:network:'.TrafficIdentity::network($request, 'web'))
                    ->response($this->response()),
                Limit::perSecond((int) ($limits['global_per_second'] ?? 600))
                    ->by('web:global:second')
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['global_per_minute'] ?? 24_000))
                    ->by('web:global:minute')
                    ->response($this->response()),
            ];
        });

        RateLimiter::for('public-registration', function (Request $request): array|Limit {
            if (! $this->enabled()) {
                return Limit::none();
            }

            $limits = (array) config('ddos_protection.application.limits.registration', []);
            $email = AuthenticationIdentity::opaque(
                AuthenticationIdentity::normalizeEmail($request->input('email')),
                'traffic:registration:account',
            );

            return [
                Limit::perMinutes(15, (int) ($limits['per_ip_per_15_minutes'] ?? 5))
                    ->by('registration:ip:'.TrafficIdentity::client($request, 'registration'))
                    ->response($this->response()),
                Limit::perHour((int) ($limits['per_network_per_hour'] ?? 100))
                    ->by('registration:network:'.TrafficIdentity::network($request, 'registration'))
                    ->response($this->response()),
                Limit::perHour(5)
                    ->by('registration:account:'.$email)
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['global_per_minute'] ?? 300))
                    ->by('registration:global')
                    ->response($this->response()),
            ];
        });

        RateLimiter::for('review-write', function (Request $request): array|Limit {
            if (! $this->enabled()) {
                return Limit::none();
            }

            $limits = (array) config('ddos_protection.application.limits.review', []);

            return [
                Limit::perHour((int) ($limits['per_actor_per_hour'] ?? 10))
                    ->by('review:actor:'.TrafficIdentity::actor($request, 'review'))
                    ->response($this->response()),
                Limit::perHour((int) ($limits['per_ip_per_hour'] ?? 60))
                    ->by('review:ip:'.TrafficIdentity::client($request, 'review'))
                    ->response($this->response()),
            ];
        });

        RateLimiter::for('oauth-entry', function (Request $request): array|Limit {
            if (! $this->enabled()) {
                return Limit::none();
            }

            $limits = (array) config('ddos_protection.application.limits.oauth', []);

            return [
                Limit::perMinute((int) ($limits['per_ip_per_minute'] ?? 60))
                    ->by('oauth:ip:'.TrafficIdentity::client($request, 'oauth'))
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['per_network_per_minute'] ?? 600))
                    ->by('oauth:network:'.TrafficIdentity::network($request, 'oauth'))
                    ->response($this->response()),
            ];
        });

        RateLimiter::for('sitemap-read', function (Request $request): array|Limit {
            if (! $this->enabled()) {
                return Limit::none();
            }

            $limits = (array) config('ddos_protection.application.limits.sitemap', []);

            return [
                Limit::perMinute((int) ($limits['per_ip_per_minute'] ?? 30))
                    ->by('sitemap:ip:'.TrafficIdentity::client($request, 'sitemap'))
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['global_per_minute'] ?? 1_000))
                    ->by('sitemap:global')
                    ->response($this->response()),
            ];
        });

        RateLimiter::for('public-analytics', function (Request $request): array|Limit {
            if (! $this->enabled()) {
                return Limit::none();
            }

            $limits = (array) config('ddos_protection.application.limits.analytics', []);

            return [
                Limit::perMinute((int) ($limits['per_ip_per_minute'] ?? 180))
                    ->by('analytics:ip:'.TrafficIdentity::client($request, 'analytics'))
                    ->response($this->response()),
                Limit::perMinute((int) ($limits['per_network_per_minute'] ?? 3_000))
                    ->by('analytics:network:'.TrafficIdentity::network($request, 'analytics'))
                    ->response($this->response()),
            ];
        });
    }

    private function enabled(): bool
    {
        return (bool) config('ddos_protection.application.enabled', false);
    }

    /** @return callable(Request,array<string,string|int>):Response */
    private function response(): callable
    {
        return static function (Request $request, array $headers): Response {
            $headers = [
                ...$headers,
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'X-Content-Type-Options' => 'nosniff',
            ];
            $message = 'Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi.';

            if ($request->expectsJson() || $request->headers->has('X-Inertia')) {
                return response()->json(['message' => $message], 429, $headers);
            }

            return response($message, 429, [
                ...$headers,
                'Content-Type' => 'text/plain; charset=UTF-8',
            ]);
        };
    }
}
