<?php

namespace App\Exceptions;

use RuntimeException;

final class HighAvailabilityContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'High-availability contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:ha-check] against the intended production configuration.',
        );
    }
}
