<?php

namespace Tests\Feature;

use App\Exceptions\BookingCheckoutSchemaUnavailable;
use App\Services\BookingCheckoutSchema;
use App\Services\Monitoring\ReadinessService;
use App\Services\Production\DatabaseWriterProbe;
use Illuminate\Contracts\Redis\Factory as RedisFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Redis\Connections\Connection;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

final class ProductionResilienceHttpTest extends TestCase
{
    use RefreshDatabase;

    public function test_server_generates_a_fresh_request_id_and_ignores_client_trace_values(): void
    {
        $first = $this->withHeader('X-Request-ID', 'attacker-controlled')
            ->get('/up');
        $second = $this->get('/up');
        $firstId = (string) $first->headers->get('X-Request-ID');
        $secondId = (string) $second->headers->get('X-Request-ID');

        $first->assertOk();
        $second->assertOk();
        self::assertNotSame('attacker-controlled', $firstId);
        self::assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/',
            $firstId,
        );
        self::assertNotSame($firstId, $secondId);
    }

    public function test_idempotency_header_is_normalized_merged_and_echoed(): void
    {
        $this->registerIdempotencyProbe();
        $key = strtoupper((string) Str::uuid());

        $this->postJson('/_test/idempotency', [], [
            'Idempotency-Key' => $key,
        ])
            ->assertOk()
            ->assertHeader('Idempotency-Key', strtolower($key))
            ->assertExactJson(['key' => strtolower($key)]);
    }

    public function test_mismatched_idempotency_header_and_body_are_rejected(): void
    {
        $this->registerIdempotencyProbe();

        $this->postJson('/_test/idempotency', [
            'idempotency_key' => (string) Str::uuid(),
        ], [
            'Idempotency-Key' => (string) Str::uuid(),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('idempotency_key');
    }

    public function test_advisory_readiness_failure_keeps_public_route_ready(): void
    {
        $readiness = Mockery::mock(ReadinessService::class);
        $readiness->shouldReceive('report')->once()->andReturn([
            'ready' => true,
            'degraded' => true,
            'checked_at' => '2026-08-23T12:00:00+07:00',
            'checks' => [],
        ]);
        $this->instance(ReadinessService::class, $readiness);

        $this->getJson('/health/ready')
            ->assertOk()
            ->assertHeader('X-UBSC-Health', 'readiness')
            ->assertHeader('X-UBSC-Health-State', 'degraded')
            ->assertExactJson([
                'status' => 'ready',
                'checked_at' => '2026-08-23T12:00:00+07:00',
            ]);
    }

    public function test_readiness_exposes_only_an_opaque_instance_identity(): void
    {
        config()->set('high_availability.load_balancer.instance_id', 'ubsc-app-primary-01');
        config()->set('high_availability.load_balancer.expose_instance_header', true);
        config()->set('high_availability.load_balancer.expose_release_header', true);
        config()->set('monitoring.release', 'release-20260823');

        $readiness = Mockery::mock(ReadinessService::class);
        $readiness->shouldReceive('report')->once()->andReturn([
            'ready' => true,
            'degraded' => false,
            'checked_at' => '2026-08-23T12:00:00+07:00',
            'checks' => [],
        ]);
        $this->instance(ReadinessService::class, $readiness);

        $this->getJson('/health/ready')
            ->assertOk()
            ->assertHeader(
                'X-UBSC-Instance',
                substr(hash('sha256', 'ubsc-app-primary-01'), 0, 16),
            )
            ->assertHeader(
                'X-UBSC-Release',
                substr(hash('sha256', 'release-20260823'), 0, 16),
            )
            ->assertHeaderMissing('X-UBSC-Topology');
    }

    public function test_real_readiness_gates_only_required_dependencies(): void
    {
        config()->set('monitoring.readiness.required_checks', ['database', 'cache']);
        config()->set('monitoring.readiness.advisory_checks', ['unsupported-adapter']);
        config()->set('resilience.safe_retry.attempts', 1);

        $report = app(ReadinessService::class)->report();

        self::assertTrue($report['ready']);
        self::assertTrue($report['degraded']);
        self::assertSame(
            ['database', 'cache'],
            collect($report['checks'])
                ->where('required', true)
                ->pluck('key')
                ->values()
                ->all(),
        );

        config()->set(
            'monitoring.readiness.required_checks',
            ['database', 'cache', 'unsupported-adapter'],
        );
        config()->set('monitoring.readiness.advisory_checks', []);

        self::assertFalse(app(ReadinessService::class)->report()['ready']);
    }

    public function test_database_readiness_rejects_an_incomplete_booking_checkout_schema(): void
    {
        config()->set('monitoring.readiness.required_checks', ['database']);
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('monitoring.readiness.attempts', 1);

        $writer = Mockery::mock(DatabaseWriterProbe::class);
        $writer->shouldReceive('assertWritable')->once();
        $this->instance(DatabaseWriterProbe::class, $writer);

        $schema = Mockery::mock(BookingCheckoutSchema::class);
        $schema->shouldReceive('assertDeploymentComplete')
            ->once()
            ->andThrow(new BookingCheckoutSchemaUnavailable([
                'column:bookings.customer_phone',
            ]));
        $this->instance(BookingCheckoutSchema::class, $schema);

        $report = app(ReadinessService::class)->report();

        self::assertFalse($report['ready']);
        self::assertSame('outage', $report['checks'][0]['status']);
        self::assertSame('Dependency check failed.', $report['checks'][0]['message']);
    }

    public function test_session_redis_is_a_required_runtime_dependency_in_ha_mode(): void
    {
        config()->set('monitoring.readiness.required_checks', ['database', 'cache', 'sessions']);
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('resilience.safe_retry.attempts', 1);
        config()->set('session.driver', 'redis');
        config()->set('session.connection', 'session');

        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('command')->once()->with('ping')->andReturn(false);
        $redis = Mockery::mock(RedisFactory::class);
        $redis->shouldReceive('connection')->once()->with('session')->andReturn($connection);
        $this->instance(RedisFactory::class, $redis);

        $report = app(ReadinessService::class)->report();
        $session = collect($report['checks'])->firstWhere('key', 'sessions');

        self::assertFalse($report['ready']);
        self::assertSame('outage', $session['status']);
        self::assertSame('Dependency check failed.', $session['message']);
    }

    public function test_required_failure_stops_later_probes_with_an_explicit_unknown_state(): void
    {
        config()->set(
            'monitoring.readiness.required_checks',
            ['unsupported-adapter', 'database', 'cache'],
        );
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('monitoring.readiness.attempts', 1);

        $report = app(ReadinessService::class)->report();

        self::assertFalse($report['ready']);
        self::assertSame(
            ['outage', 'unknown', 'unknown'],
            array_column($report['checks'], 'status'),
        );
        self::assertSame([1, 0, 0], array_column($report['checks'], 'attempts'));
    }

    public function test_readiness_budget_prevents_starting_another_dependency_probe(): void
    {
        config()->set('monitoring.readiness.required_checks', ['database', 'cache']);
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('monitoring.readiness.attempts', 1);
        config()->set('monitoring.readiness.total_budget_ms', 1);

        $writer = Mockery::mock(DatabaseWriterProbe::class);
        $writer->shouldReceive('assertWritable')->once()->andReturnUsing(
            static function (): void {
                usleep(3_000);
            },
        );
        $this->instance(DatabaseWriterProbe::class, $writer);

        $report = app(ReadinessService::class)->report();

        self::assertFalse($report['ready']);
        self::assertSame(['operational', 'unknown'], array_column($report['checks'], 'status'));
        self::assertGreaterThanOrEqual(1, $report['duration_ms']);
    }

    private function registerIdempotencyProbe(): void
    {
        Route::post('/_test/idempotency', static fn (Request $request) => response()->json(['key' => $request->input('idempotency_key')]))
            ->middleware('idempotency');
    }
}
