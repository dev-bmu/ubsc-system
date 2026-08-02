<?php

namespace App\Data\Payments;

use App\Enums\PaymentAttemptStatus;
use App\Services\Payments\PaymentMetadataSanitizer;
use DateTimeInterface;
use InvalidArgumentException;

final readonly class PaymentGatewayResult
{
    /**
     * @var array<array-key, mixed>
     */
    public array $metadata;

    /**
     * @param  array<array-key, mixed>  $metadata
     */
    public function __construct(
        public string $provider,
        public PaymentAttemptStatus $status,
        public int $amount,
        public string $currency,
        public ?string $providerReference = null,
        public ?string $providerTransactionId = null,
        public ?DateTimeInterface $expiresAt = null,
        public ?string $failureCode = null,
        public ?string $failureMessage = null,
        array $metadata = [],
    ) {
        if ($provider === '' || strlen($provider) > 64) {
            throw new InvalidArgumentException('Payment provider identifier is invalid.');
        }

        if ($amount < 1) {
            throw new InvalidArgumentException('Payment amount must be a positive integer.');
        }

        if (! preg_match('/\A[A-Z]{3}\z/', $currency)) {
            throw new InvalidArgumentException('Payment currency must use a three-letter uppercase code.');
        }

        self::assertOptionalIdentifier($providerReference, 'provider reference');
        self::assertOptionalIdentifier($providerTransactionId, 'provider transaction identifier');

        $this->metadata = (new PaymentMetadataSanitizer)->sanitize($metadata);
    }

    private static function assertOptionalIdentifier(?string $value, string $label): void
    {
        if ($value !== null
            && (trim($value) === ''
                || strlen($value) > 191
                || preg_match('/[\x00-\x1F\x7F]/u', $value))) {
            throw new InvalidArgumentException("Payment {$label} is invalid.");
        }
    }
}
