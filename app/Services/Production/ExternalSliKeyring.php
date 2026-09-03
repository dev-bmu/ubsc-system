<?php

namespace App\Services\Production;

use Illuminate\Contracts\Config\Repository;

final class ExternalSliKeyring
{
    public function __construct(private readonly Repository $config) {}

    public function key(string $id): ?string
    {
        if (preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/', $id) !== 1) {
            return null;
        }

        $keys = $this->config->get('observability.external_sli.signing_keys', []);
        $encoded = is_array($keys) ? ($keys[$id] ?? null) : null;
        if (! is_string($encoded) || $encoded === '') {
            return null;
        }

        $decoded = str_starts_with($encoded, 'base64:')
            ? base64_decode(substr($encoded, 7), true)
            : $encoded;
        $minimum = max(32, (int) $this->config->get(
            'observability.external_sli.minimum_key_bytes',
            32,
        ));

        if (! is_string($decoded)
            || preg_match('/replace|example|placeholder|secret-manager/i', $decoded) === 1
            || count(array_unique(unpack('C*', $decoded) ?: [])) < 8
            || strlen($decoded) < $minimum) {
            return null;
        }

        return $decoded;
    }

    /** @return list<string> */
    public function validKeyIds(): array
    {
        $keys = $this->config->get('observability.external_sli.signing_keys', []);
        if (! is_array($keys)) {
            return [];
        }

        return array_values(array_filter(
            array_keys($keys),
            fn (mixed $id): bool => is_string($id) && $this->key($id) !== null,
        ));
    }
}
