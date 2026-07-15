<?php

namespace App\Exceptions;

use RuntimeException;

class GalleryCapabilityException extends RuntimeException
{
    public function __construct(
        public readonly string $capabilityCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
