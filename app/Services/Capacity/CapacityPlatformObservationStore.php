<?php

namespace App\Services\Capacity;

use App\Models\CapacityPlatformObservation;
use App\Services\Monitoring\BackgroundQueueRegistry;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class CapacityPlatformObservationStore
{
    private const ENVELOPE_FIELDS = ['schema_version', 'key_id', 'payload', 'signature'];

    private const PAYLOAD_FIELDS = [
        'schema_version',
        'observation_id',
        'observed_at',
        'provider',
        'environment',
        'release',
        'infrastructure_profile',
        'targets',
    ];

    private const TARGET_FIELDS = [
        'kind',
        'state_token',
        'current_instances',
        'ready_instances',
        'cpu_utilization_percent',
        'memory_utilization_percent',
    ];

    public function __construct(
        private readonly CapacityEnvelopeSigner $signer,
        private readonly BackgroundQueueRegistry $queues,
        private readonly CapacityControlLease $lease,
    ) {}

    /** @param array<string, mixed> $envelope */
    public function record(array $envelope): CapacityPlatformObservation
    {
        $this->assertEnvelopeSize($envelope);
        $this->assertOnlyFields($envelope, self::ENVELOPE_FIELDS, 'envelope');
        if (($envelope['schema_version'] ?? null) !== 1 || ! is_array($envelope['payload'] ?? null)) {
            throw new InvalidArgumentException('Capacity observation envelope is malformed.');
        }

        $payload = $envelope['payload'];
        $keyId = $this->identifier($envelope['key_id'] ?? null, 'key_id', 32);
        $signature = strtolower($this->hex($envelope['signature'] ?? null, 'signature'));
        if (! $this->signer->verify('platform', $payload, $keyId, $signature)) {
            throw new InvalidArgumentException('Capacity platform observation signature is invalid.');
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
            'recorded_at' => now((string) config('app.timezone', 'UTC')),
        ];
        $attributes['observed_at'] = $this->databaseTime($validated['observed_at']);
        $attributes['expires_at'] = $this->databaseTime($validated['expires_at']);

        try {
            return $this->lease->run(fn (): CapacityPlatformObservation => DB::transaction(function () use ($attributes, $payloadHash): CapacityPlatformObservation {
                $existing = CapacityPlatformObservation::query()
                    ->where('observation_id', $attributes['observation_id'])
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    $this->assertIdempotent($existing, $payloadHash);

                    return $existing;
                }

                $latest = CapacityPlatformObservation::query()
                    ->where('provider', $attributes['provider'])
                    ->where('environment', $attributes['environment'])
                    ->where('release', $attributes['release'])
                    ->where('infrastructure_profile', $attributes['infrastructure_profile'])
                    ->orderByDesc('observed_at')
                    ->orderByDesc('id')
                    ->lockForUpdate()
                    ->first();
                $minimumSpacing = (int) config('capacity_planning.platform.minimum_observation_spacing_seconds', 15);
                if ($latest?->observed_at !== null
                    && ($attributes['observed_at']->lessThanOrEqualTo($latest->observed_at)
                        || $latest->observed_at->diffInSeconds($attributes['observed_at']) < $minimumSpacing)) {
                    throw new InvalidArgumentException('Capacity observations must advance monotonically at the configured minimum cadence.');
                }

                return CapacityPlatformObservation::query()->create($attributes);
            }, 3));
        } catch (QueryException $exception) {
            $existing = CapacityPlatformObservation::query()
                ->where('observation_id', $attributes['observation_id'])
                ->orWhere('payload_hash', $payloadHash)
                ->first();

            if ($existing === null) {
                throw $exception;
            }

            $this->assertIdempotent($existing, $payloadHash);

            return $existing;
        }
    }

    public function latestForCurrent(): ?CapacityPlatformObservation
    {
        $minimumPlanValidity = 30;
        $observation = $this->recentForCurrent(1)[0] ?? null;

        return $observation !== null
            && $observation->expires_at?->greaterThanOrEqualTo(
                now((string) config('app.timezone', 'UTC'))->addSeconds($minimumPlanValidity),
            ) === true
            ? $observation
            : null;
    }

    /**
     * Return only the bounded web inventory from a fresh, fully verified
     * provider observation. Callers never need to trust the stored payload
     * directly or duplicate its signature/freshness validation.
     *
     * @return array{current_instances:int,ready_instances:int}|null
     */
    public function latestWebInventory(): ?array
    {
        $observation = $this->latestForCurrent();
        $web = data_get((array) $observation?->payload, 'targets.web');

        if (! is_array($web)
            || ! is_int($web['current_instances'] ?? null)
            || ! is_int($web['ready_instances'] ?? null)) {
            return null;
        }

        return [
            'current_instances' => $web['current_instances'],
            'ready_instances' => $web['ready_instances'],
        ];
    }

    /** @return list<CapacityPlatformObservation> */
    public function recentForCurrent(int $limit): array
    {
        $limit = min(5, max(1, $limit));
        $observations = CapacityPlatformObservation::query()
            ->where('provider', (string) config('capacity_planning.platform.provider'))
            ->where('environment', (string) config('capacity_planning.environment'))
            ->where('release', (string) config('monitoring.release'))
            ->where('infrastructure_profile', (string) config('capacity_planning.infrastructure_profile'))
            ->orderByDesc('observed_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        if ($observations->contains(fn (CapacityPlatformObservation $observation): bool => ! $this->validStored($observation))) {
            return [];
        }

        return $observations->values()->all();
    }

    /** @return list<CapacityPlatformObservation> */
    public function continuousForCurrent(
        int $required,
        int $minimumSpacingSeconds,
        int $maximumSpacingSeconds,
    ): array {
        $required = min(5, max(2, $required));
        $minimumSpacingSeconds = min(60, max(5, $minimumSpacingSeconds));
        $maximumSpacingSeconds = min(300, max($minimumSpacingSeconds, $maximumSpacingSeconds));
        $observations = $this->recentForCurrent($required);

        if (count($observations) !== $required) {
            return [];
        }

        $ids = [];
        foreach ($observations as $index => $observation) {
            $id = (string) $observation->observation_id;
            $timestamp = $observation->observed_at?->getTimestamp();
            if ($id === '' || isset($ids[$id]) || ! is_int($timestamp)) {
                return [];
            }
            $ids[$id] = true;

            if ($index === 0) {
                continue;
            }

            $newerTimestamp = $observations[$index - 1]->observed_at?->getTimestamp();
            if (! is_int($newerTimestamp)
                || ($newerTimestamp - $timestamp) < $minimumSpacingSeconds
                || ($newerTimestamp - $timestamp) > $maximumSpacingSeconds) {
                return [];
            }
        }

        return $observations;
    }

    public function validStored(CapacityPlatformObservation $observation): bool
    {
        $payload = (array) $observation->payload;
        try {
            $expected = $this->validate($payload);
        } catch (\Throwable) {
            return false;
        }

        $clockSkew = (int) config('capacity_planning.platform.maximum_clock_skew_seconds', 30);
        $now = now((string) config('app.timezone', 'UTC'));

        return Str::isUuid((string) $observation->public_id)
            && hash_equals((string) $observation->payload_hash, $this->signer->hash($payload))
            && $this->signer->verify(
                'platform',
                $payload,
                (string) $observation->source_key_id,
                (string) $observation->getRawOriginal('source_signature'),
            )
            && hash_equals((string) $observation->observation_id, (string) $expected['observation_id'])
            && hash_equals((string) $observation->provider, (string) $expected['provider'])
            && hash_equals((string) $observation->environment, (string) $expected['environment'])
            && hash_equals((string) $observation->release, (string) $expected['release'])
            && hash_equals((string) $observation->infrastructure_profile, (string) $expected['infrastructure_profile'])
            && $observation->observed_at?->equalTo($expected['observed_at']) === true
            && $observation->expires_at?->equalTo($expected['expires_at']) === true
            && $observation->recorded_at !== null
            && $observation->recorded_at->greaterThanOrEqualTo(
                $expected['observed_at']->subSeconds($clockSkew),
            )
            && $observation->recorded_at->lessThan($expected['expires_at'])
            && $observation->recorded_at->lessThanOrEqualTo($now->addSeconds($clockSkew));
    }

    /** @return array<string, mixed> */
    private function validate(array $payload): array
    {
        $this->assertOnlyFields($payload, self::PAYLOAD_FIELDS, 'payload');
        if (($payload['schema_version'] ?? null) !== 2) {
            throw new InvalidArgumentException('Capacity observation schema version is unsupported.');
        }

        $observationId = is_string($payload['observation_id'] ?? null)
            ? trim($payload['observation_id'])
            : '';
        if (! Str::isUuid($observationId)) {
            throw new InvalidArgumentException('Capacity observation_id must be a UUID.');
        }

        $provider = strtolower($this->identifier($payload['provider'] ?? null, 'provider', 64));
        $environment = strtolower($this->identifier($payload['environment'] ?? null, 'environment', 32));
        $release = $this->identifier($payload['release'] ?? null, 'release', 128);
        $profile = $this->identifier($payload['infrastructure_profile'] ?? null, 'infrastructure_profile', 128);
        $expectedProvider = (string) config('capacity_planning.platform.provider');
        $expectedEnvironment = (string) config('capacity_planning.environment');
        $expectedRelease = (string) config('monitoring.release');
        $expectedProfile = (string) config('capacity_planning.infrastructure_profile');

        if ($provider !== $expectedProvider
            || $environment !== $expectedEnvironment
            || ! hash_equals($expectedRelease, $release)
            || ! hash_equals($expectedProfile, $profile)) {
            throw new InvalidArgumentException('Capacity observation does not match the active provider, environment, release, or infrastructure profile.');
        }

        $observedAt = $this->timestamp($payload['observed_at'] ?? null);
        $maxAge = (int) config('capacity_planning.platform.observation_max_age_seconds', 120);
        $clockSkew = (int) config('capacity_planning.platform.maximum_clock_skew_seconds', 30);
        if ($observedAt->greaterThan(now('UTC')->addSeconds($clockSkew))
            || $observedAt->lessThanOrEqualTo(now('UTC')->subSeconds($maxAge))) {
            throw new InvalidArgumentException('Capacity observation is stale or from the future.');
        }

        $targets = $payload['targets'] ?? null;
        if (! is_array($targets) || array_is_list($targets) || count($targets) > 64 || ! isset($targets['web'])) {
            throw new InvalidArgumentException('Capacity observation requires a bounded target map containing web.');
        }

        $expectedTargets = ['web', ...$this->queues->capacityTargetKeys()];
        $reportedTargets = array_keys($targets);
        $missingTargets = array_values(array_diff($expectedTargets, $reportedTargets));
        $unexpectedTargets = array_values(array_diff($reportedTargets, $expectedTargets));
        if ($missingTargets !== [] || $unexpectedTargets !== []) {
            throw new InvalidArgumentException(sprintf(
                'Capacity observation target coverage is invalid (missing: %s; unexpected: %s).',
                $missingTargets === [] ? 'none' : implode(',', $missingTargets),
                $unexpectedTargets === [] ? 'none' : implode(',', $unexpectedTargets),
            ));
        }

        foreach ($targets as $key => $target) {
            if (! is_string($key)
                || preg_match('/\A(?:web|queue:[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63})\z/', $key) !== 1
                || ! is_array($target)
                || array_is_list($target)) {
                throw new InvalidArgumentException('Capacity observation contains an invalid target.');
            }
            $this->assertOnlyFields($target, self::TARGET_FIELDS, 'target');

            $kind = $target['kind'] ?? null;
            if (($key === 'web' && $kind !== 'web') || ($key !== 'web' && $kind !== 'queue')) {
                throw new InvalidArgumentException("Capacity observation target [{$key}] has an invalid kind.");
            }
            if ($kind === 'queue') {
                $lane = substr($key, 6);
                if (config("background_jobs.worker_capacity.minimum.{$lane}") === null
                    || config("background_jobs.worker_capacity.maximum.{$lane}") === null) {
                    throw new InvalidArgumentException("Capacity observation target [{$key}] has no configured worker bounds.");
                }
            }

            $stateToken = $target['state_token'] ?? null;
            if (! is_string($stateToken) || preg_match('/\A[a-f0-9]{64}\z/', $stateToken) !== 1) {
                throw new InvalidArgumentException("Capacity observation target [{$key}] has an invalid state token.");
            }

            // Zero is a legitimate observed outage state. Rejecting it would
            // prevent the signed planner from restoring the configured floor.
            $current = $this->integer($target['current_instances'] ?? null, "targets.{$key}.current_instances", 0, 1_000);
            $ready = $this->integer($target['ready_instances'] ?? null, "targets.{$key}.ready_instances", 0, 1_000);
            if ($ready > $current) {
                throw new InvalidArgumentException("Capacity observation target [{$key}] reports more ready than current instances.");
            }

            foreach (['cpu_utilization_percent', 'memory_utilization_percent'] as $metric) {
                $value = $this->number($target[$metric] ?? null, "targets.{$key}.{$metric}", 0, 100);
                if (abs($value - round($value, 2)) > 0.0000001) {
                    throw new InvalidArgumentException(
                        "Capacity observation field [targets.{$key}.{$metric}] must use at most two decimal places.",
                    );
                }
            }
        }

        return [
            'observation_id' => $observationId,
            'provider' => $provider,
            'environment' => $environment,
            'release' => $release,
            'infrastructure_profile' => $profile,
            'observed_at' => $observedAt,
            'expires_at' => $observedAt->addSeconds($maxAge),
        ];
    }

    private function assertIdempotent(CapacityPlatformObservation $existing, string $payloadHash): void
    {
        if (! hash_equals((string) $existing->payload_hash, $payloadHash)
            || ! $this->validStored($existing)) {
            throw new InvalidArgumentException('The observation ID was reused with different platform state.');
        }
    }

    private function assertEnvelopeSize(array $envelope): void
    {
        if (strlen($this->signer->canonicalJson($envelope)) > (int) config('capacity_planning.platform.maximum_payload_bytes', 65_536)) {
            throw new InvalidArgumentException('Capacity observation exceeds the payload size limit.');
        }
    }

    /** @param list<string> $allowed */
    private function assertOnlyFields(array $value, array $allowed, string $context): void
    {
        if (array_diff(array_keys($value), $allowed) !== []) {
            throw new InvalidArgumentException("Capacity observation {$context} contains unsupported fields.");
        }
    }

    private function identifier(mixed $value, string $field, int $max): string
    {
        $value = is_string($value) ? trim($value) : '';
        if ($value === '' || strlen($value) > $max
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:\/+\-]{0,127}\z/', $value) !== 1) {
            throw new InvalidArgumentException("Capacity observation field [{$field}] is invalid.");
        }

        return $value;
    }

    private function hex(mixed $value, string $field): string
    {
        if (! is_string($value) || preg_match('/\A[a-fA-F0-9]{64}\z/', $value) !== 1) {
            throw new InvalidArgumentException("Capacity observation field [{$field}] is invalid.");
        }

        return $value;
    }

    private function timestamp(mixed $value): CarbonImmutable
    {
        $timestamp = CapacityTimestamp::parse($value);
        if ($timestamp === null) {
            throw new InvalidArgumentException('Capacity observation observed_at is invalid.');
        }

        return $timestamp;
    }

    private function integer(mixed $value, string $field, int $min, int $max): int
    {
        if (! is_int($value) || $value < $min || $value > $max) {
            throw new InvalidArgumentException("Capacity observation field [{$field}] is invalid.");
        }

        return $value;
    }

    private function number(mixed $value, string $field, float $min, float $max): float
    {
        if ((! is_int($value) && ! is_float($value))
            || ! is_finite((float) $value)
            || (float) $value < $min
            || (float) $value > $max) {
            throw new InvalidArgumentException("Capacity observation field [{$field}] is invalid.");
        }

        return (float) $value;
    }

    private function databaseTime(CarbonImmutable $value): CarbonImmutable
    {
        return $value->setTimezone((string) config('app.timezone', 'UTC'));
    }
}
