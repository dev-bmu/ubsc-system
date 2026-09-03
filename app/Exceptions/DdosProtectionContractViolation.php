<?php

namespace App\Exceptions;

use RuntimeException;

final class DdosProtectionContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'DDoS protection contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:ddos-check --strict] against the intended production configuration.',
        );
    }
}
