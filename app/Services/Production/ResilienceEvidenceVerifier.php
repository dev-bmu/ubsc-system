<?php

namespace App\Services\Production;

use InvalidArgumentException;

final class ResilienceEvidenceVerifier
{
    /** @param array<string, mixed> $payload */
    public function canonicalJson(array $payload): string
    {
        return json_encode(
            $this->normalize($payload, 0),
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        );
    }

    /** @param array<string, mixed> $payload */
    public function hash(array $payload): string
    {
        return hash('sha256', $this->canonicalJson($payload));
    }

    /** @param array<string, mixed> $payload */
    public function verify(
        array $payload,
        string $keyId,
        string $signature,
    ): bool {
        $key = $this->publicKey($keyId);
        $decoded = $this->decodeSignature($signature);

        if ($key === null || $decoded === null) {
            return false;
        }

        try {
            return openssl_verify(
                $this->canonicalJson($payload),
                $decoded,
                $key,
                OPENSSL_ALGO_SHA256,
            ) === 1;
        } finally {
            openssl_free_key($key);
        }
    }

    public function hasAnyKey(): bool
    {
        $keys = config('resilience_drills.evidence.verification_keys', []);
        if (! is_array($keys)) {
            return false;
        }

        foreach (array_keys($keys) as $keyId) {
            if (! is_string($keyId)) {
                continue;
            }
            $key = $this->publicKey($keyId);
            if ($key !== null) {
                openssl_free_key($key);

                return true;
            }
        }

        return false;
    }

    public function hasValidActiveKeyConfiguration(): bool
    {
        $keyIds = config('resilience_drills.evidence.active_key_ids', []);
        if (! is_array($keyIds)
            || ! array_is_list($keyIds)
            || $keyIds === []
            || count($keyIds) > 8
            || count($keyIds) !== count(array_unique($keyIds, SORT_STRING))) {
            return false;
        }

        foreach ($keyIds as $keyId) {
            if (! is_string($keyId)) {
                return false;
            }
            $key = $this->publicKey($keyId);
            if ($key === null) {
                return false;
            }
            openssl_free_key($key);
        }

        return true;
    }

    public function isActiveKey(string $keyId): bool
    {
        if (! $this->hasValidActiveKeyConfiguration()) {
            return false;
        }

        return in_array(
            $keyId,
            (array) config('resilience_drills.evidence.active_key_ids', []),
            true,
        );
    }

    private function publicKey(string $keyId): \OpenSSLAsymmetricKey|false|null
    {
        if (! extension_loaded('openssl')
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $keyId) !== 1) {
            return null;
        }

        $keys = config('resilience_drills.evidence.verification_keys', []);
        $configured = is_array($keys) ? ($keys[$keyId] ?? null) : null;
        if (! is_string($configured) || $configured === '' || strlen($configured) > 16_384) {
            return null;
        }

        if (str_starts_with($configured, 'base64:')) {
            $configured = base64_decode(substr($configured, 7), true);
        }
        if (! is_string($configured)
            || str_contains($configured, 'PRIVATE KEY')
            || ! str_contains($configured, 'PUBLIC KEY')) {
            return null;
        }

        $key = @openssl_pkey_get_public($configured);
        if ($key === false) {
            return null;
        }

        $details = openssl_pkey_get_details($key);
        $bits = is_array($details) ? (int) ($details['bits'] ?? 0) : 0;
        $type = is_array($details) ? ($details['type'] ?? null) : null;
        $strong = ($type === OPENSSL_KEYTYPE_RSA && $bits >= 2_048)
            || ($type === OPENSSL_KEYTYPE_EC && $bits >= 256);
        if (! $strong) {
            openssl_free_key($key);

            return null;
        }

        return $key;
    }

    private function decodeSignature(string $signature): ?string
    {
        if ($signature === ''
            || strlen($signature) > 2_048
            || strlen($signature) % 4 !== 0
            || preg_match('/\A(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?\z/', $signature) !== 1) {
            return null;
        }

        $decoded = base64_decode($signature, true);

        return is_string($decoded) && $decoded !== '' ? $decoded : null;
    }

    private function normalize(mixed $value, int $depth): mixed
    {
        if ($depth > 16) {
            throw new InvalidArgumentException('Resilience evidence nesting exceeds the safety limit.');
        }

        if (is_array($value)) {
            if (array_is_list($value)) {
                if (count($value) > 64) {
                    throw new InvalidArgumentException('Resilience evidence list exceeds the safety limit.');
                }

                return array_map(
                    fn (mixed $item): mixed => $this->normalize($item, $depth + 1),
                    $value,
                );
            }

            if (count($value) > 64) {
                throw new InvalidArgumentException('Resilience evidence object exceeds the safety limit.');
            }
            foreach (array_keys($value) as $key) {
                if (! is_string($key)
                    || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}\z/', $key) !== 1) {
                    throw new InvalidArgumentException(
                        'Resilience evidence contains an invalid object key.',
                    );
                }
            }
            ksort($value, SORT_STRING);

            return array_map(
                fn (mixed $item): mixed => $this->normalize($item, $depth + 1),
                $value,
            );
        }

        if (is_string($value)) {
            if (strlen($value) > 131_072) {
                throw new InvalidArgumentException(
                    'Resilience evidence string exceeds the safety limit.',
                );
            }

            return $value;
        }
        if (is_int($value) || is_bool($value) || $value === null) {
            return $value;
        }

        throw new InvalidArgumentException('Resilience evidence contains an unsupported value.');
    }
}
