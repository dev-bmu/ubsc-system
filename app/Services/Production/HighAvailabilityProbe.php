<?php

namespace App\Services\Production;

use App\Exceptions\SafeRetryExhausted;
use App\Services\Resilience\SafeRetry;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Redis\Factory as RedisFactory;
use RuntimeException;
use Throwable;

class HighAvailabilityProbe
{
    public function __construct(
        private readonly Repository $config,
        private readonly DatabaseWriterProbe $database,
        private readonly RedisFactory $redis,
        private readonly SafeRetry $retry,
    ) {}

    /**
     * @return array{
     *   healthy:bool,
     *   checked_at:string,
     *   checks:list<array{key:string,status:string,attempts:int,latency_ms:int,message:string|null}>
     * }
     */
    public function report(): array
    {
        $checks = [
            $this->probe('database_writer', function (): void {
                $this->database->assertWritable();
            }),
        ];

        foreach ($this->redisConnections() as $workload => $connection) {
            $checks[] = $this->probe("redis_{$workload}", function () use ($connection): void {
                $pong = $this->redis->connection($connection)->command('ping');

                if ($pong === false || $pong === null) {
                    throw new RuntimeException('Redis endpoint did not answer.');
                }
            });
        }

        return [
            'healthy' => collect($checks)->every(
                static fn (array $check): bool => $check['status'] === 'pass',
            ),
            'checked_at' => now()->toIso8601String(),
            'checks' => $checks,
        ];
    }

    /**
     * @param  callable(): mixed  $callback
     * @return array{key:string,status:string,attempts:int,latency_ms:int,message:string|null}
     */
    private function probe(string $key, callable $callback): array
    {
        $startedAt = hrtime(true);

        try {
            $result = $this->retry->repeatable($callback);

            return [
                'key' => $key,
                'status' => 'pass',
                'attempts' => $result['attempts'],
                'latency_ms' => $this->elapsedMilliseconds($startedAt),
                'message' => null,
            ];
        } catch (SafeRetryExhausted $exception) {
            return [
                'key' => $key,
                'status' => 'fail',
                'attempts' => $exception->attempts,
                'latency_ms' => $this->elapsedMilliseconds($startedAt),
                'message' => 'High-availability dependency probe failed.',
            ];
        } catch (Throwable) {
            return [
                'key' => $key,
                'status' => 'fail',
                'attempts' => 1,
                'latency_ms' => $this->elapsedMilliseconds($startedAt),
                'message' => 'High-availability dependency probe failed.',
            ];
        }
    }

    /** @return array{session:string,cache:string,traffic:string,coordination:string,queue:string} */
    private function redisConnections(): array
    {
        $session = (string) ($this->config->get('session.connection') ?: 'default');
        $cacheStore = (string) $this->config->get('cache.default');
        $cache = (string) $this->config->get(
            "cache.stores.{$cacheStore}.connection",
            'cache',
        );
        $coordination = (string) $this->config->get(
            "cache.stores.{$cacheStore}.lock_connection",
            'coordination',
        );
        $limiterStore = (string) $this->config->get('cache.limiter');
        $traffic = (string) $this->config->get(
            "cache.stores.{$limiterStore}.connection",
            'traffic',
        );
        $queueConnection = (string) $this->config->get('queue.default');
        $queue = (string) $this->config->get(
            "queue.connections.{$queueConnection}.connection",
            'default',
        );

        return compact('session', 'cache', 'traffic', 'coordination', 'queue');
    }

    private function elapsedMilliseconds(int $startedAt): int
    {
        return max(0, (int) round((hrtime(true) - $startedAt) / 1_000_000));
    }
}
