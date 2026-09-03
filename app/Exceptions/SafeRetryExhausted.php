<?php

namespace App\Exceptions;

use RuntimeException;
use Throwable;

final class SafeRetryExhausted extends RuntimeException
{
    public function __construct(
        public readonly int $attempts,
        Throwable $previous,
    ) {
        parent::__construct(
            'A bounded safe operation exhausted its retry budget.',
            (int) $previous->getCode(),
            $previous,
        );
    }
}
