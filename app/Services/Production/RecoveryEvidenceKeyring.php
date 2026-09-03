<?php

namespace App\Services\Production;

use Illuminate\Contracts\Config\Repository;

final class RecoveryEvidenceKeyring
{
    public function __construct(private readonly Repository $config) {}

    /** @return array{id:string,key:string}|null */
    public function active(): ?array
    {
        $id = trim((string) $this->config->get(
            'disaster_recovery.evidence.active_key_id',
            '',
        ));
        $key = $this->key($id);

        return $id !== '' && $key !== null ? compact('id', 'key') : null;
    }

    public function key(string $id): ?string
    {
        if (preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}$/', $id) !== 1) {
            return null;
        }

        $keys = $this->config->get('disaster_recovery.evidence.signing_keys', []);
        $encoded = is_array($keys) ? ($keys[$id] ?? null) : null;

        if (! is_string($encoded) || $encoded === '') {
            return null;
        }

        $decoded = str_starts_with($encoded, 'base64:')
            ? base64_decode(substr($encoded, 7), true)
            : $encoded;
        $minimum = max(32, (int) $this->config->get(
            'disaster_recovery.evidence.minimum_key_bytes',
            32,
        ));
        $maximum = min(4_096, max($minimum, (int) $this->config->get(
            'disaster_recovery.evidence.maximum_key_bytes',
            128,
        )));

        if (! is_string($decoded)
            || strlen($decoded) > $maximum
            || preg_match('/replace|example|placeholder|secret-manager/i', $decoded) === 1
            || count(array_unique(unpack('C*', $decoded) ?: [])) < 8) {
            return null;
        }

        return strlen($decoded) >= $minimum
            ? $decoded
            : null;
    }

    /** @return list<string> */
    public function validKeyIds(): array
    {
        $keys = $this->config->get('disaster_recovery.evidence.signing_keys', []);

        if (! is_array($keys)) {
            return [];
        }

        return array_values(array_filter(
            array_keys($keys),
            fn (mixed $id): bool => is_string($id) && $this->key($id) !== null,
        ));
    }
}
