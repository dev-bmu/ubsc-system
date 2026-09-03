<?php

namespace App\Providers;

use App\Console\Commands\BackfillServiceAuditBaseline;
use App\Console\Commands\VerifyServiceAuditLedger;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Models\Membership;
use App\Models\Transaction;
use App\Observers\ServiceAuditObserver;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\ServiceProvider;

final class DataGovernanceServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->commands([
            BackfillServiceAuditBaseline::class,
            VerifyServiceAuditLedger::class,
        ]);
    }

    public function boot(): void
    {
        foreach ([
            Booking::class,
            BookingOrder::class,
            Membership::class,
            Transaction::class,
            Facility::class,
            FacilityUnit::class,
        ] as $model) {
            $model::observe(ServiceAuditObserver::class);
        }

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule): void {
            $schedule->command('services:audit-verify --quiet')
                ->everyFiveMinutes()
                ->name('service-audit-ledger-verification')
                ->withoutOverlapping(10)
                ->onOneServer();
        });
    }
}
