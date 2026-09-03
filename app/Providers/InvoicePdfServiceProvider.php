<?php

namespace App\Providers;

use App\Console\Commands\ValidateInvoicePdfPipeline;
use App\Models\Transaction;
use App\Observers\PaidInvoicePdfObserver;
use App\Support\AuthenticationIdentity;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class InvoicePdfServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->commands([
            ValidateInvoicePdfPipeline::class,
        ]);
    }

    public function boot(): void
    {
        Transaction::observe(PaidInvoicePdfObserver::class);

        RateLimiter::for('invoice-pdf', function (Request $request): array {
            $account = AuthenticationIdentity::opaque(
                (string) ($request->user()?->getAuthIdentifier() ?? 'guest'),
                'invoice-pdf-account',
            );
            $ip = AuthenticationIdentity::opaque(
                (string) $request->ip(),
                'invoice-pdf-ip',
            );

            return [
                Limit::perMinute(30)->by('invoice-pdf:account:minute:'.$account),
                Limit::perHour(300)->by('invoice-pdf:account:hour:'.$account),
                Limit::perMinute(600)->by('invoice-pdf:ip:'.$ip),
                Limit::perMinute(5_000)->by('invoice-pdf:global'),
            ];
        });

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule): void {
            $schedule->command('invoices:pdf:lifecycle --quiet')
                ->dailyAt('03:10')
                ->name('manage-invoice-pdf-artifacts')
                ->withoutOverlapping(30)
                ->onOneServer();
        });
    }
}
