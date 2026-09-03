<?php

namespace Tests\Unit;

use App\Services\Production\DatabaseWriterProbe;
use App\Services\Production\HighAvailabilityProbe;
use App\Services\Resilience\SafeRetry;
use Illuminate\Config\Repository;
use Illuminate\Contracts\Redis\Factory as RedisFactory;
use Illuminate\Redis\Connections\Connection;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class HighAvailabilityProbeTest extends TestCase
{
    use MockeryPHPUnitIntegration;

    public function test_probe_checks_writer_and_each_redis_workload_without_writes(): void
    {
        $config = $this->configuration();
        $writer = Mockery::mock(DatabaseWriterProbe::class);
        $writer->shouldReceive('assertWritable')->once()->andReturnNull();

        $redis = Mockery::mock(RedisFactory::class);
        foreach (['session', 'cache', 'traffic', 'coordination', 'queue'] as $connectionName) {
            $connection = Mockery::mock(Connection::class);
            $connection->shouldReceive('command')->once()->with('ping')->andReturn(true);
            $redis->shouldReceive('connection')
                ->once()
                ->with($connectionName)
                ->andReturn($connection);
        }

        $report = (new HighAvailabilityProbe(
            $config,
            $writer,
            $redis,
            $this->retry($config),
        ))->report();

        self::assertTrue($report['healthy']);
        self::assertSame(
            ['database_writer', 'redis_session', 'redis_cache', 'redis_traffic', 'redis_coordination', 'redis_queue'],
            array_column($report['checks'], 'key'),
        );
        self::assertSame(['pass', 'pass', 'pass', 'pass', 'pass', 'pass'], array_column($report['checks'], 'status'));
    }

    public function test_probe_fails_coarsely_when_a_managed_endpoint_is_unavailable(): void
    {
        $config = $this->configuration();
        $writer = Mockery::mock(DatabaseWriterProbe::class);
        $writer->shouldReceive('assertWritable')->once()->andReturnNull();

        $redis = Mockery::mock(RedisFactory::class);
        foreach (['session', 'cache', 'traffic', 'coordination'] as $connectionName) {
            $connection = Mockery::mock(Connection::class);
            $connection->shouldReceive('command')->once()->with('ping')->andReturn(true);
            $redis->shouldReceive('connection')->once()->with($connectionName)->andReturn($connection);
        }
        $queueConnection = Mockery::mock(Connection::class);
        $queueConnection->shouldReceive('command')
            ->once()
            ->with('ping')
            ->andThrow(new RuntimeException('rediss://default:secret@queue.internal'));
        $redis->shouldReceive('connection')->once()->with('queue')->andReturn($queueConnection);

        $report = (new HighAvailabilityProbe(
            $config,
            $writer,
            $redis,
            $this->retry($config),
        ))->report();

        self::assertFalse($report['healthy']);
        self::assertSame('fail', $report['checks'][5]['status']);
        self::assertSame(
            'High-availability dependency probe failed.',
            $report['checks'][5]['message'],
        );
        self::assertStringNotContainsString('secret', json_encode($report, JSON_THROW_ON_ERROR));
    }

    private function configuration(): Repository
    {
        return new Repository([
            'session' => ['connection' => 'session'],
            'cache' => [
                'default' => 'redis',
                'limiter' => 'traffic',
                'stores' => [
                    'redis' => [
                        'connection' => 'cache',
                        'lock_connection' => 'coordination',
                    ],
                    'traffic' => [
                        'connection' => 'traffic',
                        'lock_connection' => 'traffic',
                    ],
                ],
            ],
            'queue' => [
                'default' => 'redis',
                'connections' => ['redis' => ['connection' => 'queue']],
            ],
            'resilience' => [
                'safe_retry' => [
                    'attempts' => 1,
                    'base_delay_ms' => 0,
                    'maximum_delay_ms' => 0,
                    'jitter_ms' => 0,
                ],
            ],
        ]);
    }

    private function retry(Repository $config): SafeRetry
    {
        return new SafeRetry(
            $config,
            static function (): void {},
            static fn (): int => 0,
        );
    }
}
