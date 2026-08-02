<?php

namespace App\Data\Payments;

use App\Enums\PaymentAttemptStatus;
use App\Services\Payments\PaymentMetadataSanitizer;
use App\Services\Payments\PaymentPayloadHasher;
use DateTimeInterface;
use InvalidArgumentException;

final readonly class VerifiedPaymentEvent
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
        public ?string $providerEventId,
        public string $eventType,
        public ?PaymentAttemptStatus $reportedStatus,
        public int $reportedAmount,
        public string $reportedCurrency,
        public string $payloadHash,
        public ?string $providerReference = null,
        public ?string $providerTransactionId = null,
        public ?DateTimeInterface $occurredAt = null,
        public ?string $failureCode = null,
        public ?string $failureMessage = null,
        array $metadata = [],
    ) {
        if ($provider === '' || strlen($provider) > 64) {
            throw new InvalidArgumentException('Payment provider identifier is invalid.');
        }

        if ($eventType === '' || strlen($eventType) > 64) {
            throw new InvalidArgumentException('Payment event type is invalid.');
        }

        if ($reportedAmount < 1) {
            throw new InvalidArgumentException('Reported payment amount must be a positive integer.');
        }

        if (! preg_match('/\A[A-Z]{3}\z/', $reportedCurrency)) {
            throw new InvalidArgumentException('Reported currency must use a three-letter uppercase code.');
        }

        if (! preg_match('/\A[a-f0-9]{64}\z/', $payloadHash)) {
            throw new InvalidArgumentException('Payment payload hash must be a SHA-256 hexadecimal digest.');
        }

        self::assertOptionalIdentifier($providerEventId, 'provider event identifier');
        self::assertOptionalIdentifier($providerReference, 'provider reference');
        self::assertOptionalIdentifier($providerTransactionId, 'provider transaction identifier');

        $this->metadata = (new PaymentMetadataSanitizer)->sanitize($metadata);
    }

    /**
     * Build a verified event while discarding the raw payload after hashing.
     * Signature/authenticity verification remains the gateway adapter's duty.
     *
     * @param  array<array-key, mixed>  $payload
     * @param  array<array-key, mixed>  $metadata
     */
    public static function fromPayload(
        string $provider,
        ?string $providerEventId,
        string $eventType,
        ?PaymentAttemptStatus $reportedStatus,
        int $reportedAmount,
        string $reportedCurrency,
        array $payload,
        ?string $providerReference = null,
        ?string $providerTransactionId = null,
        ?DateTimeInterface $occurredAt = null,
        ?string $failureCode = null,
        ?string $failureMessage = null,
        array $metadata = [],
    ): self {
        return new self(
            provider: $provider,
            providerEventId: $providerEventId,
            eventType: $eventType,
            reportedStatus: $reportedStatus,
            reportedAmount: $reportedAmount,
            reportedCurrency: $reportedCurrency,
            payloadHash: (new PaymentPayloadHasher)->hash($payload),
            providerReference: $providerReference,
            providerTransactionId: $providerTransactionId,
            occurredAt: $occurredAt,
            failureCode: $failureCode,
            failureMessage: $failureMessage,
            metadata: $metadata,
        );
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
