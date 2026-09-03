<?php

namespace App\Services\DataGovernance;

use App\Models\ServiceAuditEvent;
use App\Models\User;
use App\Support\AdminAccess;
use DateTimeInterface;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;

final class ServiceAuditLogger
{
    private const SENSITIVE_KEY_PATTERN = '/(?:password|secret|token|credential|session|cookie|email|phone|whatsapp|address|identity_number|customer_name)/i';

    /**
     * @param  array<string, mixed>  $metadata
     */
    public function record(
        string $subjectType,
        int $subjectId,
        string $action,
        ?string $fromState = null,
        ?string $toState = null,
        array $metadata = [],
        ?User $actor = null,
        ?string $actorType = null,
        ?string $source = null,
        ?string $reasonCode = null,
        ?string $correlationId = null,
        ?string $deduplicationKey = null,
    ): ServiceAuditEvent {
        if ($subjectId < 1) {
            throw new RuntimeException('Audit subjects must have a persisted positive identifier.');
        }

        $subjectType = $this->boundedIdentifier($subjectType, 32, 'subject type');
        $action = $this->boundedIdentifier($action, 64, 'action');
        $actor ??= auth()->user();
        $actorType ??= $this->actorType($actor);
        $source ??= $this->source();
        $metadata = $this->sanitizeMetadata($metadata);
        // SQL timestamp precision varies between supported databases. Hash a
        // second-precise value so a round-trip through MariaDB, PostgreSQL, or
        // SQLite cannot change the signed representation.
        $now = now()->startOfSecond();
        $publicId = (string) Str::uuid7();
        $keyVersion = max(1, (int) config('data_audit.current_key_version', 1));
        $storedAt = $now->format('Y-m-d H:i:s');
        $payload = [
            'public_id' => $publicId,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'action' => $action,
            'from_state' => $this->nullableBoundedIdentifier($fromState, 32, 'from state'),
            'to_state' => $this->nullableBoundedIdentifier($toState, 32, 'to state'),
            'actor_type' => $this->boundedIdentifier($actorType, 24, 'actor type'),
            'actor_id' => $actor?->id,
            'source' => $this->boundedIdentifier($source, 96, 'source'),
            'reason_code' => $this->nullableBoundedIdentifier($reasonCode, 64, 'reason code'),
            'correlation_id' => $this->nullableUuid($correlationId),
            'deduplication_key' => $this->nullableHash($deduplicationKey),
            'integrity_key_version' => $keyVersion,
            'metadata' => $metadata,
            'occurred_at' => $storedAt,
            'created_at' => $storedAt,
        ];

        return ServiceAuditEvent::query()->create([
            ...$payload,
            'payload_hash' => $this->hash($payload, $keyVersion),
        ]);
    }

    public function verify(ServiceAuditEvent $event): bool
    {
        $payload = Arr::only($event->getAttributes(), [
            'public_id',
            'subject_type',
            'subject_id',
            'action',
            'from_state',
            'to_state',
            'actor_type',
            'actor_id',
            'source',
            'reason_code',
            'correlation_id',
            'deduplication_key',
            'integrity_key_version',
            'metadata',
            'occurred_at',
            'created_at',
        ]);
        $payload['subject_id'] = (int) $payload['subject_id'];
        $payload['actor_id'] = $payload['actor_id'] === null ? null : (int) $payload['actor_id'];
        $payload['integrity_key_version'] = (int) $payload['integrity_key_version'];
        $payload['metadata'] = is_string($payload['metadata'])
            ? json_decode($payload['metadata'], true, flags: JSON_THROW_ON_ERROR)
            : ($payload['metadata'] ?? []);
        $payload['occurred_at'] = $event->getRawOriginal('occurred_at');
        $payload['created_at'] = $event->getRawOriginal('created_at');

        return hash_equals(
            (string) $event->payload_hash,
            $this->hash($payload, (int) $event->integrity_key_version),
        );
    }

    /** @param array<string, mixed> $payload */
    private function hash(array $payload, int $keyVersion): string
    {
        $key = config("data_audit.integrity_keys.{$keyVersion}");

        if (! is_string($key) || trim($key) === '') {
            throw new RuntimeException("Audit integrity key version [{$keyVersion}] is not configured.");
        }

        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), true);

            if ($decoded === false || $decoded === '') {
                throw new RuntimeException("Audit integrity key version [{$keyVersion}] is invalid.");
            }

            $key = $decoded;
        }

        return hash_hmac('sha256', $this->canonicalJson($payload), $key);
    }

    /** @param array<string, mixed> $metadata */
    private function sanitizeMetadata(array $metadata): array
    {
        $sanitized = $this->sanitizeValue($metadata, 0);
        $encoded = $this->canonicalJson($sanitized);
        $limit = max(1024, (int) config('data_audit.metadata_max_bytes', 8192));

        if (strlen($encoded) > $limit) {
            throw new RuntimeException('Audit metadata exceeds the configured size limit.');
        }

        return $sanitized;
    }

    private function sanitizeValue(mixed $value, int $depth): mixed
    {
        if ($depth > 5) {
            throw new RuntimeException('Audit metadata nesting is too deep.');
        }

        if ($value instanceof DateTimeInterface) {
            return $value->format(DATE_ATOM);
        }

        if (is_array($value)) {
            $result = [];

            foreach (array_slice($value, 0, 100, true) as $key => $item) {
                $key = (string) $key;

                if (preg_match(self::SENSITIVE_KEY_PATTERN, $key) === 1) {
                    throw new RuntimeException("Sensitive audit metadata key [{$key}] is not allowed.");
                }

                $result[$key] = $this->sanitizeValue($item, $depth + 1);
            }

            return $result;
        }

        if (is_string($value)) {
            return Str::limit($value, 256, '');
        }

        if (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
            return $value;
        }

        throw new RuntimeException('Audit metadata contains an unsupported value.');
    }

    /** @param array<string, mixed> $value */
    private function canonicalJson(array $value): string
    {
        $value = $this->sortRecursively($value);

        try {
            return json_encode(
                $value,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            );
        } catch (JsonException $exception) {
            throw new RuntimeException('Audit payload cannot be encoded.', previous: $exception);
        }
    }

    private function sortRecursively(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (! array_is_list($value)) {
            ksort($value, SORT_STRING);
        }

        foreach ($value as $key => $item) {
            $value[$key] = $this->sortRecursively($item);
        }

        return $value;
    }

    private function actorType(?User $actor): string
    {
        if ($actor === null) {
            return 'system';
        }

        return AdminAccess::allows($actor) ? 'admin' : 'user';
    }

    private function source(): string
    {
        if (app()->runningInConsole()) {
            return 'system:console';
        }

        $route = request()->route()?->getName();

        return is_string($route) && $route !== ''
            ? 'http:'.$route
            : 'http:unrouted';
    }

    private function boundedIdentifier(string $value, int $limit, string $label): string
    {
        $value = trim($value);

        if ($value === '' || mb_strlen($value) > $limit) {
            throw new RuntimeException("Audit {$label} is invalid.");
        }

        return $value;
    }

    private function nullableBoundedIdentifier(?string $value, int $limit, string $label): ?string
    {
        return $value === null ? null : $this->boundedIdentifier($value, $limit, $label);
    }

    private function nullableUuid(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (! Str::isUuid($value)) {
            throw new RuntimeException('Audit correlation ID must be a UUID.');
        }

        return strtolower($value);
    }

    private function nullableHash(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = strtolower(trim($value));

        if (preg_match('/\A[a-f0-9]{64}\z/', $value) !== 1) {
            throw new RuntimeException('Audit deduplication key must be a SHA-256 digest.');
        }

        return $value;
    }
}
