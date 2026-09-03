<?php

namespace App\Exceptions;

use RuntimeException;

final class ProductionContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Production contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:check] against the intended production configuration.',
        );
    }
}
