<?php

namespace App\Exceptions;

use RuntimeException;

final class ProcessSupervisionContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Process-supervision contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:process-check] against the intended production configuration.',
        );
    }
}
