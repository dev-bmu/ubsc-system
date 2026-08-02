<?php

namespace App\Exceptions\Payments;

use LogicException;

class PaymentIdempotencyConflict extends LogicException {}
