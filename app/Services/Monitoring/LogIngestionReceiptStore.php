<?php

namespace App\Services\Monitoring;

use App\Models\MonitoringLogReceipt;
use App\Services\Production\LogReceiptVerifier;
use App\Support\StrictRfc3339Timestamp;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

final class LogIngestionReceiptStore
{
    private const ENVELOPE_FIELDS = ['schema_version', 'key_id', 'payload', 'signature'];

    private const PAYLOAD_FIELDS = [
        'schema_version',
        'receipt_id',
        'operation_id',
        'event',
        'provider',
        'environment',
        'release',
        'ingested_at',
        'retention_until',
        'source_event_sha256',
    ];

    public function __construct(private readonly LogReceiptVerifier $verifier) {}

    /** @return array{receipt:MonitoringLogReceipt,duplicate:bool} */
    public function ingest(string $rawEnvelope): array
    {
        if (! (bool) config('observability.log_receipts.enabled', false)) {
            throw new InvalidArgumentException('Log receipt ingestion is disabled.');
        }

        $maximumBytes = (int) config(
            'observability.log_receipts.maximum_envelope_bytes',
            32_768,
        );
        if ($rawEnvelope === '' || strlen($rawEnvelope) > $maximumBytes) {
            throw new InvalidArgumentException('Log receipt envelope has an invalid size.');
        }

        try {
            $envelope = json_decode($rawEnvelope, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new InvalidArgumentException('Log receipt envelope is not valid JSON.');
        }
        if (! is_array($envelope) || array_is_list($envelope)) {
            throw new InvalidArgumentException('Log receipt envelope must be one object.');
        }
        $this->assertExactFields($envelope, self::ENVELOPE_FIELDS, 'envelope');
        if (($envelope['schema_version'] ?? null) !== 1
            || ! is_array($envelope['payload'] ?? null)
            || array_is_list($envelope['payload'])) {
            throw new InvalidArgumentException('Log receipt envelope is unsupported.');
        }

        $payload = $envelope['payload'];
        $keyId = $this->identifier($envelope['key_id'] ?? null, 'key_id', 32);
        $signature = is_string($envelope['signature'] ?? null)
            ? $envelope['signature']
            : '';
        if (! $this->verifier->isActiveKey($keyId)
            || ! $this->verifier->verify($payload, $keyId, $signature)) {
            throw new InvalidArgumentException('Log receipt signature is invalid or inactive.');
        }

        $validated = $this->validatePayload($payload, true);
        $payloadHash = $this->verifier->hash($payload);
        $attributes = [
            ...$validated,
            'source_key_id' => $keyId,
            'payload' => $payload,
            'payload_hash' => $payloadHash,
            'source_signature' => $signature,
            'recorded_at' => now('UTC')->toImmutable()->setMicrosecond(0),
        ];

        try {
            return DB::transaction(function () use ($attributes, $payloadHash): array {
                $existing = MonitoringLogReceipt::query()
                    ->where('receipt_id', $attributes['receipt_id'])
                    ->orWhere('operation_id', $attributes['operation_id'])
                    ->lockForUpdate()
                    ->first();
                if ($existing !== null) {
                    $this->assertIdempotent($existing, $payloadHash);

                    return ['receipt' => $existing, 'duplicate' => true];
                }

                return [
                    'receipt' => MonitoringLogReceipt::query()->create($attributes),
                    'duplicate' => false,
                ];
            }, 3);
        } catch (QueryException $exception) {
            $existing = MonitoringLogReceipt::query()
                ->where('receipt_id', $attributes['receipt_id'])
                ->orWhere('operation_id', $attributes['operation_id'])
                ->first();
            if ($existing === null) {
                throw $exception;
            }
            $this->assertIdempotent($existing, $payloadHash);

            return ['receipt' => $existing, 'duplicate' => true];
        }
    }

    public function forOperation(string $operationId): ?MonitoringLogReceipt
    {
        if (! (bool) config('observability.log_receipts.enabled', false)) {
            return null;
        }

        $receipt = MonitoringLogReceipt::query()
            ->where('operation_id', $operationId)
            ->first();

        return $this->validatedCurrent($receipt);
    }

    public function latestForCurrentRelease(): ?MonitoringLogReceipt
    {
        $receipt = MonitoringLogReceipt::query()
            ->where('provider', (string) config('observability.log_receipts.provider'))
            ->where('environment', strtolower((string) config('app.env')))
            ->where('release', (string) config('monitoring.release'))
            ->orderByDesc('ingested_at')
            ->orderByDesc('id')
            ->first();

        if ($receipt !== null && ! $this->validStored($receipt)) {
            throw new RuntimeException('Stored log-ingestion receipt integrity validation failed.');
        }

        return $receipt;
    }

    public function validStored(MonitoringLogReceipt $receipt): bool
    {
        $payload = is_array($receipt->payload) ? $receipt->payload : [];
        try {
            $expected = $this->validatePayload($payload, false);
        } catch (\Throwable) {
            return false;
        }

        $recordedAt = $receipt->recorded_at;
        $clockSkew = (int) config(
            'observability.log_receipts.maximum_clock_skew_seconds',
            120,
        );

        return hash_equals((string) $receipt->payload_hash, $this->verifier->hash($payload))
            && $this->verifier->verify(
                $payload,
                (string) $receipt->source_key_id,
                (string) $receipt->getRawOriginal('source_signature'),
            )
            && hash_equals((string) $receipt->receipt_id, $expected['receipt_id'])
            && hash_equals((string) $receipt->operation_id, $expected['operation_id'])
            && hash_equals((string) $receipt->provider, $expected['provider'])
            && hash_equals((string) $receipt->environment, $expected['environment'])
            && hash_equals((string) $receipt->release, $expected['release'])
            && hash_equals(
                (string) $receipt->source_event_sha256,
                $expected['source_event_sha256'],
            )
            && $receipt->ingested_at?->equalTo($expected['ingested_at']) === true
            && $receipt->retention_until?->equalTo($expected['retention_until']) === true
            && $recordedAt !== null
            && $recordedAt->greaterThanOrEqualTo(
                $expected['ingested_at']->subSeconds($clockSkew),
            )
            && $recordedAt->lessThanOrEqualTo(now('UTC')->addSeconds($clockSkew));
    }

    private function validatedCurrent(
        ?MonitoringLogReceipt $receipt,
    ): ?MonitoringLogReceipt {
        if ($receipt === null) {
            return null;
        }
        if (! $this->validStored($receipt)) {
            throw new RuntimeException('Stored log-ingestion receipt integrity validation failed.');
        }

        $maximumAge = (int) config(
            'observability.log_receipts.maximum_age_seconds',
            600,
        );
        if ($receipt->ingested_at === null
            || $receipt->ingested_at->lessThanOrEqualTo(now('UTC')->subSeconds($maximumAge))
            || $receipt->retention_until?->lessThanOrEqualTo(now('UTC')) !== false) {
            return null;
        }

        return $receipt;
    }

    /** @return array<string, mixed> */
    private function validatePayload(array $payload, bool $fresh): array
    {
        $this->assertExactFields($payload, self::PAYLOAD_FIELDS, 'payload');
        if (($payload['schema_version'] ?? null) !== 1
            || ($payload['event'] ?? null) !== 'observability.canary') {
            throw new InvalidArgumentException('Log receipt payload is unsupported.');
        }

        $receiptId = is_string($payload['receipt_id'] ?? null)
            ? strtolower(trim($payload['receipt_id']))
            : '';
        if (! Str::isUuid($receiptId)) {
            throw new InvalidArgumentException('Log receipt ID must be a UUID.');
        }
        $operationId = $this->identifier(
            $payload['operation_id'] ?? null,
            'operation_id',
            100,
        );
        $provider = strtolower($this->identifier(
            $payload['provider'] ?? null,
            'provider',
            64,
        ));
        $environment = strtolower($this->identifier(
            $payload['environment'] ?? null,
            'environment',
            32,
        ));
        $release = $this->identifier($payload['release'] ?? null, 'release', 128);
        if (! hash_equals(
            (string) config('observability.log_receipts.provider'),
            $provider,
        ) || ! hash_equals(strtolower((string) config('app.env')), $environment)
            || ! hash_equals((string) config('monitoring.release'), $release)) {
            throw new InvalidArgumentException('Log receipt target identity is invalid.');
        }

        $ingestedAt = StrictRfc3339Timestamp::parse($payload['ingested_at'] ?? null);
        $retentionUntil = StrictRfc3339Timestamp::parse(
            $payload['retention_until'] ?? null,
        );
        if ($ingestedAt === null || $retentionUntil === null) {
            throw new InvalidArgumentException('Log receipt timestamps are invalid.');
        }
        $minimumRetention = (int) config(
            'observability.log_receipts.minimum_retention_days',
            90,
        );
        if ($retentionUntil->lessThan($ingestedAt->addDays($minimumRetention))
            || $retentionUntil->greaterThan($ingestedAt->addDays(3_650))) {
            throw new InvalidArgumentException('Log receipt retention is outside policy.');
        }
        if ($fresh) {
            $maximumAge = (int) config(
                'observability.log_receipts.maximum_age_seconds',
                600,
            );
            $clockSkew = (int) config(
                'observability.log_receipts.maximum_clock_skew_seconds',
                120,
            );
            if ($ingestedAt->lessThanOrEqualTo(now('UTC')->subSeconds($maximumAge))
                || $ingestedAt->greaterThan(now('UTC')->addSeconds($clockSkew))) {
                throw new InvalidArgumentException('Log receipt is stale or from the future.');
            }
        }

        $sourceHash = is_string($payload['source_event_sha256'] ?? null)
            ? strtolower($payload['source_event_sha256'])
            : '';
        if (preg_match('/\A[a-f0-9]{64}\z/', $sourceHash) !== 1) {
            throw new InvalidArgumentException('Log receipt source hash is invalid.');
        }

        return [
            'receipt_id' => $receiptId,
            'operation_id' => $operationId,
            'provider' => $provider,
            'environment' => $environment,
            'release' => $release,
            'source_event_sha256' => $sourceHash,
            'ingested_at' => $ingestedAt,
            'retention_until' => $retentionUntil,
        ];
    }

    private function assertIdempotent(
        MonitoringLogReceipt $existing,
        string $payloadHash,
    ): void {
        if (! hash_equals((string) $existing->payload_hash, $payloadHash)
            || ! $this->validStored($existing)) {
            throw new InvalidArgumentException(
                'The log receipt identity was reused with different evidence.',
            );
        }
    }

    /** @param list<string> $expected */
    private function assertExactFields(array $value, array $expected, string $context): void
    {
        if (count($value) !== count($expected)
            || array_diff(array_keys($value), $expected) !== []
            || array_diff($expected, array_keys($value)) !== []) {
            throw new InvalidArgumentException("Log receipt {$context} fields are invalid.");
        }
    }

    private function identifier(mixed $value, string $field, int $maximum): string
    {
        $value = is_string($value) ? trim($value) : '';
        if ($value === ''
            || strlen($value) > $maximum
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:\/+\-]{0,127}\z/', $value) !== 1) {
            throw new InvalidArgumentException("Log receipt field [{$field}] is invalid.");
        }

        return $value;
    }
}
