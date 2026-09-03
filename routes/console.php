<?php

use App\Jobs\RecoverInterruptedPayments;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::job(new RecoverInterruptedPayments(
    batchSize: (int) config('background_jobs.payment_recovery.batch_size', 100),
))
    ->everyMinute()
    ->name('recover-interrupted-payments')
    ->withoutOverlapping(2)
    ->onOneServer();

Schedule::command('payments:logs:archive --quiet')
    ->dailyAt('01:30')
    ->name('archive-payment-operation-logs')
    ->withoutOverlapping(30)
    ->onOneServer();

Schedule::command('gallery:publish-scheduled')
    ->everyMinute()
    ->name('publish-scheduled-gallery-items')
    ->withoutOverlapping(5)
    ->onOneServer();

Schedule::command('gallery:prune')
    ->dailyAt('02:30')
    ->name('prune-gallery-operational-data')
    ->withoutOverlapping(30)
    ->onOneServer();

Schedule::command('gallery:aggregate-analytics')
    ->dailyAt('00:15')
    ->name('aggregate-gallery-analytics')
    ->withoutOverlapping(30)
    ->onOneServer();
