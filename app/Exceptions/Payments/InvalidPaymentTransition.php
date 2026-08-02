<?php

namespace App\Exceptions\Payments;

use App\Enums\PaymentAttemptStatus;
use LogicException;

class InvalidPaymentTransition extends LogicException
{
    public function __construct(
        public readonly PaymentAttemptStatus $from,
        public readonly PaymentAttemptStatus $to,
    ) {
        parent::__construct("Payment status cannot transition from {$from->value} to {$to->value}.");
    }
}
