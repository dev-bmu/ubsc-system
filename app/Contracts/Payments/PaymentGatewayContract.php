<?php

namespace App\Contracts\Payments;

use App\Data\Payments\PaymentGatewayRequest;
use App\Data\Payments\PaymentGatewayResult;
use App\Data\Payments\VerifiedPaymentEvent;
use App\Models\PaymentAttempt;

interface PaymentGatewayContract
{
    public function createPayment(PaymentGatewayRequest $request): PaymentGatewayResult;

    public function retrievePayment(PaymentAttempt $attempt): PaymentGatewayResult;

    public function cancelPayment(PaymentAttempt $attempt): PaymentGatewayResult;

    /**
     * Implementations must authenticate and verify the event before returning.
     *
     * @param  array<string, string|array<int, string>>  $headers
     */
    public function verifyEvent(string $rawBody, array $headers): VerifiedPaymentEvent;
}
