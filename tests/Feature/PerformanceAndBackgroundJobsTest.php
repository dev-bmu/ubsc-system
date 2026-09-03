<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Jobs\ProcessGalleryMedia;
use App\Jobs\PurgeGalleryMedia;
use App\Jobs\RecoverInterruptedPayments;
use App\Models\MonitoringHeartbeat;
use App\Notifications\Auth\ResetPasswordNotification;
use App\Notifications\Auth\VerifyEmailNotification;
use App\Services\Monitoring\DatabasePerformanceMonitor;
use App\Services\Monitoring\ExternalAvailabilityConfiguration;
use App\Services\Monitoring\PerformanceCapacityMonitor;
use App\Services\Monitoring\PerformanceMetricRepository;
use App\Services\Monitoring\QueueWorkerCapacityAdvisor;
use App\Services\Monitoring\RequestPerformanceRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class PerformanceAndBackgroundJobsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('performance.enabled', true);
        config()->set('performance.driver', 'database');
        config()->set('performance.window_minutes', 5);
        config()->set('performance.minimum_samples', 3);
        config()->set('background_jobs.connection', 'database');
        config()->set('background_jobs.media_connection', 'database-long');
        config()->set('background_jobs.monitoring.queues', ['default']);
        config()->set('monitoring.queue.connection', 'database');
        config()->set('monitoring.queue.queue', 'default');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();

        parent::tearDown();
    }

    public function test_request_metrics_are_atomically_aggregated_into_bounded_histograms(): void
    {
        $now = CarbonImmutable::parse('2026-08-18 10:04:30', 'UTC');
        CarbonImmutable::setTestNow($now);
        $metrics = app(PerformanceMetricRepository::class);

        $metrics->recordRequest('public_read', 30, false, $now);
        $metrics->recordRequest('public_read', 100, false, $now);
        $metrics->recordRequest('public_read', 700, true, $now);

        $this->assertDatabaseHas('performance_request_buckets', [
            'scope' => 'public_read',
            'latency_upper_bound_ms' => 800,
            'request_count' => 1,
            'error_count' => 1,
        ]);

        $performance = app(PerformanceCapacityMonitor::class)->summary();

        $this->assertSame(3, $performance['http']['request_count']);
        $this->assertSame(100, $performance['http']['p50_ms']);
        $this->assertSame(800, $performance['http']['p95_ms']);
        $this->assertSame(800, $performance['http']['p99_ms']);
        $this->assertSame(33.333, $performance['http']['error_rate_percent']);
        $this->assertSame('ready', $performance['http']['sample_status']);
    }

    public function test_request_recorder_stores_only_a_low_cardinality_scope(): void
    {
        $request = Request::create('/checkout/booking/123?token=secret', 'POST', [
            'email' => 'private@example.test',
        ]);
        $request->setRouteResolver(static fn () => new class
        {
            public function getName(): string
            {
                return 'checkout.booking.store';
            }
        });

        app(RequestPerformanceRecorder::class)->record(
            $request,
            new Response('', 500),
            175,
        );

        $this->assertDatabaseCount('performance_request_buckets', 1);
        $this->assertDatabaseHas('performance_request_buckets', [
            'scope' => 'booking_checkout',
            'latency_upper_bound_ms' => 200,
            'request_count' => 1,
            'error_count' => 1,
        ]);
        $columns = array_map(
            static fn (array $column): string => $column['name'],
            $this->app['db']->getSchemaBuilder()->getColumns('performance_request_buckets'),
        );
        $this->assertNotContains('url', $columns);
        $this->assertNotContains('user_id', $columns);
        $this->assertNotContains('ip', $columns);
    }

    public function test_queue_metrics_report_throughput_wait_runtime_and_terminal_failures(): void
    {
        $now = CarbonImmutable::parse('2026-08-18 11:02:00', 'UTC');
        CarbonImmutable::setTestNow($now);
        $metrics = app(PerformanceMetricRepository::class);

        $metrics->recordQueue('database', 'default', 10, 40, false, $now);
        $metrics->recordQueue('database', 'default', 80, 450, false, $now);
        $metrics->recordQueue('database', 'default', 650, 1_600, true, $now);

        $performance = app(PerformanceCapacityMonitor::class)->summary();
        $queue = $performance['queues'];

        $this->assertSame(3, $queue['processed_count']);
        $this->assertSame(800, $queue['p95_wait_ms']);
        $this->assertSame(2_000, $queue['p95_runtime_ms']);
        $this->assertSame(33.333, $queue['error_rate_percent']);
        $this->assertCount(1, $queue['items']);
    }

    public function test_long_running_and_customer_critical_jobs_have_safe_queue_contracts(): void
    {
        $recovery = new RecoverInterruptedPayments;
        $image = new ProcessGalleryMedia(41);
        $purge = new PurgeGalleryMedia('f50fd81f-8e79-49b1-a9af-f8679ef307ca');
        $reset = new ResetPasswordNotification('opaque-reset-token');
        $verification = new VerifyEmailNotification;

        $this->assertSame('database', $recovery->connection);
        $this->assertSame('critical', $recovery->queue);
        $this->assertLessThan(config('queue.connections.database.retry_after'), $recovery->timeout);
        $this->assertSame('database-long', $image->connection);
        $this->assertSame('media-image', $image->queue);
        $this->assertLessThan(config('queue.connections.database-long.retry_after'), $image->timeout);
        $this->assertSame('media-maintenance', $purge->queue);
        $this->assertSame('notifications', $reset->queue);
        $this->assertSame('notifications', $verification->queue);

        $scheduled = collect(app(Schedule::class)->events())
            ->contains(static fn ($event): bool => $event->description === 'recover-interrupted-payments');
        $this->assertTrue($scheduled);
    }

    public function test_database_capacity_is_honestly_unknown_on_unsupported_sqlite(): void
    {
        $summary = app(DatabasePerformanceMonitor::class)->summary();

        $this->assertFalse($summary['supported']);
        $this->assertSame('sqlite', $summary['driver']);
        $this->assertSame('unknown', $summary['status']);
        $this->assertNull($summary['connections']['utilization_percent']);
    }

    public function test_deployment_doctor_accepts_the_safe_queue_and_metric_contract(): void
    {
        $this->assertSame(0, Artisan::call('background-jobs:doctor'));
        $this->assertSame(0, Artisan::call('background-jobs:doctor', [
            '--probe-backends' => true,
        ]));
    }

    public function test_deployment_doctor_rejects_queue_socket_timeout_below_blocking_pop(): void
    {
        config()->set('background_jobs.connection', 'redis');
        config()->set('background_jobs.media_connection', 'redis-long');
        config()->set('queue.connections.redis', [
            'driver' => 'redis',
            'connection' => 'queue',
            'queue' => 'default',
            'retry_after' => 90,
            'block_for' => 5,
            'after_commit' => true,
        ]);
        config()->set('queue.connections.redis-long', [
            'driver' => 'redis',
            'connection' => 'queue',
            'queue' => 'media-video',
            'retry_after' => 1_200,
            'block_for' => 5,
            'after_commit' => true,
        ]);
        config()->set('database.redis.queue.read_timeout', 5);

        $this->assertSame(1, Artisan::call('background-jobs:doctor'));
        $this->assertStringContainsString(
            'must exceed block_for',
            Artisan::output(),
        );

        config()->set('database.redis.queue.read_timeout', 6);

        $this->assertSame(0, Artisan::call('background-jobs:doctor'));
    }

    public function test_scope_capacity_is_separate_from_unproven_global_capacity(): void
    {
        config()->set('performance.scopes.public_read.tested_requests_per_second', 0.005);
        config()->set('performance.capacity.tested_requests_per_second', null);
        $now = CarbonImmutable::parse('2026-08-19 10:00:00', 'UTC');
        CarbonImmutable::setTestNow($now);
        $metrics = app(PerformanceMetricRepository::class);

        foreach (range(1, 3) as $sample) {
            $metrics->recordRequest('public_read', 20 + $sample, false, $now);
        }

        $http = app(PerformanceCapacityMonitor::class)->summary()['http'];
        $public = collect($http['scopes'])->firstWhere('key', 'public_read');

        $this->assertSame('outage', $public['capacity']['status']);
        $this->assertSame('outage', $public['status']);
        $this->assertNull($http['capacity']['tested_requests_per_second']);
        $this->assertSame('unknown', $http['capacity']['status']);
    }

    public function test_configured_capacity_remains_unknown_until_the_sample_is_stable(): void
    {
        config()->set('performance.capacity.tested_requests_per_second', 100);

        $http = app(PerformanceCapacityMonitor::class)->summary()['http'];

        $this->assertSame('collecting', $http['sample_status']);
        $this->assertSame('unknown', $http['capacity']['status']);
        $this->assertSame(100.0, $http['capacity']['tested_requests_per_second']);
    }

    public function test_worker_capacity_advisor_uses_measured_load_backlog_and_bounded_headroom(): void
    {
        config()->set('background_jobs.worker_capacity.automation_enabled', true);
        config()->set('background_jobs.worker_capacity.minimum.critical', 2);
        config()->set('background_jobs.worker_capacity.maximum.critical', 12);
        config()->set('background_jobs.worker_capacity.target_utilization_percent', 70);
        config()->set('background_jobs.worker_capacity.headroom_percent', 30);
        config()->set('background_jobs.worker_capacity.backlog_catch_up_seconds', 300);

        $recommendation = app(QueueWorkerCapacityAdvisor::class)->recommend(
            [
                'key' => 'critical',
                'label' => 'Critical',
                'connection' => 'database',
                'queue' => 'critical',
            ],
            [
                'sample_status' => 'ready',
                'jobs_per_minute' => 120,
                'p95_runtime_ms' => 500,
            ],
            [
                'depth' => 70,
                'depth_is_capped' => false,
            ],
        );

        $this->assertSame(2, $recommendation['steady_state_workers']);
        $this->assertSame(1, $recommendation['backlog_workers']);
        $this->assertSame(3, $recommendation['recommended']);
        $this->assertTrue($recommendation['automation_eligible']);
        $this->assertFalse($recommendation['capacity_limited']);
    }

    public function test_worker_capacity_never_automates_from_collecting_or_capped_samples(): void
    {
        config()->set('background_jobs.worker_capacity.automation_enabled', true);
        config()->set('background_jobs.worker_capacity.minimum.critical', 2);
        config()->set('background_jobs.worker_capacity.maximum.critical', 12);
        $advisor = app(QueueWorkerCapacityAdvisor::class);
        $definition = [
            'key' => 'critical',
            'label' => 'Critical',
            'connection' => 'database',
            'queue' => 'critical',
        ];

        $collecting = $advisor->recommend($definition, [
            'sample_status' => 'collecting',
            'jobs_per_minute' => 1,
            'p95_runtime_ms' => null,
        ], ['depth' => 0, 'depth_is_capped' => false]);
        $capped = $advisor->recommend($definition, [
            'sample_status' => 'ready',
            'jobs_per_minute' => 1,
            'p95_runtime_ms' => 100,
        ], ['depth' => 1_000, 'depth_is_capped' => true]);

        $this->assertSame(2, $collecting['recommended']);
        $this->assertFalse($collecting['automation_eligible']);
        $this->assertSame(12, $capped['recommended']);
        $this->assertFalse($capped['automation_eligible']);
        $this->assertTrue($capped['capacity_limited']);
    }

    public function test_worker_capacity_exposes_when_measured_demand_exceeds_the_safe_ceiling(): void
    {
        config()->set('background_jobs.worker_capacity.automation_enabled', true);
        config()->set('background_jobs.worker_capacity.minimum.critical', 2);
        config()->set('background_jobs.worker_capacity.maximum.critical', 12);

        $recommendation = app(QueueWorkerCapacityAdvisor::class)->recommend([
            'key' => 'critical',
            'label' => 'Critical',
            'connection' => 'database',
            'queue' => 'critical',
        ], [
            'sample_status' => 'ready',
            'jobs_per_minute' => 600,
            'p95_runtime_ms' => 1_000,
        ], ['depth' => 0, 'depth_is_capped' => false]);

        $this->assertSame(12, $recommendation['recommended']);
        $this->assertTrue($recommendation['capacity_limited']);
        $this->assertStringContainsString('exceeds', $recommendation['reason']);
    }

    public function test_external_monitoring_is_only_reported_configured_for_a_complete_https_contract(): void
    {
        config()->set('app.url', 'https://ubsportcenter.co.id');
        config()->set('monitoring.external.enabled', true);
        config()->set('monitoring.external.provider', 'github-actions');
        config()->set('observability.external_sli.ingest_enabled', true);
        config()->set('observability.external_sli.provider', 'github-actions');
        config()->set('observability.external_sli.signing_keys', [
            'v1' => 'external-synthetic-signing-key-2026-v1',
        ]);
        config()->set('monitoring.external.check_url', 'http://example.test/health/ready');

        $this->assertFalse(
            app(ExternalAvailabilityConfiguration::class)
                ->summary()['external_monitoring_configured'],
        );

        config()->set(
            'monitoring.external.check_url',
            'https://ubsportcenter.co.id/health/ready',
        );
        $summary = app(ExternalAvailabilityConfiguration::class)->summary();

        $this->assertTrue($summary['external_monitoring_configured']);
        $this->assertSame('github-actions', $summary['provider']);
        $this->assertSame('unknown', $summary['status']);

        MonitoringHeartbeat::query()->create([
            'key' => 'external-synthetic-availability',
            'category' => 'availability',
            'status' => MonitoringStatus::Operational->value,
            'observed_at' => now(),
            'last_success_at' => now(),
            'context' => ['provider' => 'github-actions'],
        ]);

        $this->assertSame(
            MonitoringStatus::Operational->value,
            app(ExternalAvailabilityConfiguration::class)->summary()['status'],
        );

        MonitoringHeartbeat::query()
            ->whereKey('external-synthetic-availability')
            ->update(['context' => json_encode([
                'provider' => 'different-provider',
            ], JSON_THROW_ON_ERROR)]);

        $this->assertSame(
            MonitoringStatus::Outage->value,
            app(ExternalAvailabilityConfiguration::class)->summary()['status'],
        );

        MonitoringHeartbeat::query()
            ->whereKey('external-synthetic-availability')
            ->update([
                'observed_at' => now()->subSeconds(901),
                'context' => json_encode([
                    'provider' => 'github-actions',
                ], JSON_THROW_ON_ERROR),
            ]);

        $this->assertSame(
            MonitoringStatus::Outage->value,
            app(ExternalAvailabilityConfiguration::class)->summary()['status'],
        );
    }

    public function test_expired_metric_buckets_are_pruned_without_touching_recent_data(): void
    {
        $metrics = app(PerformanceMetricRepository::class);
        $old = CarbonImmutable::now('UTC')->subHours(200);
        $recent = CarbonImmutable::now('UTC');

        $metrics->recordRequest('public_read', 20, false, $old);
        $metrics->recordRequest('public_read', 20, false, $recent);
        $result = $metrics->prune(100);

        $this->assertSame(1, $result['request_buckets']);
        $this->assertDatabaseCount('performance_request_buckets', 1);
    }
}
