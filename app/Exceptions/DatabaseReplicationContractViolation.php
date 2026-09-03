<?php

namespace App\Exceptions;

use RuntimeException;

final class DatabaseReplicationContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self('Database replication contract failed: '.implode(', ', $codes).'.');
    }
}
