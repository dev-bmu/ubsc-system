<?php

namespace App\Exceptions;

use RuntimeException;

final class DisasterRecoveryContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Disaster-recovery contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:recovery-check] against the intended production configuration.',
        );
    }
}
