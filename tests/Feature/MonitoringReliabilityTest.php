<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringAlertDelivery;
use App\Models\MonitoringHeartbeat;
use App\Models\MonitoringIncident;
use App\Models\MonitoringRollup;
use App\Services\Monitoring\MonitoringAlertDispatcher;
use App\Services\Monitoring\MonitoringAlertOutbox;
use App\Services\Monitoring\MonitoringAlertStatus;
use App\Services\Monitoring\MonitoringBackupMonitor;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Services\Monitoring\MonitoringHistoryReader;
use App\Services\Monitoring\MonitoringIncidentManager;
use App\Services\Monitoring\MonitoringRollupRecorder;
use App\Services\Monitoring\MonitoringSloService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class MonitoringReliabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-08-18 10:15:00');
        config()->set('monitoring.alerting.channels', ['log']);
        config()->set('monitoring.slos.minimum_samples', 10);
        config()->set('monitoring.slos.definitions', [[
            'key' => 'internal_health',
            'name' => 'Internal health',
            'indicator' => 'Strict operational samples.',
            'source' => 'internal_rollups',
            'target_percent' => 99.9,
        ]]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_rollups_are_idempotent_per_minute_and_bounded_per_hour(): void
    {
        $recorder = app(MonitoringRollupRecorder::class);
        $snapshot = $this->snapshot(MonitoringStatus::Operational);

        $recorder->record($snapshot);
        $recorder->record($snapshot);

        $rollup = MonitoringRollup::query()->where('metric_key', 'overall')->firstOrFail();
        $this->assertSame(1, $rollup->sample_count);
        $this->assertSame(1, $rollup->operational_count);

        Carbon::setTestNow(now()->addMinute());
        $recorder->record($snapshot);
        $rollup->refresh();

        $this->assertSame(2, $rollup->sample_count);
        $this->assertSame(2, $rollup->operational_count);

        Carbon::setTestNow(now()->addHour());
        $recorder->record($snapshot);

        $this->assertDatabaseCount('monitoring_rollups', 8);
        $this->assertSame(2, MonitoringRollup::query()->where('metric_key', 'overall')->count());
    }

    public function test_externally_deduplicated_samples_remain_complete_when_they_arrive_out_of_order(): void
    {
        $recorder = app(MonitoringRollupRecorder::class);
        $newer = now()->startOfMinute();
        $older = $newer->copy()->subMinutes(5);

        $recorder->recordExternalAvailability(MonitoringStatus::Operational, $newer, 90);
        $recorder->recordExternalAvailability(MonitoringStatus::Outage, $older, 180);

        $rollup = MonitoringRollup::query()
            ->where('metric_key', 'sli.public_availability')
            ->sole();
        $this->assertSame(2, $rollup->sample_count);
        $this->assertSame(1, $rollup->operational_count);
        $this->assertSame(1, $rollup->outage_count);
        $this->assertSame(1, $rollup->sli_good_count);
        $this->assertSame(2, $rollup->sli_total_count);
        $this->assertTrue($rollup->first_sampled_at->equalTo($older));
        $this->assertTrue($rollup->last_sampled_at->equalTo($newer));
    }

    public function test_history_and_error_budget_use_real_strict_health_samples(): void
    {
        $recorder = app(MonitoringRollupRecorder::class);
        foreach (range(0, 9) as $minute) {
            $recorder->record($this->snapshot(
                $minute < 5 ? MonitoringStatus::Operational : MonitoringStatus::Degraded,
            ));

            if ($minute < 9) {
                Carbon::setTestNow(now()->addMinute());
            }
        }

        $history = app(MonitoringHistoryReader::class)->overview();
        $objective = app(MonitoringSloService::class)->summary()['items'][0];

        $this->assertTrue($history['available']);
        $this->assertSame(10, $history['sample_count']);
        $this->assertSame(50.0, $objective['compliance_percent']);
        $this->assertSame(0.0, $objective['error_budget_remaining_percent']);
        $this->assertSame(5, $objective['bad_samples']);
        $this->assertSame('evaluated', $objective['evaluation_status']);
        $this->assertSame(MonitoringStatus::Degraded->value, $objective['status']);
        $this->assertGreaterThan(1, $objective['burn_rates']['1h']);
    }

    public function test_missing_collector_minutes_consume_the_error_budget(): void
    {
        $recorder = app(MonitoringRollupRecorder::class);
        $recorder->record($this->snapshot(MonitoringStatus::Operational));
        Carbon::setTestNow(now()->addMinutes(10));
        $recorder->record($this->snapshot(MonitoringStatus::Operational));

        $objective = app(MonitoringSloService::class)->summary()['items'][0];

        $this->assertSame(11, $objective['sample_count']);
        $this->assertSame(2, $objective['recorded_samples']);
        $this->assertSame(9, $objective['missing_samples']);
        $this->assertSame(9, $objective['recent_missing_samples']);
        $this->assertSame(9, $objective['bad_samples']);
        $this->assertSame('evaluated', $objective['evaluation_status']);
        $this->assertSame(MonitoringStatus::Degraded->value, $objective['status']);

        Carbon::setTestNow(now()->addHour()->startOfHour());
        $recorder->record($this->snapshot(MonitoringStatus::Operational));
        $recovered = app(MonitoringSloService::class)->summary()['items'][0];
        $this->assertGreaterThan(9, $recovered['missing_samples']);
        $this->assertSame(0, $recovered['recent_missing_samples']);
    }

    public function test_request_sli_rollups_preserve_exact_good_total_counts_and_minute_idempotency(): void
    {
        config()->set('monitoring.slos.definitions', [
            [
                'key' => 'booking_success',
                'name' => 'Booking success',
                'indicator' => 'Successful booking requests.',
                'source' => 'request_sli_rollups',
                'metric_key' => 'sli.booking_success',
                'target_percent' => 99.9,
            ],
            [
                'key' => 'request_latency',
                'name' => 'Request latency',
                'indicator' => 'Requests inside latency target.',
                'source' => 'request_sli_rollups',
                'metric_key' => 'sli.request_latency',
                'target_percent' => 99.0,
            ],
        ]);
        $snapshot = $this->snapshot(MonitoringStatus::Operational) + [
            'performance' => [
                'status' => MonitoringStatus::Operational->value,
                'http' => ['status' => MonitoringStatus::Operational->value],
                'queues' => ['status' => MonitoringStatus::Operational->value],
                'database' => ['status' => MonitoringStatus::Operational->value],
                'sli' => [
                    'booking_success' => [
                        'status' => MonitoringStatus::Degraded->value,
                        'good_count' => 9,
                        'total_count' => 10,
                    ],
                    'request_latency' => [
                        'status' => MonitoringStatus::Operational->value,
                        'good_count' => 10,
                        'total_count' => 10,
                    ],
                ],
            ],
        ];

        $recorder = app(MonitoringRollupRecorder::class);
        $recorder->record($snapshot);
        $recorder->record($snapshot);

        $booking = MonitoringRollup::query()
            ->where('metric_key', 'sli.booking_success')
            ->sole();
        $this->assertSame(9, $booking->sli_good_count);
        $this->assertSame(10, $booking->sli_total_count);
        $this->assertSame(1, $booking->sample_count);

        $objectives = collect(app(MonitoringSloService::class)->summary()['items'])
            ->keyBy('key');
        $this->assertSame(90.0, $objectives['booking_success']['compliance_percent']);
        $this->assertSame(MonitoringStatus::Degraded->value, $objectives['booking_success']['status']);
        $this->assertSame(100.0, $objectives['request_latency']['compliance_percent']);
        $this->assertSame(MonitoringStatus::Operational->value, $objectives['request_latency']['status']);
    }

    public function test_a_restart_after_an_entire_empty_burn_window_keeps_the_gap_visible(): void
    {
        $recorder = app(MonitoringRollupRecorder::class);
        $recorder->record($this->snapshot(MonitoringStatus::Operational));
        Carbon::setTestNow(now()->addHours(2));
        $recorder->record($this->snapshot(MonitoringStatus::Operational));

        $objective = app(MonitoringSloService::class)->summary()['items'][0];

        $this->assertSame(121, $objective['sample_count']);
        $this->assertSame(2, $objective['recorded_samples']);
        $this->assertSame(119, $objective['missing_samples']);
        $this->assertGreaterThan(1, $objective['burn_rates']['1h']);

        $history = app(MonitoringHistoryReader::class)->overview();
        $this->assertSame(121, $history['expected_sample_count']);
        $this->assertSame(119, $history['missing_sample_count']);
    }

    public function test_incident_alert_events_are_deduplicated_escalated_and_resolved(): void
    {
        $manager = app(MonitoringIncidentManager::class);
        $incident = $manager->openOrRefresh(
            key: 'test-database-lag',
            source: 'test',
            title: 'Database lag detected',
            severity: 'warning',
        );

        $manager->openOrRefresh(
            key: 'test-database-lag',
            source: 'test',
            title: 'Database lag detected',
            severity: 'warning',
        );

        $this->assertDatabaseCount('monitoring_alert_deliveries', 1);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'event' => 'opened',
            'channel' => 'log',
            'status' => 'pending',
        ]);

        $manager->openOrRefresh(
            key: 'test-database-lag',
            source: 'test',
            title: 'Database lag critical',
            severity: 'critical',
        );
        $this->assertDatabaseCount('monitoring_alert_deliveries', 2);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'event' => 'escalated',
            'severity' => 'critical',
        ]);

        $this->assertTrue($manager->resolve('test-database-lag'));
        $this->assertFalse($manager->resolve('test-database-lag'));
        $this->assertDatabaseCount('monitoring_alert_deliveries', 3);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'monitoring_incident_id' => $incident->id,
            'event' => 'resolved',
        ]);
    }

    public function test_incident_transitions_and_their_outbox_records_commit_atomically(): void
    {
        $failingOpenOutbox = Mockery::mock(MonitoringAlertOutbox::class);
        $failingOpenOutbox->shouldReceive('enqueue')
            ->once()
            ->andThrow(new RuntimeException('outbox unavailable'));

        try {
            (new MonitoringIncidentManager($failingOpenOutbox))->openOrRefresh(
                key: 'atomic-open-test',
                source: 'test',
                title: 'Atomic open test',
            );
            $this->fail('The incident write should fail with its outbox write.');
        } catch (RuntimeException $exception) {
            $this->assertSame('outbox unavailable', $exception->getMessage());
        }
        $this->assertDatabaseMissing('monitoring_incidents', [
            'active_key' => 'atomic-open-test',
        ]);

        $incident = app(MonitoringIncidentManager::class)->openOrRefresh(
            key: 'atomic-resolve-test',
            source: 'test',
            title: 'Atomic resolve test',
        );
        $failingResolveOutbox = Mockery::mock(MonitoringAlertOutbox::class);
        $failingResolveOutbox->shouldReceive('enqueue')
            ->once()
            ->andThrow(new RuntimeException('outbox unavailable'));

        try {
            (new MonitoringIncidentManager($failingResolveOutbox))->resolve(
                'atomic-resolve-test',
            );
            $this->fail('The resolution should fail with its outbox write.');
        } catch (RuntimeException $exception) {
            $this->assertSame('outbox unavailable', $exception->getMessage());
        }
        $this->assertDatabaseHas('monitoring_incidents', [
            'id' => $incident->id,
            'active_key' => 'atomic-resolve-test',
            'status' => 'open',
            'resolved_at' => null,
        ]);
    }

    public function test_webhook_delivery_is_signed_retried_and_idempotent(): void
    {
        config()->set('monitoring.alerting.channels', ['webhook']);
        config()->set('monitoring.alerting.webhook.url', 'https://alerts.example.test/incidents');
        config()->set('monitoring.alerting.webhook.secret', 'monitoring-webhook-signing-key-2026-v1');
        config()->set('monitoring.alerting.max_attempts', 3);
        config()->set('monitoring.alerting.retry_base_seconds', 5);
        Http::fakeSequence()->pushStatus(503)->pushStatus(204);

        app(MonitoringIncidentManager::class)->openOrRefresh(
            key: 'test-webhook-delivery',
            source: 'test',
            title: 'Synthetic incident',
            severity: 'critical',
        );

        $first = app(MonitoringAlertDispatcher::class)->dispatch(10);
        $this->assertSame(1, $first['retried']);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'status' => 'pending',
            'attempts' => 1,
            'last_error_code' => 'RuntimeException:webhook_http_503',
        ]);

        Carbon::setTestNow(now()->addSeconds(6));
        $second = app(MonitoringAlertDispatcher::class)->dispatch(10);
        $this->assertSame(1, $second['delivered']);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'status' => 'delivered',
            'attempts' => 2,
            'last_error_code' => null,
        ]);

        Http::assertSentCount(2);
        Http::assertSent(function (Request $request): bool {
            $signature = $request->header('X-UBSC-Alert-Signature')[0] ?? '';
            $deliveryId = $request->header('X-UBSC-Alert-Id')[0] ?? '';
            $timestamp = $request->header('X-UBSC-Alert-Timestamp')[0] ?? '';
            $canonical = "v1\n{$timestamp}\n{$deliveryId}\n".hash('sha256', $request->body());
            $expected = 'sha256='.hash_hmac(
                'sha256',
                $canonical,
                'monitoring-webhook-signing-key-2026-v1',
            );

            return $request->url() === 'https://alerts.example.test/incidents'
                && preg_match('/^[0-9]{10}$/', $timestamp) === 1
                && hash_equals($expected, $signature)
                && strlen($signature) === 71
                && $deliveryId !== '';
        });

        $third = app(MonitoringAlertDispatcher::class)->dispatch(10);
        $this->assertSame(0, $third['claimed']);
        Http::assertSentCount(2);
    }

    public function test_alert_dispatcher_monitors_its_own_heartbeat_and_backlog(): void
    {
        config()->set('monitoring.alerting.channels', ['log', 'webhook']);
        config()->set('monitoring.alerting.webhook.url', 'https://alerts.example.test/incidents');
        config()->set('monitoring.alerting.webhook.secret', 'monitoring-webhook-signing-key-2026-v1');
        config()->set('observability.alerting.pending_warning', 2);
        config()->set('observability.alerting.pending_outage', 4);
        config()->set('observability.alerting.dispatcher_warning_after_seconds', 180);
        config()->set('observability.alerting.dispatcher_outage_after_seconds', 600);
        Http::fake(['https://alerts.example.test/*' => Http::response(null, 204)]);
        $this->assertSame(0, Artisan::call('monitoring:alerts:canary', [
            '--operation-id' => 'observability-delivery-proof',
            '--quiet' => true,
        ]));
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'event' => 'canary',
            'channel' => 'log',
            'status' => 'delivered',
        ]);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'event' => 'canary',
            'channel' => 'webhook',
            'status' => 'delivered',
        ]);
        MonitoringAlertDelivery::query()
            ->where('event', 'canary')
            ->each(function (MonitoringAlertDelivery $delivery): void {
                $this->assertSame(
                    'observability-delivery-proof',
                    $delivery->payload['operation_id'] ?? null,
                );
            });

        $status = app(MonitoringAlertStatus::class);
        $this->assertSame('operational', $status->summary()['status']);

        $this->delivery('pending', now());
        $this->delivery('pending', now()->addSecond());
        $this->assertSame('degraded', $status->summary()['status']);

        MonitoringHeartbeat::query()
            ->whereKey('monitoring-alert-dispatcher')
            ->update(['observed_at' => now()->subMinutes(11)]);
        $this->assertSame('outage', $status->summary()['status']);
    }

    public function test_canary_allows_bounded_retry_but_rejects_stale_operation_replay(): void
    {
        config()->set('monitoring.alerting.channels', ['log', 'webhook']);
        config()->set('monitoring.alerting.webhook.url', 'https://alerts.example.test/incidents');
        config()->set('monitoring.alerting.webhook.secret', 'monitoring-webhook-signing-key-2026-v1');
        config()->set('observability.alerting.canary_reuse_seconds', 600);
        Http::fake(['https://alerts.example.test/*' => Http::response(null, 204)]);
        $startedAt = now();

        $arguments = [
            '--operation-id' => 'bounded-canary-retry',
            '--quiet' => true,
        ];
        $this->assertSame(0, Artisan::call('monitoring:alerts:canary', $arguments));
        Http::assertSentCount(1);

        Carbon::setTestNow($startedAt->copy()->addSeconds(30));
        $this->assertSame(0, Artisan::call('monitoring:alerts:canary', $arguments));
        Http::assertSentCount(1);

        Carbon::setTestNow($startedAt->copy()->addSeconds(601));
        $this->assertSame(1, Artisan::call('monitoring:alerts:canary', $arguments));
        Http::assertSentCount(1);
        $this->assertDatabaseHas('monitoring_heartbeats', [
            'key' => 'monitoring-alert-off-host-canary',
            'status' => MonitoringStatus::Outage->value,
        ]);
        $heartbeat = MonitoringHeartbeat::query()
            ->findOrFail('monitoring-alert-off-host-canary');
        $this->assertSame(
            'stale_or_inconsistent_operation',
            $heartbeat->context['reason'] ?? null,
        );
    }

    public function test_heartbeat_ordering_never_allows_stale_or_equal_success_to_hide_failure(): void
    {
        $recorder = app(MonitoringHeartbeatRecorder::class);
        $recorder->record(
            key: 'ordered-provider-signal',
            category: 'recovery',
            status: MonitoringStatus::Outage,
            observedAt: now(),
        );
        $recorder->record(
            key: 'ordered-provider-signal',
            category: 'recovery',
            status: MonitoringStatus::Operational,
            observedAt: now()->subMinute(),
        );
        $recorder->record(
            key: 'ordered-provider-signal',
            category: 'recovery',
            status: MonitoringStatus::Operational,
            observedAt: now(),
        );

        $heartbeat = MonitoringHeartbeat::query()->findOrFail('ordered-provider-signal');
        $this->assertSame(MonitoringStatus::Outage->value, $heartbeat->status);
        $this->assertTrue($heartbeat->observed_at->equalTo(now()));

        Carbon::setTestNow(now()->addSecond());
        $recorder->record(
            key: 'ordered-provider-signal',
            category: 'recovery',
            status: MonitoringStatus::Operational,
            observedAt: now(),
        );

        $this->assertSame(
            MonitoringStatus::Operational->value,
            $heartbeat->refresh()->status,
        );
    }

    public function test_external_sli_ingestion_is_signed_idempotent_and_feeds_real_availability_slo(): void
    {
        config()->set('monitoring.external.enabled', true);
        config()->set('app.url', 'https://ubsportcenter.co.id');
        config()->set('monitoring.external.provider', 'github-actions');
        config()->set('monitoring.external.check_url', 'https://ubsportcenter.co.id/health/ready');
        config()->set('monitoring.external.interval_seconds', 300);
        config()->set('observability.external_sli.ingest_enabled', true);
        config()->set('observability.external_sli.provider', 'github-actions');
        config()->set('observability.external_sli.metric_key', 'sli.public_availability');
        config()->set('observability.external_sli.clock_skew_seconds', 300);
        config()->set('observability.external_sli.signing_keys', [
            'v1' => 'external-synthetic-signing-key-2026-v1',
        ]);
        config()->set('monitoring.slos.definitions', [[
            'key' => 'public_availability',
            'name' => 'Public availability',
            'indicator' => 'Authenticated external checks.',
            'source' => 'external_synthetic',
            'metric_key' => 'sli.public_availability',
            'target_percent' => 99.9,
        ]]);

        foreach (range(1, 10) as $sequence) {
            $healthy = $sequence !== 5;
            $response = $this->postExternalSli("probe-{$sequence}", $healthy);
            $response->assertAccepted()->assertJson([
                'accepted' => true,
                'duplicate' => false,
                'status' => $healthy ? 'operational' : 'outage',
            ]);

            if ($sequence < 10) {
                Carbon::setTestNow(now()->addMinutes(5));
            }
        }

        $duplicate = $this->postExternalSli('probe-10', true);
        $duplicate->assertOk()->assertJson(['duplicate' => true]);
        $this->assertDatabaseCount('monitoring_external_sli_receipts', 10);

        $objective = app(MonitoringSloService::class)->summary()['items'][0];
        $this->assertSame('external_synthetic', $objective['source']);
        $this->assertSame(10, $objective['expected_samples']);
        $this->assertSame(10, $objective['recorded_samples']);
        $this->assertSame(0, $objective['missing_samples']);
        $this->assertSame(90.0, $objective['compliance_percent']);
        $this->assertSame(MonitoringStatus::Degraded->value, $objective['status']);

        Carbon::setTestNow(now()->addMinutes(10));
        $withMissingIntervals = app(MonitoringSloService::class)->summary()['items'][0];
        $this->assertSame(12, $withMissingIntervals['expected_samples']);
        $this->assertSame(2, $withMissingIntervals['missing_samples']);
        $this->assertSame(75.0, $withMissingIntervals['compliance_percent']);

        $conflict = $this->postExternalSli('probe-10', false);
        $conflict->assertUnauthorized()->assertExactJson([
            'message' => 'Invalid synthetic evidence.',
        ]);
        $invalidSignature = $this->postExternalSli(
            'probe-invalid-signature',
            true,
            'different-external-signing-key-2026-v1',
        );
        $invalidSignature->assertUnauthorized();
        $stale = $this->postExternalSli(
            'probe-stale',
            true,
            null,
            now('UTC')->subMinutes(10)->timestamp,
        );
        $stale->assertUnauthorized();

        $missingRequiredPath = $this->postExternalSli(
            'probe-missing-required-path',
            true,
            null,
            null,
            ['/health/ready'],
        );
        $missingRequiredPath->assertUnauthorized();
        $wrongOrigin = $this->postExternalSli(
            'probe-wrong-origin',
            true,
            null,
            null,
            null,
            'https://status.example.test',
        );
        $wrongOrigin->assertUnauthorized();
        $wrongContentType = $this->postExternalSli(
            'probe-wrong-content-type',
            true,
            null,
            null,
            null,
            'https://ubsportcenter.co.id',
            'text/plain',
        );
        $wrongContentType->assertStatus(415);
    }

    public function test_external_sli_rejects_malformed_signed_payloads_without_a_server_error(): void
    {
        config()->set('app.url', 'https://ubsportcenter.co.id');
        config()->set('monitoring.external.check_url', 'https://ubsportcenter.co.id/health/ready');
        config()->set('monitoring.external.required_paths', ['/up', '/health/ready', '/']);
        config()->set('observability.external_sli.ingest_enabled', true);
        config()->set('observability.external_sli.provider', 'github-actions');
        config()->set('observability.external_sli.signing_keys', [
            'v1' => 'external-synthetic-signing-key-2026-v1',
        ]);

        $timestamps = [
            'checked_at' => now('UTC')->subSecond()->toIso8601String(),
            'completed_at' => now('UTC')->toIso8601String(),
        ];
        $missingOptionalFields = json_encode([
            'schema_version' => 1,
            'status' => 'operational',
            ...$timestamps,
            'base_origin' => 'https://ubsportcenter.co.id',
            'checks' => array_map(static fn (string $path): array => [
                'path' => $path,
                'healthy' => true,
                'latency_ms' => 125,
                'attempts' => 1,
            ], ['/up', '/health/ready', '/']),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $invalidOriginType = json_encode([
            'schema_version' => 1,
            'status' => 'operational',
            ...$timestamps,
            'base_origin' => ['https://ubsportcenter.co.id'],
            'checks' => [[
                'path' => '/up',
                'healthy' => true,
                'status_code' => 200,
                'latency_ms' => 125,
                'attempts' => 1,
                'failure' => null,
            ]],
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        $this->postSignedExternalSliBody(
            'probe-missing-check-fields',
            $missingOptionalFields,
        )->assertUnauthorized()->assertExactJson([
            'message' => 'Invalid synthetic evidence.',
        ]);
        $this->postSignedExternalSliBody(
            'probe-invalid-origin-type',
            $invalidOriginType,
        )->assertUnauthorized()->assertExactJson([
            'message' => 'Invalid synthetic evidence.',
        ]);
        $this->assertDatabaseCount('monitoring_external_sli_receipts', 0);
    }

    public function test_failed_off_host_canary_cannot_be_hidden_by_a_healthy_dispatch_cycle(): void
    {
        config()->set('monitoring.alerting.channels', ['log', 'webhook']);
        config()->set('monitoring.alerting.webhook.url', 'https://alerts.example.test/incidents');
        config()->set('monitoring.alerting.webhook.secret', 'monitoring-webhook-signing-key-2026-v1');
        config()->set('monitoring.alerting.retry_base_seconds', 5);
        Http::fakeSequence()->pushStatus(503)->pushStatus(204)->pushStatus(204);

        $this->assertSame(1, Artisan::call('monitoring:alerts:canary', [
            '--operation-id' => 'failed-canary',
            '--quiet' => true,
        ]));
        $this->assertDatabaseHas('monitoring_heartbeats', [
            'key' => 'monitoring-alert-off-host-canary',
            'status' => MonitoringStatus::Outage->value,
        ]);

        Carbon::setTestNow(now()->addSeconds(6));
        $this->assertSame(0, Artisan::call('monitoring:alerts:deliver', ['--quiet' => true]));
        $this->assertSame('outage', app(MonitoringAlertStatus::class)->summary()['status']);

        $this->assertSame(0, Artisan::call('monitoring:alerts:canary', [
            '--operation-id' => 'recovered-canary',
            '--quiet' => true,
        ]));
        $this->assertSame('operational', app(MonitoringAlertStatus::class)->summary()['status']);
    }

    public function test_fast_recent_burn_opens_an_incident_before_long_window_compliance_fails(): void
    {
        config()->set('observability.enforce', true);
        config()->set('monitoring.slos.definitions', [[
            'key' => 'booking_success',
            'name' => 'Booking success',
            'indicator' => 'Successful booking requests.',
            'source' => 'request_sli_rollups',
            'metric_key' => 'sli.booking_success',
            'target_percent' => 99.9,
        ]]);
        MonitoringHeartbeat::query()->create([
            'key' => MonitoringRollupRecorder::BASELINE_HEARTBEAT_KEY,
            'category' => 'monitoring',
            'status' => MonitoringStatus::Operational->value,
            'observed_at' => now()->subHours(7),
            'last_success_at' => now()->subHours(7),
        ]);

        foreach (range(7, 0) as $hoursAgo) {
            $isOldBaseline = $hoursAgo === 7;
            $isCurrent = $hoursAgo === 0;
            $samples = $isOldBaseline ? 45 : ($isCurrent ? 16 : 60);
            $good = $isOldBaseline ? 100_000 : ($isCurrent ? 0 : 1_000);
            $total = $isCurrent ? 100 : $good;
            $bucket = now()->subHours($hoursAgo)->startOfHour();

            MonitoringRollup::query()->create([
                'metric_key' => 'sli.booking_success',
                'bucket_started_at' => $bucket,
                'first_sampled_at' => $isOldBaseline ? now()->subHours(7) : $bucket,
                'last_sampled_at' => $isCurrent ? now() : $bucket->copy()->endOfHour(),
                'sample_count' => $samples,
                'operational_count' => $samples,
                'degraded_count' => 0,
                'outage_count' => 0,
                'unknown_count' => 0,
                'sli_good_count' => $good,
                'sli_total_count' => $total,
                'latency_sample_count' => 0,
                'latency_sum_ms' => 0,
                'value_sample_count' => 0,
                'value_sum' => 0,
            ]);
        }

        $objective = app(MonitoringSloService::class)->summary()['items'][0];
        $this->assertSame(MonitoringStatus::Operational->value, $objective['status']);
        $this->assertGreaterThanOrEqual(14.4, $objective['burn_rates']['1h']);
        $this->assertGreaterThanOrEqual(6.0, $objective['burn_rates']['6h']);

        Artisan::call('monitoring:collect', ['--quiet' => true]);

        $incident = MonitoringIncident::query()
            ->where('active_key', 'slo-burn-booking_success')
            ->sole();
        $this->assertSame('critical', $incident->severity);
    }

    public function test_crashed_delivery_with_exhausted_lease_becomes_dead_instead_of_stuck(): void
    {
        config()->set('monitoring.alerting.max_attempts', 2);
        config()->set('monitoring.alerting.processing_stale_seconds', 30);
        $incident = MonitoringIncident::query()->create([
            'deduplication_key' => 'lease-test',
            'active_key' => 'lease-test',
            'source' => 'test',
            'title' => 'Lease test',
            'severity' => 'warning',
            'status' => 'open',
            'started_at' => now(),
            'last_observed_at' => now(),
        ]);
        MonitoringAlertDelivery::query()->create([
            'monitoring_incident_id' => $incident->id,
            'deduplication_key' => hash('sha256', 'lease-test'),
            'event' => 'opened',
            'channel' => 'log',
            'severity' => 'warning',
            'status' => 'processing',
            'payload' => ['schema_version' => 1],
            'attempts' => 2,
            'available_at' => now()->subMinute(),
            'claimed_at' => now()->subMinutes(2),
            'last_attempt_at' => now()->subMinutes(2),
        ]);

        $result = app(MonitoringAlertDispatcher::class)->dispatch(10);

        $this->assertSame(1, $result['dead']);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'status' => 'dead',
            'last_error_code' => 'delivery_lease_exhausted',
        ]);
    }

    public function test_stale_alert_worker_cannot_acknowledge_a_reclaimed_lease(): void
    {
        $delivery = MonitoringAlertDelivery::query()->create([
            'deduplication_key' => hash('sha256', 'lease-fencing-test'),
            'event' => 'opened',
            'channel' => 'log',
            'severity' => 'warning',
            'status' => 'processing',
            'payload' => ['schema_version' => 1],
            'attempts' => 2,
            'available_at' => now(),
            'claimed_at' => now(),
            'claim_token' => '11111111-1111-4111-8111-111111111111',
            'last_attempt_at' => now(),
        ]);
        $staleWorkerCopy = clone $delivery;
        $staleWorkerCopy->forceFill([
            'claim_token' => '22222222-2222-4222-8222-222222222222',
        ]);

        $method = new \ReflectionMethod(MonitoringAlertDispatcher::class, 'markDelivered');
        $acknowledged = $method->invoke(
            app(MonitoringAlertDispatcher::class),
            $staleWorkerCopy,
        );

        $this->assertFalse($acknowledged);
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'id' => $delivery->id,
            'status' => 'processing',
            'claim_token' => '11111111-1111-4111-8111-111111111111',
        ]);
    }

    public function test_dead_alert_delivery_can_be_safely_requeued_after_repair(): void
    {
        config()->set('monitoring.alerting.channels', ['log']);
        $delivery = $this->delivery('dead', now()->subMinute());

        $this->assertSame(0, Artisan::call('monitoring:alerts:retry-dead', [
            '--delivery-id' => $delivery->public_id,
            '--quiet' => true,
        ]));
        $this->assertDatabaseHas('monitoring_alert_deliveries', [
            'id' => $delivery->id,
            'status' => 'pending',
            'attempts' => 0,
            'last_error_code' => null,
        ]);
    }

    public function test_retention_prunes_only_expired_aggregates_and_terminal_deliveries(): void
    {
        config()->set('monitoring.history.retention_days', 7);
        config()->set('monitoring.alerting.delivered_retention_days', 7);
        config()->set('monitoring.alerting.dead_retention_days', 30);
        $this->rollupAt(now()->subDays(8));
        $current = $this->rollupAt(now());
        $oldDelivered = $this->delivery('delivered', now()->subDays(8));
        $pending = $this->delivery('pending', now()->subDays(60));

        $this->assertSame(0, Artisan::call('monitoring:prune', ['--quiet' => true]));

        $this->assertDatabaseCount('monitoring_rollups', 1);
        $this->assertDatabaseHas('monitoring_rollups', ['id' => $current->id]);
        $this->assertDatabaseMissing('monitoring_alert_deliveries', ['id' => $oldDelivered->id]);
        $this->assertDatabaseHas('monitoring_alert_deliveries', ['id' => $pending->id, 'status' => 'pending']);
    }

    public function test_verified_backup_heartbeat_transitions_by_freshness(): void
    {
        config()->set('monitoring.backup.enabled', true);
        config()->set('monitoring.backup.warning_after_seconds', 30 * 3600);
        config()->set('monitoring.backup.outage_after_seconds', 48 * 3600);
        config()->set('disaster_recovery.backup.enabled', true);
        config()->set('disaster_recovery.backup.cross_region', true);
        config()->set('disaster_recovery.backup.minimum_retention_days', 35);
        config()->set('disaster_recovery.backup.allowed_object_lock_modes', ['compliance']);
        config()->set('disaster_recovery.evidence.active_key_id', 'v1');
        config()->set('disaster_recovery.evidence.signing_keys', [
            'v1' => 'monitoring-backup-evidence-test-key-2026',
        ]);

        $this->assertSame(0, Artisan::call('monitoring:backup-verified', [
            '--operation-id' => 'backup-operation-20260818-001',
            '--backup-id' => 'backup-20260818-001',
            '--provider' => 'managed-db',
            '--source-snapshot-at' => '2026-08-18T10:10:00+07:00',
            '--recovery-point-at' => '2026-08-18T10:14:00+07:00',
            '--completed-at' => '2026-08-18T10:15:00+07:00',
            '--immutable-until' => '2026-09-23T10:15:00+07:00',
            '--object-lock-mode' => 'compliance',
            '--size-bytes' => 12_345_678,
            '--checksum-sha256' => str_repeat('a', 64),
            '--archive-readable' => true,
            '--checksum-verified' => true,
            '--encrypted' => true,
            '--offsite' => true,
            '--cross-account' => true,
            '--cross-region' => true,
            '--quiet' => true,
        ]));

        $monitor = app(MonitoringBackupMonitor::class);
        $this->assertSame(MonitoringStatus::Operational->value, $monitor->summary()['status']);

        Carbon::setTestNow(now()->addHours(31));
        $this->assertSame(MonitoringStatus::Degraded->value, $monitor->summary()['status']);

        Carbon::setTestNow(now()->addHours(18));
        $this->assertSame(MonitoringStatus::Outage->value, $monitor->summary()['status']);
    }

    public function test_backup_verification_failure_becomes_an_immediate_outage_signal(): void
    {
        config()->set('monitoring.backup.enabled', true);
        config()->set('disaster_recovery.backup.enabled', true);
        config()->set('disaster_recovery.evidence.active_key_id', 'v1');
        config()->set('disaster_recovery.evidence.signing_keys', [
            'v1' => 'monitoring-backup-failure-test-key-2026',
        ]);

        $this->assertSame(1, Artisan::call('monitoring:backup-failed', [
            '--operation-id' => 'backup-operation-20260818-failed',
            '--provider' => 'managed-db',
            '--failure-code' => 'checksum_mismatch',
            '--checked-at' => '2026-08-18T10:15:00+07:00',
            '--quiet' => true,
        ]));

        $this->assertDatabaseHas('recovery_evidence', [
            'evidence_type' => 'backup_failed',
            'operation_id' => 'backup-operation-20260818-failed',
            'status' => MonitoringStatus::Outage->value,
        ]);

        $summary = app(MonitoringBackupMonitor::class)->summary();
        $this->assertSame(MonitoringStatus::Outage->value, $summary['status']);
        $this->assertSame(0, $summary['age_seconds']);
    }

    public function test_collection_projects_history_slo_alerting_and_does_not_double_sample(): void
    {
        config()->set('data_integrity.cache_store', 'array');
        $this->assertSame(0, Artisan::call('monitoring:collect', ['--quiet' => true]));
        $this->assertSame(0, Artisan::call('monitoring:collect', ['--quiet' => true]));

        $record = \App\Models\MonitoringSnapshot::query()->findOrFail('current');
        $payload = $record->payload;

        $this->assertTrue($payload['history']['available']);
        $this->assertSame(1, MonitoringRollup::query()
            ->where('metric_key', 'overall')
            ->sum('sample_count'));
        $this->assertSame('internal_rollups', $payload['slos']['items'][0]['source']);
        $this->assertArrayHasKey('pending_deliveries', $payload['alerting']);
        $this->assertArrayHasKey('configured', $payload['backup']);
        $this->assertContains('bounded_hourly_rollups', $payload['observability']['configured_signals']);
    }

    /** @return array<string, mixed> */
    private function snapshot(MonitoringStatus $status): array
    {
        return [
            'overall' => ['status' => $status->value],
            'services' => [[
                'key' => 'database',
                'status' => $status->value,
                'latency_ms' => 12,
            ]],
            'queue' => ['status' => $status->value, 'depth' => 3],
            'collection_duration_ms' => 18,
        ];
    }

    private function rollupAt(Carbon $at): MonitoringRollup
    {
        return MonitoringRollup::query()->create([
            'metric_key' => 'overall',
            'bucket_started_at' => $at->copy()->startOfHour(),
            'first_sampled_at' => $at,
            'last_sampled_at' => $at,
            'sample_count' => 1,
            'operational_count' => 1,
            'degraded_count' => 0,
            'outage_count' => 0,
            'unknown_count' => 0,
            'latency_sample_count' => 0,
            'latency_sum_ms' => 0,
            'value_sample_count' => 0,
            'value_sum' => 0,
        ]);
    }

    private function delivery(string $status, Carbon $at): MonitoringAlertDelivery
    {
        $delivery = MonitoringAlertDelivery::query()->create([
            'deduplication_key' => hash('sha256', $status.$at->timestamp),
            'event' => 'opened',
            'channel' => 'log',
            'severity' => 'warning',
            'status' => $status,
            'payload' => ['schema_version' => 1],
            'attempts' => $status === 'pending' ? 0 : 1,
            'available_at' => $at,
            'delivered_at' => $status === 'delivered' ? $at : null,
        ]);
        $delivery->forceFill(['created_at' => $at, 'updated_at' => $at])->saveQuietly();

        return $delivery;
    }

    private function postExternalSli(
        string $probeId,
        bool $healthy,
        ?string $signingSecret = null,
        ?int $requestTimestamp = null,
        ?array $paths = null,
        string $baseOrigin = 'https://ubsportcenter.co.id',
        string $contentType = 'application/json',
    ): \Illuminate\Testing\TestResponse {
        $checkedAt = now('UTC')->subSecond();
        $completedAt = now('UTC');
        $paths ??= ['/up', '/health/ready', '/'];
        $body = json_encode([
            'schema_version' => 1,
            'status' => $healthy ? 'operational' : 'outage',
            'checked_at' => $checkedAt->toIso8601String(),
            'completed_at' => $completedAt->toIso8601String(),
            'base_origin' => $baseOrigin,
            'checks' => array_map(static fn (string $path): array => [
                'path' => $path,
                'healthy' => $healthy,
                'status_code' => $healthy ? 200 : 503,
                'latency_ms' => 125,
                'attempts' => 1,
                'failure' => $healthy ? null : 'Availability check failed.',
            ], $paths),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        return $this->postSignedExternalSliBody(
            probeId: $probeId,
            body: $body,
            signingSecret: $signingSecret,
            requestTimestamp: $requestTimestamp,
            contentType: $contentType,
        );
    }

    private function postSignedExternalSliBody(
        string $probeId,
        string $body,
        ?string $signingSecret = null,
        ?int $requestTimestamp = null,
        string $contentType = 'application/json',
    ): \Illuminate\Testing\TestResponse {
        $timestamp = (string) ($requestTimestamp ?? now('UTC')->timestamp);
        $canonical = "v1\n{$timestamp}\n{$probeId}\n".hash('sha256', $body);
        $signature = hash_hmac(
            'sha256',
            $canonical,
            $signingSecret ?? 'external-synthetic-signing-key-2026-v1',
        );

        return $this->call(
            'POST',
            '/monitoring/external-sli',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => $contentType,
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_UBSC_SYNTHETIC_ID' => $probeId,
                'HTTP_X_UBSC_SYNTHETIC_KEY_ID' => 'v1',
                'HTTP_X_UBSC_SYNTHETIC_TIMESTAMP' => $timestamp,
                'HTTP_X_UBSC_SYNTHETIC_SIGNATURE' => 'sha256='.$signature,
            ],
            $body,
        );
    }
}
