<?php

namespace App\Services\Production;

use Illuminate\Contracts\Config\Repository;
use InvalidArgumentException;

final class DatabaseReplicationAttestationVerifier
{
    /** @var array<string, \OpenSSLAsymmetricKey|null> */
    private array $publicKeys = [];

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

        if ($key === null || $decoded === null) {
            return false;
        }

        return openssl_verify(
            $this->canonicalJson($payload),
            $decoded,
            $key,
            OPENSSL_ALGO_SHA256,
        ) === 1;
    }

    public function hasValidActiveKeyConfiguration(): bool
    {
        if (! $this->hasValidKeyringConfiguration()) {
            return false;
        }

        $keyIds = $this->config->get(
            'database_replication.attestation.active_key_ids',
            [],
        );
        if (! is_array($keyIds)
            || ! array_is_list($keyIds)
            || $keyIds === []
            || count($keyIds) > 8) {
            return false;
        }

        foreach ($keyIds as $keyId) {
            if (! is_string($keyId) || $this->publicKey($keyId) === null) {
                return false;
            }
        }

        return count($keyIds) === count(array_unique($keyIds, SORT_STRING));
    }

    public function hasValidKeyringConfiguration(): bool
    {
        $keys = $this->config->get(
            'database_replication.attestation.verification_keys',
            [],
        );
        if (! is_array($keys) || $keys === [] || count($keys) > 16) {
            return false;
        }

        $fingerprints = [];
        foreach (array_keys($keys) as $keyId) {
            if (! is_string($keyId)) {
                return false;
            }
            $key = $this->publicKey($keyId);
            if ($key === null) {
                return false;
            }
            $details = openssl_pkey_get_details($key);
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

        return true;
    }

    public function isActiveKey(string $keyId): bool
    {
        return $this->hasValidActiveKeyConfiguration()
            && in_array(
                $keyId,
                (array) $this->config->get(
                    'database_replication.attestation.active_key_ids',
                    [],
                ),
                true,
            );
    }

    private function publicKey(string $keyId): \OpenSSLAsymmetricKey|false|null
    {
        if (array_key_exists($keyId, $this->publicKeys)) {
            return $this->publicKeys[$keyId];
        }
        if (! extension_loaded('openssl')
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $keyId) !== 1) {
            return $this->publicKeys[$keyId] = null;
        }

        $keys = $this->config->get(
            'database_replication.attestation.verification_keys',
            [],
        );
        $configured = is_array($keys) ? ($keys[$keyId] ?? null) : null;
        if (! is_string($configured) || $configured === '' || strlen($configured) > 16_384) {
            return $this->publicKeys[$keyId] = null;
        }
        if (str_starts_with($configured, 'base64:')) {
            $configured = base64_decode(substr($configured, 7), true);
        }
        if (! is_string($configured)
            || str_contains($configured, 'PRIVATE KEY')
            || ! str_contains($configured, 'PUBLIC KEY')) {
            return $this->publicKeys[$keyId] = null;
        }

        $key = @openssl_pkey_get_public($configured);
        if ($key === false) {
            return $this->publicKeys[$keyId] = null;
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

        return $this->publicKeys[$keyId] = $strong ? $key : null;
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
            throw new InvalidArgumentException(
                'Database replication attestation exceeds the nesting limit.',
            );
        }
        if (is_array($value)) {
            if (count($value) > 64) {
                throw new InvalidArgumentException(
                    'Database replication attestation exceeds the collection limit.',
                );
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
                    throw new InvalidArgumentException(
                        'Database replication attestation contains an invalid object key.',
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
            if (strlen($value) > 65_536) {
                throw new InvalidArgumentException(
                    'Database replication attestation string exceeds the safety limit.',
                );
            }

            return $value;
        }
        if (is_int($value) || is_bool($value) || $value === null) {
            return $value;
        }

        throw new InvalidArgumentException(
            'Database replication attestation contains an unsupported value.',
        );
    }
}
