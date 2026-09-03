<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

class MonitoringHeartbeatRecorder
{
    /**
     * @param  array<string, bool|float|int|string|null>  $context
     */
    public function record(
        string $key,
        string $category,
        MonitoringStatus $status,
        ?int $latencyMs = null,
        ?string $message = null,
        array $context = [],
        ?CarbonInterface $observedAt = null,
    ): MonitoringHeartbeat {
        $this->assertIdentifier($key, 100, 'heartbeat key');
        $this->assertIdentifier($category, 32, 'heartbeat category');

        $observedAt = CarbonImmutable::instance($observedAt ?? now())
            ->setTimezone((string) config('app.timezone', 'UTC'))
            ->setMicrosecond(0);
        if ($observedAt->greaterThan(now()->addMinutes(5))) {
            throw new InvalidArgumentException('Heartbeat observation exceeds the clock-skew tolerance.');
        }

        $attributes = [
            'category' => $category,
            'status' => $status->value,
            'observed_at' => $observedAt,
            'latency_ms' => $latencyMs === null ? null : max(0, min($latencyMs, 86_400_000)),
            'message' => $message === null ? null : Str::limit(strip_tags($message), 255, ''),
            'context' => $this->sanitizeContext($context),
        ];

        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                return DB::transaction(function () use (
                    $key,
                    $category,
                    $status,
                    $observedAt,
                    $attributes,
                ): MonitoringHeartbeat {
                    $heartbeat = MonitoringHeartbeat::query()
                        ->whereKey($key)
                        ->lockForUpdate()
                        ->first();

                    if ($heartbeat === null) {
                        return MonitoringHeartbeat::query()->create([
                            'key' => $key,
                            ...$attributes,
                            'last_success_at' => $status === MonitoringStatus::Operational
                                ? $observedAt
                                : null,
                            'last_failure_at' => in_array(
                                $status,
                                [MonitoringStatus::Degraded, MonitoringStatus::Outage],
                                true,
                            ) ? $observedAt : null,
                        ]);
                    }

                    if (! hash_equals((string) $heartbeat->category, $category)) {
                        throw new InvalidArgumentException(
                            'A heartbeat key cannot be reused across categories.',
                        );
                    }

                    $storedAt = CarbonImmutable::instance($heartbeat->observed_at)
                        ->setMicrosecond(0);
                    if ($observedAt->lessThan($storedAt)) {
                        // Provider callbacks and retried jobs may arrive out of
                        // order. An older success must never erase a newer
                        // outage (and an old outage must not regress recovery).
                        return $heartbeat;
                    }

                    if ($observedAt->equalTo($storedAt)) {
                        $storedStatus = MonitoringStatus::tryFrom((string) $heartbeat->status)
                            ?? MonitoringStatus::Unknown;
                        if ($storedStatus->priority() >= $status->priority()) {
                            return $heartbeat;
                        }
                    }

                    if ($status === MonitoringStatus::Operational) {
                        $attributes['last_success_at'] = $this->latest(
                            $heartbeat->last_success_at,
                            $observedAt,
                        );
                    } elseif (in_array(
                        $status,
                        [MonitoringStatus::Degraded, MonitoringStatus::Outage],
                        true,
                    )) {
                        $attributes['last_failure_at'] = $this->latest(
                            $heartbeat->last_failure_at,
                            $observedAt,
                        );
                    }

                    $heartbeat->forceFill($attributes)->save();

                    return $heartbeat->refresh();
                }, 3);
            } catch (QueryException $exception) {
                // A row does not exist yet, so no database can lock the gap in
                // a portable way. A concurrent first writer may win the unique
                // key; retry under the now-existing row lock.
                if ($attempt === 3) {
                    throw $exception;
                }
            }
        }

        throw new \RuntimeException('Heartbeat could not be recorded.');
    }

    public static function queueKey(string $connection, string $queue): string
    {
        return 'queue-worker:'.substr(hash('sha256', $connection."\0".$queue), 0, 24);
    }

    public static function queueIncidentKey(
        string $event,
        string $connection,
        string $queue,
    ): string {
        return 'queue-probe-'.$event.':'.substr(
            hash('sha256', $connection."\0".$queue),
            0,
            20,
        );
    }

    private function assertIdentifier(string $value, int $maxLength, string $label): void
    {
        if ($value === ''
            || strlen($value) > $maxLength
            || preg_match('/^[a-z0-9][a-z0-9_.:-]*$/', $value) !== 1) {
            throw new InvalidArgumentException("Invalid {$label}.");
        }
    }

    /**
     * @param  array<string, bool|float|int|string|null>  $context
     * @return array<string, bool|float|int|string|null>
     */
    private function sanitizeContext(array $context): array
    {
        $safe = [];
        $blockedKey = '/(?:auth|cookie|credential|email|identity|name|pass|payload|phone|secret|token)/i';

        foreach (array_slice($context, 0, 20, true) as $key => $value) {
            if (! is_string($key)
                || preg_match('/^[a-z0-9_.-]{1,64}$/', $key) !== 1
                || preg_match($blockedKey, $key) === 1
                || (! is_scalar($value) && $value !== null)) {
                continue;
            }

            $safe[$key] = is_string($value)
                ? Str::limit(strip_tags($value), 160, '')
                : $value;
        }

        return $safe;
    }

    private function latest(mixed $stored, CarbonImmutable $candidate): CarbonImmutable
    {
        if (! $stored instanceof CarbonInterface) {
            return $candidate;
        }

        $stored = CarbonImmutable::instance($stored)->setMicrosecond(0);

        return $stored->greaterThan($candidate) ? $stored : $candidate;
    }
}
