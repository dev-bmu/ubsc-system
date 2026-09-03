<?php

namespace App\Services\Production;

use InvalidArgumentException;
use Throwable;

final class DatabaseReplicationEnvelopeReader
{
    /** @return array<string, mixed> */
    public function read(string $path): array
    {
        $maximum = min(262_144, max(16_384, (int) config(
            'database_replication.attestation.maximum_envelope_bytes',
            98_304,
        )));
        if ($path === '-') {
            $stream = fopen('php://stdin', 'rb');
            if ($stream === false) {
                throw new InvalidArgumentException('Replication attestation input is unavailable.');
            }
            try {
                $contents = stream_get_contents($stream, $maximum + 1);
            } finally {
                fclose($stream);
            }
        } else {
            $path = trim($path);
            if ($path === '' || ! is_file($path) || ! is_readable($path)) {
                throw new InvalidArgumentException('Replication attestation file is not readable.');
            }
            $size = filesize($path);
            if (! is_int($size) || $size < 2 || $size > $maximum) {
                throw new InvalidArgumentException('Replication attestation file has an invalid size.');
            }
            $contents = file_get_contents($path, false, null, 0, $maximum + 1);
        }
        if (! is_string($contents) || strlen($contents) > $maximum) {
            throw new InvalidArgumentException('Replication attestation exceeds the safety limit.');
        }

        try {
            $decoded = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new InvalidArgumentException('Replication attestation is not valid JSON.');
        }
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new InvalidArgumentException('Replication attestation must be one JSON object.');
        }

        return $decoded;
    }
}
