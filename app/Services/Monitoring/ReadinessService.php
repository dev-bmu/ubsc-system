<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Exceptions\SafeRetryExhausted;
use App\Services\BookingCheckoutSchema;
use App\Services\Production\DatabaseReplicationContract;
use App\Services\Production\DatabaseReplicationControlPlane;
use App\Services\Production\DatabaseWriterProbe;
use App\Services\Production\ProductionTopologyResolver;
use App\Services\Resilience\SafeRetry;
use Illuminate\Contracts\Redis\Factory as RedisFactory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class ReadinessService
{
    public function __construct(
        private readonly BackgroundQueueRegistry $queues,
        private readonly BookingCheckoutSchema $bookingCheckoutSchema,
        private readonly SafeRetry $retry,
        private readonly DatabaseWriterProbe $databaseWriter,
        private readonly DatabaseReplicationContract $replicationContract,
        private readonly DatabaseReplicationControlPlane $replication,
        private readonly RedisFactory $redis,
        private readonly ProductionTopologyResolver $topology,
        private readonly StorageReadinessSentinel $storageSentinel,
    ) {}

    /**
     * @return array{
     *   ready:bool,
     *   degraded:bool,
     *   checked_at:string,
     *   duration_ms:int,
     *   checks:list<array{
     *     key:string,
     *     name:string,
     *     required:bool,
     *     status:string,
     *     attempts:int,
     *     latency_ms:int|null,
     *     message:string|null
     *   }>
     * }
     */
    public function report(bool $includeDeepChecks = false): array
    {
        $startedAt = hrtime(true);
        $budgetMilliseconds = (int) config(
            'monitoring.readiness.total_budget_ms',
            4_000,
        );
        $requiredKeys = $this->normalizedChecks(
            config('monitoring.readiness.required_checks', ['database', 'cache']),
        );
        $advisoryKeys = $this->normalizedChecks(
            config('monitoring.readiness.advisory_checks', []),
        );

        if ($includeDeepChecks) {
            $advisoryKeys = array_values(array_unique(array_merge(
                $advisoryKeys,
                $this->normalizedChecks(
                    config('monitoring.readiness.deep_checks', ['queues']),
                ),
            )));
        }

        $advisoryKeys = array_values(array_diff($advisoryKeys, $requiredKeys));

        $checks = [];
        foreach ($requiredKeys as $index => $key) {
            if ($this->budgetExhausted($startedAt, $budgetMilliseconds)) {
                $checks = array_merge(
                    $checks,
                    $this->skippedChecks(array_slice($requiredKeys, $index), true),
                );
                break;
            }

            $check = $this->runCheck($key, true);
            $checks[] = $check;

            // A single required outage is enough for the load balancer to
            // remove this node. Do not hold a PHP worker while probing other
            // dependencies that cannot change the response.
            if ($check['status'] !== MonitoringStatus::Operational->value) {
                $checks = array_merge(
                    $checks,
                    $this->skippedChecks(array_slice($requiredKeys, $index + 1), true),
                );
                break;
            }
        }

        $requiredAreOperational = count($requiredKeys) > 0
            && collect($checks)
                ->where('required', true)
                ->count() === count($requiredKeys)
            && collect($checks)
                ->where('required', true)
                ->every(static fn (array $check): bool => $check['status'] === MonitoringStatus::Operational->value);

        if ($requiredAreOperational) {
            foreach ($advisoryKeys as $index => $key) {
                if ($this->budgetExhausted($startedAt, $budgetMilliseconds)) {
                    $checks = array_merge(
                        $checks,
                        $this->skippedChecks(array_slice($advisoryKeys, $index), false),
                    );
                    break;
                }

                $checks[] = $this->runCheck($key, false);
            }
        } elseif ($advisoryKeys !== []) {
            $checks = array_merge($checks, $this->skippedChecks($advisoryKeys, false));
        }

        $required = array_values(array_filter(
            $checks,
            static fn (array $check): bool => $check['required'],
        ));
        $ready = $required !== [] && collect($required)->every(
            static fn (array $check): bool => $check['status'] === MonitoringStatus::Operational->value,
        );
        $degraded = collect($checks)->contains(
            static fn (array $check): bool => ! $check['required']
                && $check['status'] !== MonitoringStatus::Operational->value,
        );

        return [
            'ready' => $ready,
            'degraded' => $degraded,
            'checked_at' => now()->toIso8601String(),
            'duration_ms' => $this->elapsedMilliseconds($startedAt),
            'checks' => $checks,
        ];
    }

    /**
     * @return array{
     *   key:string,
     *   name:string,
     *   required:bool,
     *   status:string,
     *   attempts:int,
     *   latency_ms:int|null,
     *   message:string|null
     * }
     */
    private function runCheck(string $key, bool $required): array
    {
        [$name, $callback] = $this->definition($key);

        return $this->probe($key, $name, $required, $callback);
    }

    /** @return array{0:string,1:callable():void} */
    private function definition(string $key): array
    {
        return match ($key) {
            'database' => ['Database writer', function (): void {
                $this->databaseWriter->assertWritable();
                $this->bookingCheckoutSchema->assertDeploymentComplete();

                // Once production replication is enforced, a writable socket
                // is insufficient: split brain or an unfenced stale writer
                // must remove this application node from write traffic. This
                // remains part of the existing database check so deployment
                // cannot accidentally omit it from the readiness list.
                if (! $this->topology->isSingleNode()
                    && (bool) config('database_replication.enabled', false)
                    && $this->replicationContract->shouldEnforce()) {
                    $this->replication->assertCurrentWriterSafety();
                }
            }],
            'sessions' => ['Shared sessions', function (): void {
                $driver = strtolower((string) config('session.driver'));

                if ($driver === 'database') {
                    // The required writer probe already covers this shared
                    // dependency without adding another query per LB poll.
                    return;
                }

                if ($driver !== 'redis') {
                    throw new RuntimeException('Shared session readiness is not configured.');
                }

                $connection = (string) (config('session.connection') ?: 'default');
                $pong = $this->redis->connection($connection)->command('ping');
                if ($pong === false || $pong === null) {
                    throw new RuntimeException('Shared session readiness failed.');
                }
            }],
            'cache' => ['Shared cache', function (): void {
                $store = Cache::store();

                if (! (bool) config('monitoring.readiness.cache_write_probe', true)) {
                    $store->get('monitoring:readiness:sentinel');

                    return;
                }

                $key = 'monitoring:readiness:'.Str::uuid();
                $token = Str::random(32);

                try {
                    if (! $store->put($key, $token, 10) || $store->get($key) !== $token) {
                        throw new RuntimeException('Shared cache round-trip probe failed.');
                    }
                } finally {
                    $store->forget($key);
                }
            }],
            'traffic' => ['Traffic limiter', function (): void {
                $storeName = (string) config('cache.limiter');
                if ($storeName === '') {
                    throw new RuntimeException('Traffic limiter readiness is not configured.');
                }

                $store = Cache::store($storeName);
                $key = 'monitoring:readiness:traffic:'.Str::uuid();
                $token = Str::random(32);

                try {
                    if (! $store->put($key, $token, 10) || $store->get($key) !== $token) {
                        throw new RuntimeException('Traffic limiter round-trip probe failed.');
                    }
                } finally {
                    $store->forget($key);
                }
            }],
            'locks' => ['Distributed coordination', function (): void {
                $lock = Cache::store()->lock(
                    'monitoring:readiness:lock:'.Str::uuid(),
                    10,
                );

                if (! $lock->get()) {
                    throw new RuntimeException('Distributed coordination readiness failed.');
                }

                try {
                    // Acquisition itself proves that all nodes can coordinate
                    // through the selected atomic-lock connection.
                } finally {
                    $lock->release();
                }
            }],
            'queues' => ['Queue backends', function (): void {
                $connections = collect($this->queues->all())
                    ->unique(fn (array $definition): string => $definition['connection'].'|'.$definition['queue'])
                    ->values();

                foreach ($connections as $definition) {
                    Queue::connection($definition['connection'])
                        ->size($definition['queue']);
                }
            }],
            'storage' => ['Shared object storage', function (): void {
                $disk = trim((string) config('monitoring.readiness.storage_disk'));
                $sentinel = $this->storageSentinel->normalizePath((string) config(
                    'monitoring.readiness.storage_sentinel',
                ));

                if (! $this->storageSentinel->validDisk($disk) || $sentinel === null) {
                    throw new RuntimeException('Storage readiness is not configured.');
                }

                $storage = Storage::disk($disk);
                if (! $storage->exists($sentinel)
                    || ! $this->storageSentinel->contentMatches($storage->get($sentinel))) {
                    throw new RuntimeException('Storage readiness sentinel is unavailable.');
                }
            }],
            default => [ucfirst($key), static function (): void {
                throw new RuntimeException('Readiness adapter is not configured.');
            }],
        };
    }

    /**
     * @param  callable(): void  $callback
     * @return array{
     *   key:string,
     *   name:string,
     *   required:bool,
     *   status:string,
     *   attempts:int,
     *   latency_ms:int|null,
     *   message:string|null
     * }
     */
    private function probe(
        string $key,
        string $name,
        bool $required,
        callable $callback,
    ): array {
        $startedAt = hrtime(true);

        try {
            $result = $this->retry->repeatable(
                $callback,
                attemptLimit: (int) config('monitoring.readiness.attempts', 1),
            );

            return [
                'key' => $key,
                'name' => $name,
                'required' => $required,
                'status' => MonitoringStatus::Operational->value,
                'attempts' => $result['attempts'],
                'latency_ms' => $this->elapsedMilliseconds($startedAt),
                'message' => null,
            ];
        } catch (SafeRetryExhausted $exception) {
            return [
                'key' => $key,
                'name' => $name,
                'required' => $required,
                'status' => MonitoringStatus::Outage->value,
                'attempts' => $exception->attempts,
                'latency_ms' => $this->elapsedMilliseconds($startedAt),
                // Never expose exception text, credentials, hosts, or driver
                // details in either internal snapshots or public responses.
                'message' => 'Dependency check failed.',
            ];
        } catch (Throwable) {
            return [
                'key' => $key,
                'name' => $name,
                'required' => $required,
                'status' => MonitoringStatus::Outage->value,
                'attempts' => 1,
                'latency_ms' => $this->elapsedMilliseconds($startedAt),
                'message' => 'Dependency check failed.',
            ];
        }
    }

    /** @return list<string> */
    private function normalizedChecks(mixed $checks): array
    {
        return array_values(array_unique(array_filter(array_map(
            static fn (mixed $check): string => strtolower(trim((string) $check)),
            (array) $checks,
        ))));
    }

    /**
     * @param  list<string>  $keys
     * @return list<array{key:string,name:string,required:bool,status:string,attempts:int,latency_ms:null,message:string}>
     */
    private function skippedChecks(array $keys, bool $required): array
    {
        return array_map(function (string $key) use ($required): array {
            [$name] = $this->definition($key);

            return [
                'key' => $key,
                'name' => $name,
                'required' => $required,
                'status' => MonitoringStatus::Unknown->value,
                'attempts' => 0,
                'latency_ms' => null,
                'message' => 'Dependency check was not started after fail-fast.',
            ];
        }, $keys);
    }

    private function budgetExhausted(int $startedAt, int $budgetMilliseconds): bool
    {
        return $this->elapsedMilliseconds($startedAt) >= max(1, $budgetMilliseconds);
    }

    private function elapsedMilliseconds(int $startedAt): int
    {
        return max(0, (int) round((hrtime(true) - $startedAt) / 1_000_000));
    }
}
