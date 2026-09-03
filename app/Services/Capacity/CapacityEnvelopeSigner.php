<?php

namespace App\Services\Capacity;

use InvalidArgumentException;
use RuntimeException;

final class CapacityEnvelopeSigner
{
    /** @param array<string, mixed> $payload */
    public function canonicalJson(array $payload): string
    {
        return json_encode(
            $this->normalize($payload, 0),
            JSON_UNESCAPED_SLASHES
                | JSON_UNESCAPED_UNICODE
                | JSON_THROW_ON_ERROR,
        );
    }

    /** @param array<string, mixed> $payload */
    public function hash(array $payload): string
    {
        return hash('sha256', $this->canonicalJson($payload));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{key_id:string,signature:string}
     */
    public function sign(string $purpose, array $payload): array
    {
        $keyId = trim((string) config("capacity_planning.{$purpose}.active_key_id", ''));
        $key = $this->key($purpose, $keyId);

        if ($keyId === '' || $key === null) {
            throw new RuntimeException("A valid active capacity {$purpose} signing key is required.");
        }

        return [
            'key_id' => $keyId,
            'signature' => hash_hmac('sha256', $this->canonicalJson($payload), $key),
        ];
    }

    /** @param array<string, mixed> $payload */
    public function verify(
        string $purpose,
        array $payload,
        string $keyId,
        string $signature,
    ): bool {
        $key = $this->key($purpose, $keyId);

        return $key !== null
            && preg_match('/\A[a-f0-9]{64}\z/', $signature) === 1
            && hash_equals(
                hash_hmac('sha256', $this->canonicalJson($payload), $key),
                strtolower($signature),
            );
    }

    public function hasActiveKey(string $purpose): bool
    {
        $keyId = trim((string) config("capacity_planning.{$purpose}.active_key_id", ''));

        return $keyId !== '' && $this->key($purpose, $keyId) !== null;
    }

    public function hasAnyKey(string $purpose): bool
    {
        foreach (array_keys((array) config("capacity_planning.{$purpose}.signing_keys", [])) as $keyId) {
            if (is_string($keyId) && $this->key($purpose, $keyId) !== null) {
                return true;
            }
        }

        return false;
    }

    private function key(string $purpose, string $keyId): ?string
    {
        if (! in_array($purpose, ['platform', 'evidence', 'plan'], true)
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $keyId) !== 1) {
            return null;
        }

        $keys = (array) config("capacity_planning.{$purpose}.signing_keys", []);
        $configured = $keys[$keyId] ?? null;
        if (! is_string($configured) || $configured === '') {
            return null;
        }

        $key = match (true) {
            str_starts_with($configured, 'base64:') => $this->decodeBase64(substr($configured, 7)),
            str_starts_with($configured, 'hex:') => preg_match('/\A(?:[a-fA-F0-9]{2})+\z/', substr($configured, 4)) === 1
                ? hex2bin(substr($configured, 4))
                : false,
            default => $configured,
        };

        return is_string($key) && strlen($key) >= 32 && strlen($key) <= 4_096
            ? $key
            : null;
    }

    private function decodeBase64(string $encoded): string|false
    {
        if ($encoded === ''
            || strlen($encoded) % 4 !== 0
            || preg_match('/\A(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?\z/', $encoded) !== 1) {
            return false;
        }

        return base64_decode($encoded, true);
    }

    private function normalize(mixed $value, int $depth): mixed
    {
        if ($depth > 20) {
            throw new InvalidArgumentException('Capacity payload nesting exceeds the safety limit.');
        }

        if (is_array($value)) {
            if (array_is_list($value)) {
                return array_map(fn (mixed $item): mixed => $this->normalize($item, $depth + 1), $value);
            }

            foreach (array_keys($value) as $key) {
                if (! is_string($key)
                    || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}\z/', $key) !== 1) {
                    throw new InvalidArgumentException('Capacity payload contains an invalid object key.');
                }
            }

            ksort($value, SORT_STRING);

            return array_map(fn (mixed $item): mixed => $this->normalize($item, $depth + 1), $value);
        }

        if (is_string($value) || is_int($value) || is_bool($value) || $value === null) {
            return $value;
        }

        if (is_float($value) && is_finite($value)) {
            return $value;
        }

        throw new InvalidArgumentException('Capacity payload contains an unsupported value.');
    }
}
