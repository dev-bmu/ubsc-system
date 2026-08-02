<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

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
    }
}
