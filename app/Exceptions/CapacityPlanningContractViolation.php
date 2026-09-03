<?php

namespace App\Exceptions;

use RuntimeException;

final class CapacityPlanningContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Capacity-planning contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:capacity-check] against the intended production configuration.',
        );
    }
}
