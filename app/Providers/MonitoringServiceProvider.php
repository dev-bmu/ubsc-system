<?php

namespace App\Providers;

use App\Console\Commands\AwaitLogIngestionReceipt;
use App\Console\Commands\CollectMonitoringSnapshot;
use App\Console\Commands\DeliverMonitoringAlerts;
use App\Console\Commands\DispatchMonitoringQueueProbe;
use App\Console\Commands\GenerateCapacityPlan;
use App\Console\Commands\ImportRecoveryAttestation;
use App\Console\Commands\ProbeMonitoringAlerts;
use App\Console\Commands\PruneCapacityControlHistory;
use App\Console\Commands\PruneMonitoringHistory;
use App\Console\Commands\PrunePerformanceMetrics;
use App\Console\Commands\RecommendQueueWorkerCapacity;
use App\Console\Commands\RecordBackupFailure;
use App\Console\Commands\RecordCapacityEvidence;
use App\Console\Commands\RecordCapacityPlatformObservation;
use App\Console\Commands\RecordMonitoringHeartbeat;
use App\Console\Commands\RecordPitrObservation;
use App\Console\Commands\RecordRestoreDrillEvidence;
use App\Console\Commands\RecordVerifiedBackupHeartbeat;
use App\Console\Commands\RetryDeadMonitoringAlerts;
use App\Console\Commands\ScanDataIntegrity;
use App\Console\Commands\ValidateBackgroundJobPipeline;
use App\Console\Commands\VerifyRecoveryEvidence;
use App\Services\Monitoring\BackgroundQueueRegistry;
use App\Services\Monitoring\QueuePerformanceTracker;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class MonitoringServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(QueuePerformanceTracker::class);

        $this->commands([
            AwaitLogIngestionReceipt::class,
            RecordMonitoringHeartbeat::class,
            ImportRecoveryAttestation::class,
            DispatchMonitoringQueueProbe::class,
            CollectMonitoringSnapshot::class,
            DeliverMonitoringAlerts::class,
            PruneMonitoringHistory::class,
            PrunePerformanceMetrics::class,
            ProbeMonitoringAlerts::class,
            RecordVerifiedBackupHeartbeat::class,
            RecordBackupFailure::class,
            RecordPitrObservation::class,
            RecordRestoreDrillEvidence::class,
            VerifyRecoveryEvidence::class,
            RetryDeadMonitoringAlerts::class,
            RecommendQueueWorkerCapacity::class,
            GenerateCapacityPlan::class,
            PruneCapacityControlHistory::class,
            RecordCapacityEvidence::class,
            RecordCapacityPlatformObservation::class,
            ScanDataIntegrity::class,
            ValidateBackgroundJobPipeline::class,
        ]);
    }

    public function boot(): void
    {
        RateLimiter::for('monitoring-external-sli', function (Request $request): array {
            $ip = hash('sha256', (string) ($request->ip() ?? 'unknown'));

            return [
                Limit::perMinute(20)->by('monitoring-external-sli:ip:minute:'.$ip),
                Limit::perHour(100)->by('monitoring-external-sli:ip:hour:'.$ip),
                Limit::perMinute(300)->by('monitoring-external-sli:global'),
            ];
        });

        RateLimiter::for('monitoring-log-receipts', function (Request $request): array {
            $ip = hash('sha256', (string) ($request->ip() ?? 'unknown'));

            return [
                Limit::perMinute(20)->by('monitoring-log-receipts:ip:minute:'.$ip),
                Limit::perHour(200)->by('monitoring-log-receipts:ip:hour:'.$ip),
                Limit::perMinute(300)->by('monitoring-log-receipts:global'),
            ];
        });

        $this->loadRoutesFrom(base_path('routes/monitoring.php'));

        Event::listen(
            JobProcessing::class,
            static fn (JobProcessing $event) => app(QueuePerformanceTracker::class)
                ->processing($event),
        );
        Event::listen(
            JobProcessed::class,
            static fn (JobProcessed $event) => app(QueuePerformanceTracker::class)
                ->processed($event),
        );
        Event::listen(
            JobFailed::class,
            static fn (JobFailed $event) => app(QueuePerformanceTracker::class)
                ->failed($event),
        );
        Event::listen(
            JobExceptionOccurred::class,
            static fn (JobExceptionOccurred $event) => app(QueuePerformanceTracker::class)
                ->exceptionOccurred($event),
        );

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule): void {
            if (! (bool) config('monitoring.enabled', true)) {
                return;
            }

            $schedule->command('monitoring:heartbeat --quiet')
                ->everyMinute()
                ->name('monitoring-scheduler-heartbeat')
                ->withoutOverlapping(2)
                ->onOneServer();

            foreach (app(BackgroundQueueRegistry::class)->all() as $definition) {
                $schedule->command('monitoring:queue-probe', [
                    '--connection' => $definition['connection'],
                    '--queue' => $definition['queue'],
                    '--quiet' => true,
                ])
                    ->everyMinute()
                    ->name('monitoring-queue-'.substr(hash(
                        'sha256',
                        $definition['connection']."\0".$definition['queue'],
                    ), 0, 16))
                    ->withoutOverlapping(2)
                    ->onOneServer();
            }

            $schedule->command('monitor:data-integrity --fail-on=never --quiet')
                ->everyFiveMinutes()
                ->name('monitoring-data-integrity-scan')
                ->withoutOverlapping(10)
                ->onOneServer();

            $schedule->command('monitoring:collect --quiet')
                ->everyMinute()
                ->name('monitoring-collect-snapshot')
                ->withoutOverlapping(2)
                ->onOneServer();

            $schedule->command('monitoring:alerts:deliver --quiet')
                ->everyMinute()
                ->name('monitoring-deliver-alerts')
                ->withoutOverlapping(2)
                ->onOneServer();

            $schedule->command('monitoring:alerts:canary --quiet')
                ->dailyAt('03:10')
                ->name('monitoring-off-host-alert-canary')
                ->withoutOverlapping(10)
                ->onOneServer();

            $schedule->command('monitoring:prune --quiet')
                ->dailyAt('02:10')
                ->name('monitoring-prune-history')
                ->withoutOverlapping(30)
                ->onOneServer();

            $schedule->command('performance:prune --quiet')
                ->hourlyAt(17)
                ->name('performance-prune-buckets')
                ->withoutOverlapping(20)
                ->onOneServer();

            if ((bool) config('capacity_planning.enabled', false)
                && config('capacity_planning.mode') === 'signed_plan') {
                $schedule->command('capacity:plan --quiet')
                    ->everyMinute()
                    ->name('capacity-generate-signed-plan')
                    ->withoutOverlapping(2)
                    ->onOneServer();
            }

            $schedule->command('capacity:prune --quiet')
                ->dailyAt('02:25')
                ->name('capacity-prune-control-history')
                ->withoutOverlapping(30)
                ->onOneServer();

            $schedule->command('recovery:evidence-verify --record-heartbeat --quiet')
                ->hourlyAt(23)
                ->name('recovery-verify-evidence-chain')
                ->withoutOverlapping(30)
                ->onOneServer();

            $schedule->command('replication:ledger-verify --record-heartbeat --quiet')
                ->hourlyAt(37)
                ->name('replication-verify-event-ledger')
                ->withoutOverlapping(30)
                ->onOneServer();

            if ((bool) config('resilience_drills.enabled', false)
                || (bool) config('resilience_drills.enforce', false)) {
                $schedule->command('resilience:evidence:verify --record-heartbeat --quiet')
                    ->dailyAt('03:30')
                    ->name('resilience-verify-evidence-chain')
                    ->withoutOverlapping(30)
                    ->onOneServer();
            }
        });
    }
}
