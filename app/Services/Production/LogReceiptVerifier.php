<?php

namespace App\Services\Production;

use Illuminate\Contracts\Config\Repository;
use InvalidArgumentException;

final class LogReceiptVerifier
{
    public function __construct(private readonly Repository $config) {}

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
    public function verify(array $payload, string $keyId, string $signature): bool
    {
        $key = $this->publicKey($keyId);
        $decoded = $this->decodeSignature($signature);

        return $key !== null
            && $decoded !== null
            && openssl_verify(
                $this->canonicalJson($payload),
                $decoded,
                $key,
                OPENSSL_ALGO_SHA256,
            ) === 1;
    }

    public function hasValidActiveKeyConfiguration(): bool
    {
        $keys = $this->config->get('observability.log_receipts.verification_keys', []);
        $active = $this->config->get('observability.log_receipts.active_key_ids', []);
        if (! is_array($keys)
            || $keys === []
            || count($keys) > 16
            || ! is_array($active)
            || ! array_is_list($active)
            || $active === []
            || count($active) > 8
            || count($active) !== count(array_unique($active, SORT_STRING))) {
            return false;
        }

        $fingerprints = [];
        foreach (array_keys($keys) as $keyId) {
            if (! is_string($keyId)) {
                return false;
            }
            $key = $this->publicKey($keyId);
            $details = $key === null ? false : openssl_pkey_get_details($key);
            $canonical = is_array($details) ? ($details['key'] ?? null) : null;
            if (! is_string($canonical)) {
                return false;
            }
            $fingerprint = hash('sha256', $canonical);
            if (isset($fingerprints[$fingerprint])) {
                return false;
            }
            $fingerprints[$fingerprint] = true;
        }

        return collect($active)->every(
            fn (mixed $keyId): bool => is_string($keyId)
                && $this->publicKey($keyId) !== null,
        );
    }

    public function isActiveKey(string $keyId): bool
    {
        return $this->hasValidActiveKeyConfiguration()
            && in_array(
                $keyId,
                (array) $this->config->get(
                    'observability.log_receipts.active_key_ids',
                    [],
                ),
                true,
            );
    }

    private function publicKey(string $keyId): ?\OpenSSLAsymmetricKey
    {
        if (! extension_loaded('openssl')
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $keyId) !== 1) {
            return null;
        }

        $keys = $this->config->get('observability.log_receipts.verification_keys', []);
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
        if (! $key instanceof \OpenSSLAsymmetricKey) {
            return null;
        }
        $details = openssl_pkey_get_details($key);
        $bits = is_array($details) ? (int) ($details['bits'] ?? 0) : 0;
        $type = is_array($details) ? ($details['type'] ?? null) : null;
        $ec = is_array($details) && is_array($details['ec'] ?? null)
            ? $details['ec']
            : [];
        $curve = strtolower((string) ($ec['curve_name'] ?? ''));
        $strong = ($type === OPENSSL_KEYTYPE_RSA && $bits >= 2_048)
            || ($type === OPENSSL_KEYTYPE_EC
                && $bits >= 256
                && in_array($curve, [
                    'prime256v1',
                    'secp256r1',
                    'secp384r1',
                    'secp521r1',
                ], true));

        return $strong ? $key : null;
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
        if ($depth > 12) {
            throw new InvalidArgumentException('Log receipt nesting exceeds the safety limit.');
        }
        if (is_array($value)) {
            if (count($value) > 32) {
                throw new InvalidArgumentException('Log receipt collection exceeds the safety limit.');
            }
            if (array_is_list($value)) {
                return array_map(
                    fn (mixed $item): mixed => $this->normalize($item, $depth + 1),
                    $value,
                );
            }
            foreach (array_keys($value) as $key) {
                if (! is_string($key)
                    || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}\z/', $key) !== 1) {
                    throw new InvalidArgumentException('Log receipt contains an invalid object key.');
                }
            }
            ksort($value, SORT_STRING);

            return array_map(
                fn (mixed $item): mixed => $this->normalize($item, $depth + 1),
                $value,
            );
        }
        if (is_string($value)) {
            if (strlen($value) > 4_096) {
                throw new InvalidArgumentException('Log receipt string exceeds the safety limit.');
            }

            return $value;
        }
        if (is_int($value) || is_bool($value) || $value === null) {
            return $value;
        }

        throw new InvalidArgumentException('Log receipt contains an unsupported value.');
    }
}
