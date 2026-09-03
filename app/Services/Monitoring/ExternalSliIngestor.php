<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringExternalSliReceipt;
use App\Services\Production\ExternalSliKeyring;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use JsonException;

final class ExternalSliIngestor
{
    public function __construct(
        private readonly ExternalSliKeyring $keyring,
        private readonly MonitoringRollupRecorder $rollups,
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    /** @return array{accepted:bool,duplicate:bool,status:string,observed_at:string} */
    public function ingest(
        string $rawBody,
        string $requestTimestamp,
        string $probeId,
        string $keyId,
        string $signature,
    ): array {
        if (! (bool) config('observability.external_sli.ingest_enabled', false)) {
            throw new InvalidArgumentException('External SLI ingestion is unavailable.');
        }

        $this->authenticate($rawBody, $requestTimestamp, $probeId, $keyId, $signature);
        $payload = $this->payload($rawBody);
        $status = MonitoringStatus::from($payload['status']);
        $checkedAt = $payload['checked_at'];
        $completedAt = $payload['completed_at'];
        if (abs((int) $requestTimestamp - $completedAt->timestamp) > (int) config(
            'observability.external_sli.clock_skew_seconds',
            300,
        )) {
            throw new InvalidArgumentException('External SLI evidence is stale.');
        }
        $latencyMs = $payload['latency_ms'];
        $provider = (string) config('observability.external_sli.provider', 'external');
        if (preg_match('/^[a-z0-9][a-z0-9_.:-]{0,63}$/', $provider) !== 1) {
            throw new InvalidArgumentException('External SLI provider is invalid.');
        }
        $bodyHash = hash('sha256', $rawBody);

        $created = $this->persist(
            provider: $provider,
            probeId: $probeId,
            keyId: $keyId,
            status: $status,
            checkedAt: $checkedAt,
            completedAt: $completedAt,
            latencyMs: $latencyMs,
            bodyHash: $bodyHash,
        );

        return [
            'accepted' => true,
            'duplicate' => ! $created,
            'status' => $status->value,
            'observed_at' => $completedAt->toIso8601String(),
        ];
    }

    private function authenticate(
        string $body,
        string $requestTimestamp,
        string $probeId,
        string $keyId,
        string $signature,
    ): void {
        $maximumBytes = (int) config(
            'observability.external_sli.maximum_body_bytes',
            16_384,
        );
        if ($body === '' || strlen($body) > $maximumBytes) {
            throw new InvalidArgumentException('External SLI payload is invalid.');
        }
        if (preg_match('/^[0-9]{10}$/', $requestTimestamp) !== 1
            || preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/', $probeId) !== 1
            || preg_match('/^sha256=[a-f0-9]{64}$/', strtolower($signature)) !== 1) {
            throw new InvalidArgumentException('External SLI authentication is invalid.');
        }

        $skew = abs(now('UTC')->timestamp - (int) $requestTimestamp);
        if ($skew > (int) config('observability.external_sli.clock_skew_seconds', 300)) {
            throw new InvalidArgumentException('External SLI request is outside its freshness window.');
        }

        $key = $this->keyring->key($keyId);
        if ($key === null) {
            throw new InvalidArgumentException('External SLI authentication is invalid.');
        }

        $canonical = "v1\n{$requestTimestamp}\n{$probeId}\n".hash('sha256', $body);
        $expected = 'sha256='.hash_hmac('sha256', $canonical, $key);
        if (! hash_equals($expected, strtolower($signature))) {
            throw new InvalidArgumentException('External SLI authentication is invalid.');
        }
    }

    /**
     * @return array{status:string,checked_at:CarbonImmutable,completed_at:CarbonImmutable,latency_ms:int|null}
     */
    private function payload(string $rawBody): array
    {
        try {
            $payload = json_decode($rawBody, true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidArgumentException('External SLI payload is invalid.');
        }
        if (! is_array($payload)
            || ($payload['schema_version'] ?? null) !== 1
            || ! in_array($payload['status'] ?? null, ['operational', 'outage'], true)
            || ! is_array($payload['checks'] ?? null)
            || ! array_is_list($payload['checks'])
            || count($payload['checks']) < 1
            || count($payload['checks']) > 10
            || ! is_string($payload['base_origin'] ?? null)
            || strlen($payload['base_origin']) > 512) {
            throw new InvalidArgumentException('External SLI payload is invalid.');
        }

        $checkedAt = $this->timestamp($payload['checked_at'] ?? null);
        $completedAt = $this->timestamp($payload['completed_at'] ?? null);
        $maximumDuration = (int) config(
            'observability.external_sli.maximum_probe_duration_seconds',
            180,
        );
        if ($checkedAt->greaterThan($completedAt)
            || $checkedAt->diffInSeconds($completedAt) > $maximumDuration
            || $completedAt->greaterThan(now('UTC')->addMinutes(5))) {
            throw new InvalidArgumentException('External SLI timestamps are inconsistent.');
        }

        $allHealthy = true;
        $latencies = [];
        $observedPaths = [];
        $maximumHealthyLatency = min(30_000, max(250, (int) config(
            'monitoring.external.maximum_healthy_latency_ms',
            5_000,
        )));
        foreach ($payload['checks'] as $check) {
            $statusCode = is_array($check) ? ($check['status_code'] ?? null) : null;
            $failure = is_array($check) ? ($check['failure'] ?? null) : null;

            if (! is_array($check)
                || ! is_bool($check['healthy'] ?? null)
                || ! is_string($check['path'] ?? null)
                || preg_match('/^\/[A-Za-z0-9._~!$&\'()*+,;=:@%\/-]{0,255}$/', $check['path']) !== 1
                || ! is_int($check['attempts'] ?? null)
                || $check['attempts'] < 1
                || $check['attempts'] > 5
                || (! is_int($statusCode) && $statusCode !== null)
                || (is_int($statusCode)
                    && ($statusCode < 100 || $statusCode > 599))
                || ! is_int($check['latency_ms'] ?? null)
                || $check['latency_ms'] < 0
                || $check['latency_ms'] > 86_400_000
                || (! is_string($failure) && $failure !== null)
                || (is_string($failure)
                    && (trim($failure) === '' || strlen($failure) > 500))) {
                throw new InvalidArgumentException('External SLI check result is invalid.');
            }

            $path = $check['path'];
            if (isset($observedPaths[$path])) {
                throw new InvalidArgumentException('External SLI check paths must be unique.');
            }
            $observedPaths[$path] = true;

            if ($check['healthy'] && (
                ! is_int($statusCode)
                || $statusCode < 200
                || $statusCode >= 300
                || $check['latency_ms'] > $maximumHealthyLatency
                || $failure !== null
            )) {
                throw new InvalidArgumentException('External SLI healthy check is inconsistent.');
            }
            if (! $check['healthy'] && ! is_string($failure)) {
                throw new InvalidArgumentException('External SLI failed check requires a reason.');
            }

            $allHealthy = $allHealthy && $check['healthy'];
            $latencies[] = $check['latency_ms'];
        }

        $requiredPaths = array_values(array_unique(array_filter(
            (array) config('monitoring.external.required_paths', []),
            static fn (mixed $path): bool => is_string($path) && $path !== '',
        )));
        if ($requiredPaths === []
            || array_diff($requiredPaths, array_keys($observedPaths)) !== []) {
            throw new InvalidArgumentException('External SLI required checks are missing.');
        }
        $expectedStatus = $allHealthy ? 'operational' : 'outage';
        if (! hash_equals($expectedStatus, (string) $payload['status'])) {
            throw new InvalidArgumentException('External SLI aggregate status is inconsistent.');
        }

        $expectedOrigin = $this->origin((string) config('monitoring.external.check_url', ''));
        $applicationOrigin = $this->origin((string) config('app.url', ''));
        $observedOrigin = $this->origin((string) ($payload['base_origin'] ?? ''));
        if ($expectedOrigin === null
            || $applicationOrigin === null
            || $observedOrigin === null
            || ! hash_equals($applicationOrigin, $expectedOrigin)
            || ! hash_equals($expectedOrigin, $observedOrigin)) {
            throw new InvalidArgumentException('External SLI target origin is inconsistent.');
        }

        return [
            'status' => $expectedStatus,
            'checked_at' => $checkedAt,
            'completed_at' => $completedAt,
            'latency_ms' => $latencies === [] ? null : max($latencies),
        ];
    }

    private function persist(
        string $provider,
        string $probeId,
        string $keyId,
        MonitoringStatus $status,
        CarbonImmutable $checkedAt,
        CarbonImmutable $completedAt,
        ?int $latencyMs,
        string $bodyHash,
    ): bool {
        try {
            return DB::transaction(function () use (
                $provider,
                $probeId,
                $keyId,
                $status,
                $checkedAt,
                $completedAt,
                $latencyMs,
                $bodyHash,
            ): bool {
                $existing = MonitoringExternalSliReceipt::query()
                    ->where('provider', $provider)
                    ->where('probe_id', $probeId)
                    ->lockForUpdate()
                    ->first();
                if ($existing !== null) {
                    $this->assertIdempotent($existing, $bodyHash, $keyId);

                    return false;
                }

                MonitoringExternalSliReceipt::query()->create([
                    'provider' => $provider,
                    'probe_id' => $probeId,
                    'signing_key_id' => $keyId,
                    'status' => $status->value,
                    'checked_at' => $checkedAt,
                    'completed_at' => $completedAt,
                    'latency_ms' => $latencyMs,
                    'body_sha256' => $bodyHash,
                    'recorded_at' => now(),
                ]);
                $this->rollups->recordExternalAvailability($status, $completedAt, $latencyMs);
                $this->heartbeats->record(
                    key: (string) config(
                        'observability.external_sli.heartbeat_key',
                        'external-synthetic-availability',
                    ),
                    category: 'availability',
                    status: $status,
                    latencyMs: $latencyMs,
                    message: $status === MonitoringStatus::Operational
                        ? 'External synthetic probe passed.'
                        : 'External synthetic probe reported an outage.',
                    context: [
                        'provider' => $provider,
                        'probe_id' => $probeId,
                    ],
                    observedAt: $completedAt,
                );

                return true;
            }, 3);
        } catch (QueryException $exception) {
            $existing = MonitoringExternalSliReceipt::query()
                ->where('provider', $provider)
                ->where('probe_id', $probeId)
                ->first();
            if ($existing === null) {
                throw $exception;
            }
            $this->assertIdempotent($existing, $bodyHash, $keyId);

            return false;
        }
    }

    private function assertIdempotent(
        MonitoringExternalSliReceipt $existing,
        string $bodyHash,
        string $keyId,
    ): void {
        if (! hash_equals((string) $existing->body_sha256, $bodyHash)
            || ! hash_equals((string) $existing->signing_key_id, $keyId)) {
            throw new InvalidArgumentException(
                'External SLI probe ID was already used with different evidence.',
            );
        }
    }

    private function timestamp(mixed $value): CarbonImmutable
    {
        $value = is_string($value) ? trim($value) : '';
        if (strlen($value) > 64
            || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/', $value) !== 1) {
            throw new InvalidArgumentException('External SLI timestamp is invalid.');
        }

        try {
            return CarbonImmutable::parse($value)
                ->setTimezone((string) config('app.timezone', 'UTC'))
                ->setMicrosecond(0);
        } catch (\Throwable) {
            throw new InvalidArgumentException('External SLI timestamp is invalid.');
        }
    }

    private function origin(string $url): ?string
    {
        $parts = parse_url($url);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === '') {
            return null;
        }

        $port = isset($parts['port']) && (int) $parts['port'] !== 443
            ? ':'.(int) $parts['port']
            : '';

        return 'https://'.strtolower((string) $parts['host']).$port;
    }
}
