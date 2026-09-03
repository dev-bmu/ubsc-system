<?php

namespace App\Exceptions;

use RuntimeException;

final class BookingCheckoutSchemaUnavailable extends RuntimeException
{
    /** @param list<string> $missingRequirements */
    public function __construct(public readonly array $missingRequirements)
    {
        parent::__construct('The booking checkout schema contract is incomplete.');
    }
}
