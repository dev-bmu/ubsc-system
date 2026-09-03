<?php

namespace App\Logging;

use Illuminate\Log\Logger;

class RedactSensitiveLogContext
{
    public function __invoke(Logger $logger): void
    {
        $logger->pushProcessor(app(SensitiveDataProcessor::class));
    }
}
