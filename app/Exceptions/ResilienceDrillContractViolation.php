<?php

namespace App\Exceptions;

use RuntimeException;

final class ResilienceDrillContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Resilience-drill contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:resilience-check] against the intended production configuration.',
        );
    }
}
