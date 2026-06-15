<?php

use App\Models\Booking;
use App\Models\Transaction;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::call(function () {
    Transaction::where('payment_status', 'UNPAID')
        ->where('created_at', '<', now()->subHour())
        ->with('transactionable')
        ->each(function (Transaction $tx) {
            $tx->update(['payment_status' => 'EXPIRED']);
            if ($tx->transactionable instanceof Booking) {
                $tx->transactionable->update(['status' => 'cancelled']);
            }
        });
})->everyFifteenMinutes()->name('expire-unpaid-transactions');
