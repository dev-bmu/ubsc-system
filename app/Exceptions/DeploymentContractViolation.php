<?php

namespace App\Exceptions;

use RuntimeException;

final class DeploymentContractViolation extends RuntimeException
{
    /** @param list<string> $codes */
    public static function fromCodes(array $codes): self
    {
        return new self(
            'Deployment contract refused to boot: '.implode(', ', $codes).'. '.
            'Run [php artisan production:deployment-check --strict] against the intended production configuration.',
        );
    }
}
