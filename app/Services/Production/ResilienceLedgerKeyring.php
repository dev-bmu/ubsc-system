<?php

namespace App\Services\Production;

use Illuminate\Contracts\Config\Repository;

final class ResilienceLedgerKeyring
{
    public function __construct(private readonly Repository $config) {}

    /** @return array{id:string,key:string}|null */
    public function active(): ?array
    {
        $id = trim((string) $this->config->get(
            'resilience_drills.ledger.active_key_id',
            '',
        ));
        $key = $this->key($id);

        return $id !== '' && $key !== null ? compact('id', 'key') : null;
    }

    public function key(string $id): ?string
    {
        if (preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $id) !== 1) {
            return null;
        }

        $keys = $this->config->get('resilience_drills.ledger.signing_keys', []);
        $configured = is_array($keys) ? ($keys[$id] ?? null) : null;
        if (! is_string($configured) || $configured === '') {
            return null;
        }

        $decoded = str_starts_with($configured, 'base64:')
            ? base64_decode(substr($configured, 7), true)
            : $configured;
        $minimum = max(32, (int) $this->config->get(
            'resilience_drills.ledger.minimum_key_bytes',
            32,
        ));

        if (! is_string($decoded)
            || strlen($decoded) < $minimum
            || strlen($decoded) > 4_096
            || preg_match('/replace|example|placeholder|secret-manager/i', $decoded) === 1
            || count(array_unique(unpack('C*', $decoded) ?: [])) < 8) {
            return null;
        }

        return $decoded;
    }

    /** @return list<string> */
    public function validKeyIds(): array
    {
        $keys = $this->config->get('resilience_drills.ledger.signing_keys', []);

        return is_array($keys)
            ? array_values(array_filter(
                array_keys($keys),
                fn (mixed $id): bool => is_string($id) && $this->key($id) !== null,
            ))
            : [];
    }
}
