<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Jobs\RecordQueueWorkerHeartbeat;
use App\Models\MonitoringHeartbeat;
use App\Services\Monitoring\BackgroundQueueRegistry;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Monitoring\MonitoringIncidentManager;
use App\Services\Production\ProcessRuntimeProbe;
use App\Services\Production\ProcessSupervisionContract;
use App\Services\Production\ScheduledTaskSafetyContract;
use Carbon\CarbonImmutable;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;
use Tests\TestCase;

final class ProcessSupervisionTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_every_registered_scheduled_task_has_distributed_bounded_locks(): void
    {
        $report = app(ScheduledTaskSafetyContract::class)->report();

        $this->assertTrue($report['valid']);
        $this->assertSame(0, $report['failures']);
    }

    public function test_an_unlocked_scheduled_task_is_rejected(): void
    {
        app(Schedule::class)
            ->call(static fn (): null => null)
            ->everyMinute()
            ->name('unsafe-test-task');

        $report = app(ScheduledTaskSafetyContract::class)->report();
        $failed = collect($report['checks'])
            ->where('status', 'fail')
            ->pluck('code');

        $this->assertFalse($report['valid']);
        $this->assertTrue($failed->contains('schedule.unsafe-test-task.locks'));
    }

    public function test_runtime_probe_fails_closed_before_any_dead_man_heartbeat_exists(): void
    {
        $report = app(ProcessRuntimeProbe::class)->report();

        $this->assertFalse($report['valid']);
        $this->assertGreaterThan(0, $report['failures']);
    }

    public function test_runtime_probe_accepts_fresh_scheduler_and_every_isolated_worker(): void
    {
        $now = CarbonImmutable::parse('2026-08-23 12:00:00', 'UTC');
        CarbonImmutable::setTestNow($now);
        $this->recordHealthyProcessHeartbeats();

        $report = app(ProcessRuntimeProbe::class)->report();

        $this->assertTrue($report['valid']);
        $this->assertTrue($report['strict_valid']);
        $this->assertSame(0, $report['failures']);
        $this->assertSame(0, $report['warnings']);
    }

    public function test_runtime_probe_warns_then_fails_as_worker_heartbeats_age(): void
    {
        $now = CarbonImmutable::parse('2026-08-23 12:00:00', 'UTC');
        CarbonImmutable::setTestNow($now);
        $this->recordHealthyProcessHeartbeats();

        CarbonImmutable::setTestNow($now->addSeconds(130));
        $warning = app(ProcessRuntimeProbe::class)->report();
        $this->assertTrue($warning['valid']);
        $this->assertFalse($warning['strict_valid']);
        $this->assertGreaterThan(0, $warning['warnings']);

        CarbonImmutable::setTestNow($now->addSeconds(700));
        $outage = app(ProcessRuntimeProbe::class)->report();
        $this->assertFalse($outage['valid']);
        $this->assertGreaterThan(0, $outage['failures']);
    }

    public function test_runtime_probe_rejects_a_future_dated_heartbeat(): void
    {
        $now = CarbonImmutable::parse('2026-08-23 12:00:00', 'UTC');
        CarbonImmutable::setTestNow($now);
        config()->set(
            'process_supervision.safety.maximum_heartbeat_clock_skew_seconds',
            30,
        );
        $this->recordHealthyProcessHeartbeats();

        MonitoringHeartbeat::query()
            ->whereKey((string) config('monitoring.scheduler.heartbeat_key', 'scheduler'))
            ->update(['observed_at' => now()->addSeconds(31)]);

        $report = app(ProcessRuntimeProbe::class)->report();
        $failed = collect($report['checks'])->where('status', 'fail');
        $schedulerCheck = $failed->firstWhere('code', 'runtime.scheduler');

        $this->assertFalse($report['valid']);
        $this->assertIsArray($schedulerCheck);
        $this->assertStringContainsString(
            'future-dated',
            (string) $schedulerCheck['message'],
        );
    }

    public function test_runtime_probe_exposes_delayed_queue_execution_as_warning_then_failure(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse(
            '2026-08-23 12:00:00',
            'UTC',
        ));
        $this->recordHealthyProcessHeartbeats();
        $queue = app(BackgroundQueueRegistry::class)->all()[0];
        $key = MonitoringHeartbeatRecorder::queueKey(
            $queue['connection'],
            $queue['queue'],
        );

        MonitoringHeartbeat::query()->whereKey($key)->update([
            'latency_ms' => 121_000,
        ]);
        $warning = app(ProcessRuntimeProbe::class)->report();

        $this->assertTrue($warning['valid']);
        $this->assertFalse($warning['strict_valid']);
        $this->assertGreaterThan(0, $warning['warnings']);

        MonitoringHeartbeat::query()->whereKey($key)->update([
            'latency_ms' => 601_000,
        ]);
        $failure = app(ProcessRuntimeProbe::class)->report();

        $this->assertFalse($failure['valid']);
        $this->assertGreaterThan(0, $failure['failures']);
    }

    public function test_queue_probe_cannot_publish_health_from_a_future_dispatch_timestamp(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse(
            '2026-08-23 12:00:00',
            'Asia/Jakarta',
        ));
        config()->set(
            'process_supervision.safety.maximum_heartbeat_clock_skew_seconds',
            30,
        );
        $job = new RecordQueueWorkerHeartbeat(
            probeConnection: 'database',
            probeQueue: 'critical',
            dispatchedAt: now()->addSeconds(31)->toIso8601String(),
        );

        $this->expectException(RuntimeException::class);
        $job->handle(
            app(MonitoringHeartbeatRecorder::class),
            app(MonitoringIncidentManager::class),
        );
    }

    public function test_artisan_command_validates_both_bundled_profiles(): void
    {
        foreach (['database', 'redis'] as $profile) {
            $this->assertSame(0, Artisan::call('production:process-check', [
                '--profile' => $profile,
                '--strict' => true,
            ]));
        }
    }

    public function test_active_artifact_must_point_workers_at_the_current_release(): void
    {
        config()->set('background_jobs.connection', 'database');
        config()->set('background_jobs.media_connection', 'database-long');
        config()->set('invoice_pdf.prewarm.connection', '');
        $contents = file_get_contents(base_path(
            'deploy/supervisor/ubsc-database.conf.example',
        ));
        $this->assertIsString($contents);
        $active = str_replace(
            ['APP_DIRECTORY', 'RUN_AS_USER'],
            [base_path(), 'ubsc-runtime'],
            $contents,
        );
        $valid = app(ProcessSupervisionContract::class)->inspect(
            'database',
            $active,
            false,
        );
        $stale = app(ProcessSupervisionContract::class)->inspect(
            'database',
            str_replace(base_path(), base_path('not-the-current-release'), $active),
            false,
        );

        $this->assertTrue(
            $valid['valid'],
            json_encode(
                collect($valid['checks'])->where('status', 'fail')->values()->all(),
                JSON_THROW_ON_ERROR,
            ),
        );
        $this->assertFalse($stale['valid']);
        $this->assertContains(
            'scheduler.lifecycle',
            collect($stale['checks'])->where('status', 'fail')->pluck('code')->all(),
        );
    }

    private function recordHealthyProcessHeartbeats(): void
    {
        $recorder = app(MonitoringHeartbeatRecorder::class);
        $recorder->record(
            key: (string) config('monitoring.scheduler.heartbeat_key', 'scheduler'),
            category: 'scheduler',
            status: MonitoringStatus::Operational,
            latencyMs: 1,
        );

        foreach (app(BackgroundQueueRegistry::class)->all() as $queue) {
            $recorder->record(
                key: MonitoringHeartbeatRecorder::queueKey(
                    $queue['connection'],
                    $queue['queue'],
                ),
                category: 'queue',
                status: MonitoringStatus::Operational,
                latencyMs: 5,
            );
        }
    }
}
