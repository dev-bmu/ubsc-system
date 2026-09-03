<?php

namespace Tests\Unit;

use App\Services\Production\DatabaseWriterProbe;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\DatabaseManager;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class DatabaseWriterProbeTest extends TestCase
{
    use MockeryPHPUnitIntegration;

    public function test_mysql_writer_role_is_accepted(): void
    {
        $connection = Mockery::mock(ConnectionInterface::class);
        $connection->shouldReceive('getDriverName')->once()->andReturn('mariadb');
        $connection->shouldReceive('selectOne')
            ->once()
            ->with('SELECT @@global.read_only AS read_only')
            ->andReturn((object) ['read_only' => 0]);

        $manager = Mockery::mock(DatabaseManager::class);
        $manager->shouldReceive('connection')->once()->with(null)->andReturn($connection);

        (new DatabaseWriterProbe($manager))->assertWritable();

        self::assertTrue(true);
    }

    public function test_read_only_failover_endpoint_is_rejected(): void
    {
        $connection = Mockery::mock(ConnectionInterface::class);
        $connection->shouldReceive('getDriverName')->once()->andReturn('mysql');
        $connection->shouldReceive('selectOne')->once()->andReturn((object) ['read_only' => 1]);

        $manager = Mockery::mock(DatabaseManager::class);
        $manager->shouldReceive('connection')->once()->with(null)->andReturn($connection);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Database endpoint is not writable.');

        (new DatabaseWriterProbe($manager))->assertWritable();
    }
}
