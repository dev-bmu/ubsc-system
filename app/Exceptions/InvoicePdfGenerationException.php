<?php

namespace App\Exceptions;

use RuntimeException;

class InvoicePdfGenerationException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $failureCode,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
