<?php

use App\Http\Controllers\Admin\MonitoringController;
use App\Http\Controllers\ExternalSliIngestController;
use App\Http\Controllers\LogIngestionReceiptController;
use App\Http\Controllers\ReadinessController;
use App\Http\Middleware\EnforceRequestResourceEnvelope;
use App\Http\Middleware\EnforceTrafficRateLimits;
use Illuminate\Support\Facades\Route;

// Public load-balancer readiness: deliberately outside the stateful web
// stack and deliberately coarse. Laravel's built-in /up remains liveness.
Route::get('/health/ready', ReadinessController::class)
    ->name('monitoring.readiness');

Route::post('/monitoring/external-sli', ExternalSliIngestController::class)
    ->middleware([
        EnforceRequestResourceEnvelope::class,
        EnforceTrafficRateLimits::class,
        'throttle:monitoring-external-sli',
    ])
    ->name('monitoring.external-sli.ingest');

Route::post('/monitoring/log-receipts', LogIngestionReceiptController::class)
    ->middleware([
        EnforceRequestResourceEnvelope::class,
        EnforceTrafficRateLimits::class,
        'throttle:monitoring-log-receipts',
    ])
    ->name('monitoring.log-receipts.ingest');

Route::middleware([
    'web',
    'auth',
    'auth.session',
    'role:Administrator|Manager|Finance|Staff Front Office|Staff Central',
    'admin.session',
    'permission:view-system-operations',
])
    ->prefix('ubsc-staff/settings/monitoring')
    ->name('admin.settings.monitoring.')
    ->group(function (): void {
        Route::get('', [MonitoringController::class, 'index'])->name('index');
        Route::get('snapshot', [MonitoringController::class, 'snapshot'])->name('snapshot');
    });
