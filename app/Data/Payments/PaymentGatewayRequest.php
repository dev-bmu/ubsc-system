<?php

namespace App\Data\Payments;

use App\Services\Payments\PaymentMetadataSanitizer;
use DateTimeInterface;
use Illuminate\Support\Str;
use InvalidArgumentException;

final readonly class PaymentGatewayRequest
{
    /**
     * @var array<array-key, mixed>
     */
    public array $metadata;

    /**
     * @param  array<array-key, mixed>  $metadata
     */
    public function __construct(
        public string $attemptPublicId,
        public string $idempotencyKey,
        public int $amount,
        public string $currency,
        public ?DateTimeInterface $expiresAt = null,
        array $metadata = [],
    ) {
        if (! Str::isUuid($attemptPublicId) || ! Str::isUuid($idempotencyKey)) {
            throw new InvalidArgumentException('Payment identifiers must be valid UUIDs.');
        }

        if ($amount < 1) {
            throw new InvalidArgumentException('Payment amount must be a positive integer.');
        }

        if (! preg_match('/\A[A-Z]{3}\z/', $currency)) {
            throw new InvalidArgumentException('Payment currency must use a three-letter uppercase code.');
        }

        $this->metadata = (new PaymentMetadataSanitizer)->sanitize($metadata);
    }
}
