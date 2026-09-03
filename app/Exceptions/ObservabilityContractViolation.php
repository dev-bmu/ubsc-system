<?php

namespace App\Exceptions;

use RuntimeException;

final class ObservabilityContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Observability contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:observability-check] against the intended production configuration.',
        );
    }
}
