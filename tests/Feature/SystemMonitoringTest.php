<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Jobs\RecordQueueWorkerHeartbeat;
use App\Models\Membership;
use App\Models\MonitoringHeartbeat;
use App\Models\MonitoringSnapshot;
use App\Models\User;
use App\Services\Monitoring\DataIntegrityMonitor;
use App\Services\Monitoring\InvoicePdfOperationalStatus;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Monitoring\MonitoringSnapshotService;
use App\Services\Monitoring\MonitoringTelemetryReader;
use App\Services\Monitoring\ReadinessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Mockery;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class SystemMonitoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        config()->set('data_integrity.cache_store', 'array');
        Cache::flush();
    }

    protected function tearDown(): void
    {
        Cache::flush();

        parent::tearDown();
    }

    public function test_monitoring_cockpit_requires_an_authenticated_authorized_staff_session(): void
    {
        $this->get(route('admin.settings.monitoring.index'))
            ->assertRedirect(route('ubsc-staff.login'));

        $manager = $this->staff('Manager', grantMonitoring: false);

        $this->actingAs($manager)
            ->get(route('admin.settings.monitoring.index'))
            ->assertForbidden();

        $administrator = $this->staff('Administrator', grantMonitoring: true);

        $pageResponse = $this->actingAs($administrator)
            ->get(route('admin.settings.monitoring.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Settings/Monitoring/Index')
                ->where('snapshot.overall.status', MonitoringStatus::Unknown->value)
                ->where('snapshot.integrity.available', false)
                ->where('snapshot.replication.configured', false)
                ->where('snapshot.replication.status', MonitoringStatus::Unknown->value)
                ->where(
                    'snapshot_url',
                    route('admin.settings.monitoring.snapshot'),
                ));
        $this->assertNoStoreHeader($pageResponse->headers->get('Cache-Control'));
    }

    public function test_collector_persists_one_bounded_snapshot_and_projects_integrity_without_mutation(): void
    {
        $user = User::factory()->create();
        $membership = Membership::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'start_date' => '2026-08-20',
            'end_date' => '2026-08-19',
            'status' => 'active',
            'created_via' => 'monitoring-test',
        ]);

        $this->assertSame(0, Artisan::call('monitoring:collect', [
            '--quiet' => true,
        ]));

        $record = MonitoringSnapshot::query()->findOrFail('current');
        $payload = $record->payload;

        $this->assertDatabaseCount('monitoring_snapshots', 1);
        $this->assertSame(1, $payload['schema_version']);
        $this->assertSame(MonitoringStatus::Outage->value, $payload['integrity']['status']);
        $this->assertSame('critical', $payload['integrity']['source_status']);
        $this->assertGreaterThan(0, $payload['integrity']['totals']['violations']);
        $this->assertNotEmpty($payload['integrity']['action_queue']);
        $this->assertSame(MonitoringStatus::Outage->value, $payload['overall']['status']);
        $this->assertArrayHasKey('replication', $payload);
        $this->assertFalse($payload['replication']['configured']);
        $this->assertDatabaseHas('monitoring_incidents', [
            'active_key' => 'data-integrity-scan',
            'source' => 'data-integrity',
            'severity' => 'critical',
            'status' => 'open',
        ]);
        $this->assertSame('2026-08-20', $membership->fresh()->start_date->toDateString());
        $this->assertSame('2026-08-19', $membership->fresh()->end_date->toDateString());

        $serialized = json_encode($payload['integrity'], JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($user->name, $serialized);
        $this->assertStringNotContainsString($user->email, $serialized);
    }

    public function test_snapshot_endpoint_reads_the_projection_without_rescanning_domain_rows(): void
    {
        $this->assertSame(0, Artisan::call('monitoring:collect', [
            '--quiet' => true,
        ]));
        $initialScan = app(DataIntegrityMonitor::class)->latest();

        $user = User::factory()->create();
        Membership::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'start_date' => '2026-08-20',
            'end_date' => '2026-08-19',
            'status' => 'active',
            'created_via' => 'monitoring-test',
        ]);
        $administrator = $this->staff('Administrator', grantMonitoring: true);

        $snapshotResponse = $this->actingAs($administrator)
            ->withHeader('X-UBSC-Background-Poll', '1')
            ->getJson(route('admin.settings.monitoring.snapshot'))
            ->assertOk()
            ->assertJsonPath('integrity.status', MonitoringStatus::Operational->value)
            ->assertJsonPath('integrity.totals.violations', 0);
        $this->assertNoStoreHeader($snapshotResponse->headers->get('Cache-Control'));

        $this->assertSame(
            $initialScan['scan_id'],
            app(DataIntegrityMonitor::class)->latest()['scan_id'],
        );
    }

    public function test_public_readiness_is_coarse_uncached_and_uses_failure_status_codes(): void
    {
        $ready = Mockery::mock(ReadinessService::class);
        $ready->shouldReceive('report')->once()->andReturn([
            'ready' => true,
            'checked_at' => '2026-08-18T10:00:00+07:00',
            'checks' => [[
                'key' => 'database',
                'name' => 'Database',
                'status' => 'operational',
                'latency_ms' => 1,
                'message' => null,
            ]],
        ]);
        $this->instance(ReadinessService::class, $ready);

        $readyResponse = $this->getJson(route('monitoring.readiness'))
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertExactJson([
                'status' => 'ready',
                'checked_at' => '2026-08-18T10:00:00+07:00',
            ]);
        $this->assertNoStoreHeader($readyResponse->headers->get('Cache-Control'));

        $unready = Mockery::mock(ReadinessService::class);
        $unready->shouldReceive('report')->once()->andReturn([
            'ready' => false,
            'checked_at' => '2026-08-18T10:01:00+07:00',
            'checks' => [[
                'key' => 'database',
                'name' => 'Database',
                'status' => 'outage',
                'latency_ms' => 1,
                'message' => 'sensitive internal detail',
            ]],
        ]);
        $this->instance(ReadinessService::class, $unready);

        $this->getJson(route('monitoring.readiness'))
            ->assertStatus(503)
            ->assertHeader('Retry-After', '10')
            ->assertExactJson([
                'status' => 'not_ready',
                'checked_at' => '2026-08-18T10:01:00+07:00',
            ]);
    }

    public function test_malformed_persisted_timestamp_degrades_to_unknown_instead_of_crashing(): void
    {
        MonitoringSnapshot::query()->create([
            'key' => 'current',
            'schema_version' => 1,
            'status' => MonitoringStatus::Operational->value,
            'payload' => [
                'schema_version' => 1,
                'generated_at' => 'not-a-timestamp',
                'cache_ttl_seconds' => 15,
                'overall' => [
                    'status' => MonitoringStatus::Operational->value,
                    'active_incidents' => 0,
                    'highest_severity' => null,
                ],
                'services' => [],
            ],
            'collected_at' => now(),
            'collection_duration_ms' => 1,
        ]);

        $snapshot = app(MonitoringSnapshotService::class)->snapshot();

        $this->assertTrue($snapshot['snapshot_stale']);
        $this->assertSame(MonitoringStatus::Unknown->value, $snapshot['overall']['status']);
        $this->assertSame(MonitoringStatus::Unknown->value, collect($snapshot['services'])
            ->firstWhere('key', 'monitoring-collector')['status']);
        $this->assertIsArray(data_get($snapshot, 'capacity.target_coverage'));
        $this->assertGreaterThanOrEqual(1, data_get($snapshot, 'capacity.target_coverage.required'));
        $this->assertSame(0, data_get($snapshot, 'capacity.target_coverage.verified_observer_cycles'));
        $this->assertGreaterThanOrEqual(
            data_get($snapshot, 'capacity.target_coverage.minimum_observer_spacing_seconds'),
            data_get($snapshot, 'capacity.target_coverage.maximum_observer_spacing_seconds'),
        );
    }

    public function test_monitoring_foundation_refuses_a_destructive_rollback_after_history_exists(): void
    {
        MonitoringHeartbeat::query()->create([
            'key' => 'rollback-guard',
            'category' => 'scheduler',
            'status' => MonitoringStatus::Operational->value,
            'observed_at' => now(),
        ]);
        $migration = require database_path(
            'migrations/2026_08_18_000001_create_monitoring_foundation.php',
        );

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('operational history exists');

        $migration->down();
    }

    public function test_usage_counts_filter_the_window_before_applying_the_bound(): void
    {
        config()->set('monitoring.usage_window_minutes', 60);
        config()->set('monitoring.limits.usage_sample_size', 2);
        $user = User::factory()->create();

        foreach (range(1, 3) as $offset) {
            $membership = $this->membershipForUsage($user);
            $membership->forceFill([
                'created_at' => now()->subHours(2)->subMinutes($offset),
                'updated_at' => now()->subHours(2)->subMinutes($offset),
            ])->saveQuietly();
        }

        $this->membershipForUsage($user);
        $usage = app(MonitoringTelemetryReader::class)->usage();

        $this->assertSame(1, $usage['memberships_created']['value']);
        $this->assertFalse($usage['memberships_created']['is_capped']);

        $this->membershipForUsage($user);
        $this->membershipForUsage($user);
        $usage = app(MonitoringTelemetryReader::class)->usage();

        $this->assertSame(2, $usage['memberships_created']['value']);
        $this->assertTrue($usage['memberships_created']['is_capped']);
    }

    public function test_stale_queue_worker_exposes_an_actionable_diagnostic_message(): void
    {
        config()->set('monitoring.queue.connection', 'database');
        config()->set('monitoring.queue.queue', 'default');
        $connection = (string) config('monitoring.queue.connection', 'database');
        $queue = (string) config('monitoring.queue.queue', 'default');

        MonitoringHeartbeat::query()->create([
            'key' => MonitoringHeartbeatRecorder::queueKey($connection, $queue),
            'category' => 'queue',
            'status' => MonitoringStatus::Operational->value,
            'observed_at' => now()->subSeconds(
                (int) config('monitoring.queue.outage_after_seconds', 600) + 1,
            ),
        ]);

        $telemetry = app(MonitoringTelemetryReader::class)->queue();

        $this->assertSame(MonitoringStatus::Outage->value, $telemetry['status']);
        $this->assertSame(0, $telemetry['depth']);
        $this->assertStringContainsString(
            'heartbeat exceeded the outage threshold',
            (string) $telemetry['message'],
        );
    }

    public function test_invoice_document_pipeline_reports_its_dedicated_worker_and_bounded_backlog(): void
    {
        Storage::fake('invoice-pdf');
        config()->set('invoice_pdf.prewarm.enabled', true);
        config()->set('invoice_pdf.prewarm.connection', 'database');
        config()->set('invoice_pdf.prewarm.queue', 'documents');
        config()->set('invoice_pdf.monitoring.pending_warning', 1);
        config()->set('invoice_pdf.monitoring.pending_outage', 2);
        config()->set('invoice_pdf.monitoring.worker_warning_seconds', 60);
        config()->set('invoice_pdf.monitoring.worker_outage_seconds', 120);
        config()->set('invoice_pdf.monitoring.storage_warning_free_percent', 1);
        config()->set('invoice_pdf.monitoring.storage_outage_free_percent', 1);
        app(MonitoringHeartbeatRecorder::class)->record(
            key: MonitoringHeartbeatRecorder::queueKey('database', 'documents'),
            category: 'queue',
            status: MonitoringStatus::Operational,
        );

        $healthy = app(InvoicePdfOperationalStatus::class)->summary();

        $this->assertSame(MonitoringStatus::Operational->value, $healthy['status']);
        $this->assertSame(0, $healthy['pending']);
        $this->assertSame('documents', $healthy['queue']);
        $this->assertIsFloat($healthy['storage_free_percent']);

        foreach (range(1, 2) as $offset) {
            DB::table('jobs')->insert([
                'queue' => 'documents',
                'payload' => '{}',
                'attempts' => 0,
                'reserved_at' => null,
                'available_at' => now()->subMinutes(5)->timestamp,
                'created_at' => now()->subMinutes(5)->subSeconds($offset)->timestamp,
            ]);
        }

        $backlogged = app(InvoicePdfOperationalStatus::class)->summary();

        $this->assertSame(MonitoringStatus::Outage->value, $backlogged['status']);
        $this->assertSame(2, $backlogged['pending']);
        $this->assertGreaterThanOrEqual(300, $backlogged['oldest_age_seconds']);
    }

    public function test_queue_probe_can_target_the_dedicated_document_queue(): void
    {
        Queue::fake();

        $this->assertSame(0, Artisan::call('monitoring:queue-probe', [
            '--connection' => 'database',
            '--queue' => 'documents',
            '--quiet' => true,
        ]));

        Queue::assertPushed(
            RecordQueueWorkerHeartbeat::class,
            fn (RecordQueueWorkerHeartbeat $job): bool => $job->probeConnection === 'database'
                && $job->probeQueue === 'documents',
        );
    }

    public function test_queue_telemetry_supports_a_named_database_connection_and_isolates_failures(): void
    {
        config()->set(
            'queue.connections.invoice-database',
            config('queue.connections.database'),
        );
        app(MonitoringHeartbeatRecorder::class)->record(
            key: MonitoringHeartbeatRecorder::queueKey('invoice-database', 'documents'),
            category: 'queue',
            status: MonitoringStatus::Operational,
        );
        DB::table('jobs')->insert([
            'queue' => 'documents',
            'payload' => '{}',
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => now()->timestamp,
            'created_at' => now()->timestamp,
        ]);
        DB::table('failed_jobs')->insert([
            [
                'uuid' => 'monitoring-invoice-failure',
                'connection' => 'invoice-database',
                'queue' => 'documents',
                'payload' => '{}',
                'exception' => 'sanitized-test-failure',
                'failed_at' => now(),
            ],
            [
                'uuid' => 'monitoring-unrelated-failure',
                'connection' => 'database',
                'queue' => 'documents',
                'payload' => '{}',
                'exception' => 'sanitized-test-failure',
                'failed_at' => now(),
            ],
        ]);

        $state = app(MonitoringTelemetryReader::class)->queueFor(
            'invoice-database',
            'documents',
        );

        $this->assertSame('configured', $state['adapter_status']);
        $this->assertSame(1, $state['depth']);
        $this->assertSame(1, $state['failed_recent']);
    }

    private function staff(string $roleName, bool $grantMonitoring): User
    {
        $permission = Permission::firstOrCreate([
            'name' => 'view-system-operations',
            'guard_name' => 'web',
        ]);
        $role = Role::firstOrCreate([
            'name' => $roleName,
            'guard_name' => 'web',
        ]);
        $role->syncPermissions($grantMonitoring ? [$permission] : []);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }

    private function membershipForUsage(User $user): Membership
    {
        return Membership::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'status' => 'active',
            'created_via' => 'monitoring-test',
        ]);
    }

    private function assertNoStoreHeader(?string $header): void
    {
        $this->assertIsString($header);
        $this->assertStringContainsString('no-store', $header);
        $this->assertStringContainsString('max-age=0', $header);
    }
}
