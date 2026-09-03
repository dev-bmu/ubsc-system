<?php

namespace App\Services\Capacity;

use App\Models\CapacityLoadEvidence;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class CapacityLoadEvidenceStore
{
    private const ENVELOPE_FIELDS = ['schema_version', 'key_id', 'payload', 'signature'];

    private const PAYLOAD_FIELDS = [
        'schema_version',
        'test_id',
        'generated_at',
        'profile',
        'capacity_scope',
        'environment',
        'release',
        'infrastructure_profile',
        'source_provider',
        'application_instances',
        'base_origin',
        'requested_start_rps',
        'requested_target_rps',
        'observed_requests_per_second',
        'p95_ms',
        'p99_ms',
        'error_rate_percent',
        'target_hold_seconds',
        'target_hold_requests_per_second',
        'target_hold_p95_ms',
        'target_hold_p99_ms',
        'target_hold_error_rate_percent',
        'dropped_iterations',
        'thresholds_passed',
        'reached_target',
        'qualifies_as_capacity_evidence',
        'tested_requests_per_second',
        'recommended_operational_rps',
        'operational_headroom_percent',
    ];

    public function __construct(
        private readonly CapacityEnvelopeSigner $signer,
        private readonly CapacityControlLease $lease,
    ) {}

    /**
     * @param  array<string, mixed>  $envelope
     */
    public function record(array $envelope): CapacityLoadEvidence
    {
        $this->assertEnvelopeSize($envelope);
        $payload = $this->payload($envelope);
        $keyId = $this->identifier($envelope['key_id'] ?? null, 'key_id', 32);
        $signature = strtolower($this->hex($envelope['signature'] ?? null, 'signature'));

        if (! $this->signer->verify('evidence', $payload, $keyId, $signature)) {
            throw new InvalidArgumentException('Capacity evidence signature is invalid.');
        }

        $validated = $this->validate($payload);
        $payloadHash = $this->signer->hash($payload);
        $attributes = [
            'public_id' => (string) Str::uuid(),
            ...$validated,
            'payload' => $payload,
            'payload_hash' => $payloadHash,
            'source_key_id' => $keyId,
            'source_signature' => $signature,
            'imported_at' => now((string) config('app.timezone', 'UTC')),
        ];
        $attributes['generated_at'] = $this->databaseTime($validated['generated_at']);
        $attributes['expires_at'] = $this->databaseTime($validated['expires_at']);

        try {
            return $this->lease->run(fn (): CapacityLoadEvidence => DB::transaction(function () use ($attributes, $payloadHash): CapacityLoadEvidence {
                $existing = CapacityLoadEvidence::query()
                    ->where('test_id', $attributes['test_id'])
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    $this->assertIdempotent($existing, $payloadHash);

                    return $existing;
                }

                return CapacityLoadEvidence::query()->create($attributes);
            }, 3));
        } catch (QueryException $exception) {
            $existing = CapacityLoadEvidence::query()
                ->where('test_id', $attributes['test_id'])
                ->orWhere('payload_hash', $payloadHash)
                ->first();

            if ($existing === null) {
                throw $exception;
            }

            $this->assertIdempotent($existing, $payloadHash);

            return $existing;
        }
    }

    public function latestForCurrent(string $scope = 'public_read'): ?CapacityLoadEvidence
    {
        $query = CapacityLoadEvidence::query()
            ->where('scope', $scope)
            ->where('environment', (string) config('capacity_planning.environment'))
            ->where('infrastructure_profile', (string) config('capacity_planning.infrastructure_profile'));

        if ((bool) config('capacity_planning.evidence.require_release_match', true)) {
            $query->where('release', (string) config('monitoring.release'));
        }

        $evidence = $query
            ->orderByDesc('generated_at')
            ->orderByDesc('id')
            ->first();

        return $evidence !== null
            && $this->validStored($evidence)
            && $evidence->expires_at?->greaterThanOrEqualTo(
                now((string) config('app.timezone', 'UTC'))->addSeconds(30),
            ) === true
            ? $evidence
            : null;
    }

    public function validStored(CapacityLoadEvidence $evidence): bool
    {
        $payload = (array) $evidence->payload;
        try {
            $expected = $this->validate($payload);
        } catch (\Throwable) {
            return false;
        }

        $clockSkew = (int) config('capacity_planning.platform.maximum_clock_skew_seconds', 30);
        $now = now((string) config('app.timezone', 'UTC'));

        return Str::isUuid((string) $evidence->public_id)
            && hash_equals((string) $evidence->payload_hash, $this->signer->hash($payload))
            && $this->signer->verify(
                'evidence',
                $payload,
                (string) $evidence->source_key_id,
                (string) $evidence->getRawOriginal('source_signature'),
            )
            && hash_equals((string) $evidence->test_id, (string) $expected['test_id'])
            && hash_equals((string) $evidence->scope, (string) $expected['scope'])
            && hash_equals((string) $evidence->environment, (string) $expected['environment'])
            && hash_equals((string) $evidence->release, (string) $expected['release'])
            && hash_equals((string) $evidence->infrastructure_profile, (string) $expected['infrastructure_profile'])
            && hash_equals((string) $evidence->source_provider, (string) $expected['source_provider'])
            && hash_equals((string) $evidence->base_origin_hash, (string) $expected['base_origin_hash'])
            && (int) $evidence->tested_instances === (int) $expected['tested_instances']
            && abs((float) $evidence->tested_requests_per_second - (float) $expected['tested_requests_per_second']) < 0.0001
            && abs((float) $evidence->operational_requests_per_second - (float) $expected['operational_requests_per_second']) < 0.0001
            && abs((float) $evidence->operational_requests_per_second_per_instance - (float) $expected['operational_requests_per_second_per_instance']) < 0.0001
            && (int) $evidence->p95_ms === (int) $expected['p95_ms']
            && (int) $evidence->p99_ms === (int) $expected['p99_ms']
            && abs((float) $evidence->error_rate_percent - (float) $expected['error_rate_percent']) < 0.0001
            && (int) $evidence->hold_seconds === (int) $expected['hold_seconds']
            && $evidence->generated_at?->equalTo($expected['generated_at']) === true
            && $evidence->expires_at?->equalTo($expected['expires_at']) === true
            && $evidence->imported_at !== null
            && $evidence->imported_at->greaterThanOrEqualTo(
                $expected['generated_at']->subSeconds($clockSkew),
            )
            && $evidence->imported_at->lessThan($expected['expires_at'])
            && $evidence->imported_at->lessThanOrEqualTo($now->addSeconds($clockSkew));
    }

    /** @return array<string, mixed> */
    private function payload(array $envelope): array
    {
        $this->assertOnlyFields($envelope, self::ENVELOPE_FIELDS, 'envelope');
        if (($envelope['schema_version'] ?? null) !== 1 || ! is_array($envelope['payload'] ?? null)) {
            throw new InvalidArgumentException('Capacity evidence envelope is malformed.');
        }

        return $envelope['payload'];
    }

    /** @return array<string, mixed> */
    private function validate(array $payload): array
    {
        $this->assertOnlyFields($payload, self::PAYLOAD_FIELDS, 'payload');
        $this->assertRequiredFields($payload, self::PAYLOAD_FIELDS, 'payload');
        if (($payload['schema_version'] ?? null) !== 3
            || ($payload['profile'] ?? null) !== 'capacity'
            || ($payload['qualifies_as_capacity_evidence'] ?? null) !== true
            || ($payload['thresholds_passed'] ?? null) !== true
            || ($payload['reached_target'] ?? null) !== true
            || $this->integer($payload['dropped_iterations'] ?? null, 'dropped_iterations', 0, 1_000_000) !== 0) {
            throw new InvalidArgumentException('Load evidence did not pass every required gate.');
        }

        $scope = $this->identifier($payload['capacity_scope'] ?? null, 'capacity_scope', 32);
        if (! is_array(config("performance.scopes.{$scope}"))) {
            throw new InvalidArgumentException('Capacity evidence scope is not configured.');
        }

        $testId = $this->identifier($payload['test_id'] ?? null, 'test_id', 100);
        $environment = strtolower($this->identifier($payload['environment'] ?? null, 'environment', 32));
        $release = $this->identifier($payload['release'] ?? null, 'release', 128);
        $profile = $this->identifier($payload['infrastructure_profile'] ?? null, 'infrastructure_profile', 128);
        $provider = strtolower($this->identifier($payload['source_provider'] ?? null, 'source_provider', 64));
        if (! hash_equals((string) config('capacity_planning.environment'), $environment)
            || ! hash_equals((string) config('capacity_planning.infrastructure_profile'), $profile)
            || ((bool) config('capacity_planning.evidence.require_release_match', true)
                && ! hash_equals((string) config('monitoring.release'), $release))) {
            throw new InvalidArgumentException('Capacity evidence does not match the active environment, release, or infrastructure profile.');
        }
        $origin = $this->httpsOrigin($payload['base_origin'] ?? null);
        $generatedAt = $this->timestamp($payload['generated_at'] ?? null, 'generated_at');
        $clockSkew = (int) config('capacity_planning.platform.maximum_clock_skew_seconds', 30);
        $maximumAge = (int) config('capacity_planning.evidence.maximum_age_days', 30);

        if ($generatedAt->greaterThan(now('UTC')->addSeconds($clockSkew))
            || $generatedAt->lessThanOrEqualTo(now('UTC')->subDays($maximumAge))) {
            throw new InvalidArgumentException('Capacity evidence is stale or from the future.');
        }

        $instances = $this->integer($payload['application_instances'] ?? null, 'application_instances', 1, 1_000);
        $expectedInstances = (int) config('capacity_planning.evidence.expected_application_instances', 0);
        if ($expectedInstances < 1 || $instances !== $expectedInstances) {
            throw new InvalidArgumentException('Capacity evidence instance count does not match the immutable infrastructure test profile.');
        }
        $requestedStart = $this->integer($payload['requested_start_rps'] ?? null, 'requested_start_rps', 1, 1_000_000);
        $requested = $this->integer($payload['requested_target_rps'] ?? null, 'requested_target_rps', 1, 1_000_000);
        $observedRps = $this->decimal($payload['observed_requests_per_second'] ?? null, 'observed_requests_per_second', 0.001, 1_000_000, 3);
        $aggregateP95 = $this->decimal($payload['p95_ms'] ?? null, 'p95_ms', 0.001, 300_000, 2);
        $aggregateP99 = $this->decimal($payload['p99_ms'] ?? null, 'p99_ms', 0.001, 300_000, 2);
        $aggregateErrorRate = $this->decimal($payload['error_rate_percent'] ?? null, 'error_rate_percent', 0, 100, 4);
        $holdRps = $this->decimal($payload['target_hold_requests_per_second'] ?? null, 'target_hold_requests_per_second', 1, 1_000_000, 3);
        $testedRps = $this->integer($payload['tested_requests_per_second'] ?? null, 'tested_requests_per_second', 1, 1_000_000);
        $operationalRps = $this->integer($payload['recommended_operational_rps'] ?? null, 'recommended_operational_rps', 1, 1_000_000);
        $holdSeconds = $this->integer($payload['target_hold_seconds'] ?? null, 'target_hold_seconds', 1, 86_400);
        $p95 = (int) ceil($this->decimal($payload['target_hold_p95_ms'] ?? null, 'target_hold_p95_ms', 0.001, 300_000, 2));
        $p99 = (int) ceil($this->decimal($payload['target_hold_p99_ms'] ?? null, 'target_hold_p99_ms', 0.001, 300_000, 2));
        $errorRate = $this->decimal($payload['target_hold_error_rate_percent'] ?? null, 'target_hold_error_rate_percent', 0, 100, 4);
        $headroom = (int) config('capacity_planning.evidence.operational_headroom_percent', 25);
        $declaredHeadroom = $this->integer($payload['operational_headroom_percent'] ?? null, 'operational_headroom_percent', 10, 60);
        $expectedOperational = max(1, (int) floor($testedRps * ((100 - $headroom) / 100)));
        $p95Limit = (int) config("performance.scopes.{$scope}.p95_target_ms", 0);
        $p99Limit = (int) config("performance.scopes.{$scope}.p99_target_ms", 0);

        if ($requestedStart > $requested
            || $aggregateP99 < $aggregateP95
            || $p99 < $p95
            || $holdSeconds < (int) config('capacity_planning.evidence.minimum_hold_seconds', 300)
            || $holdRps < $requested * 0.95
            || $testedRps > $requested
            || $testedRps > $holdRps
            || $declaredHeadroom !== $headroom
            || abs($operationalRps - $expectedOperational) > 0.0001
            || ($p95Limit > 0 && $p95 >= $p95Limit)
            || ($p99Limit > 0 && $p99 >= $p99Limit)
            || ($p95Limit > 0 && $aggregateP95 >= $p95Limit)
            || ($p99Limit > 0 && $aggregateP99 >= $p99Limit)
            || $aggregateErrorRate >= (float) config('capacity_planning.evidence.maximum_error_rate_percent', 1)
            || $errorRate >= (float) config('capacity_planning.evidence.maximum_error_rate_percent', 1)) {
            throw new InvalidArgumentException('Capacity evidence exceeds a latency, error, hold, or headroom safety limit.');
        }

        return [
            'test_id' => $testId,
            'scope' => $scope,
            'environment' => $environment,
            'release' => $release,
            'infrastructure_profile' => $profile,
            'source_provider' => $provider,
            'base_origin_hash' => hash('sha256', $origin),
            'tested_instances' => $instances,
            'tested_requests_per_second' => round($testedRps, 3),
            'operational_requests_per_second' => round($operationalRps, 3),
            'operational_requests_per_second_per_instance' => round($operationalRps / $instances, 3),
            'p95_ms' => $p95,
            'p99_ms' => $p99,
            'error_rate_percent' => round($errorRate, 4),
            'hold_seconds' => $holdSeconds,
            'generated_at' => $generatedAt,
            'expires_at' => $generatedAt->addDays($maximumAge),
        ];
    }

    private function assertIdempotent(CapacityLoadEvidence $existing, string $payloadHash): void
    {
        if (! hash_equals((string) $existing->payload_hash, $payloadHash)
            || ! $this->validStored($existing)) {
            throw new InvalidArgumentException('The capacity test ID was reused with different evidence.');
        }
    }

    private function assertEnvelopeSize(array $envelope): void
    {
        if (strlen($this->signer->canonicalJson($envelope)) > (int) config('capacity_planning.platform.maximum_payload_bytes', 65_536)) {
            throw new InvalidArgumentException('Capacity evidence exceeds the payload size limit.');
        }
    }

    /** @param list<string> $allowed */
    private function assertOnlyFields(array $value, array $allowed, string $context): void
    {
        if (array_diff(array_keys($value), $allowed) !== []) {
            throw new InvalidArgumentException("Capacity evidence {$context} contains unsupported fields.");
        }
    }

    /** @param list<string> $required */
    private function assertRequiredFields(array $value, array $required, string $context): void
    {
        if (array_diff($required, array_keys($value)) !== []) {
            throw new InvalidArgumentException("Capacity evidence {$context} is missing required fields.");
        }
    }

    private function timestamp(mixed $value, string $field): CarbonImmutable
    {
        $timestamp = CapacityTimestamp::parse($value);
        if ($timestamp === null) {
            throw new InvalidArgumentException("Capacity evidence field [{$field}] is invalid.");
        }

        return $timestamp;
    }

    private function identifier(mixed $value, string $field, int $max): string
    {
        $value = is_string($value) ? trim($value) : '';
        if ($value === '' || strlen($value) > $max
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:\/+\-]{0,127}\z/', $value) !== 1) {
            throw new InvalidArgumentException("Capacity evidence field [{$field}] is invalid.");
        }

        return $value;
    }

    private function hex(mixed $value, string $field): string
    {
        if (! is_string($value) || preg_match('/\A[a-fA-F0-9]{64}\z/', $value) !== 1) {
            throw new InvalidArgumentException("Capacity evidence field [{$field}] is invalid.");
        }

        return $value;
    }

    private function integer(mixed $value, string $field, int $min, int $max): int
    {
        if (! is_int($value) || $value < $min || $value > $max) {
            throw new InvalidArgumentException("Capacity evidence field [{$field}] is invalid.");
        }

        return $value;
    }

    private function number(mixed $value, string $field, float $min, float $max): float
    {
        if ((! is_int($value) && ! is_float($value))
            || ! is_finite((float) $value)
            || (float) $value < $min
            || (float) $value > $max) {
            throw new InvalidArgumentException("Capacity evidence field [{$field}] is invalid.");
        }

        return (float) $value;
    }

    private function decimal(
        mixed $value,
        string $field,
        float $min,
        float $max,
        int $places,
    ): float {
        $number = $this->number($value, $field, $min, $max);
        if (abs($number - round($number, $places)) > 0.0000001) {
            throw new InvalidArgumentException(
                "Capacity evidence field [{$field}] exceeds {$places} decimal places.",
            );
        }

        return $number;
    }

    private function httpsOrigin(mixed $value): string
    {
        if (! is_string($value) || strlen($value) > 512) {
            throw new InvalidArgumentException('Capacity evidence base_origin is invalid.');
        }

        $parts = parse_url($value);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || ! in_array((string) ($parts['path'] ?? ''), ['', '/'], true)
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new InvalidArgumentException('Capacity evidence requires a credential-free HTTPS origin.');
        }

        return strtolower($value);
    }

    private function databaseTime(CarbonImmutable $value): CarbonImmutable
    {
        return $value->setTimezone((string) config('app.timezone', 'UTC'));
    }
}
