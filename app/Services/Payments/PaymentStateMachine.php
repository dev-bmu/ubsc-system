<?php

namespace App\Services\Payments;

use App\Enums\PaymentAttemptStatus;
use App\Exceptions\Payments\InvalidPaymentTransition;
use App\Exceptions\Payments\PaymentContextMismatch;
use App\Models\PaymentAttempt;
use DateTimeInterface;

final class PaymentStateMachine
{
    public function __construct(
        private readonly PaymentMetadataSanitizer $metadataSanitizer,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    /**
     * Apply a validated transition to an attempt that has already been locked.
     *
     * @param  array{
     *     provider?: string|null,
     *     provider_reference?: string|null,
     *     provider_transaction_id?: string|null,
     *     expires_at?: DateTimeInterface|null,
     *     paid_at?: DateTimeInterface|null,
     *     failure_code?: string|null,
     *     failure_message?: string|null,
     *     metadata?: array<array-key, mixed>
     * }  $context
     */
    public function apply(
        PaymentAttempt $attempt,
        PaymentAttemptStatus $target,
        array $context = [],
    ): PaymentAttempt {
        $current = $attempt->status;

        if ($current === $target) {
            return $attempt;
        }

        if (! $current->canTransitionTo($target)) {
            $this->operationalLog->record('payment_illegal_transition', [
                'attempt_id' => $attempt->id,
                'transaction_id' => $attempt->transaction_id,
                'from_status' => $current,
                'to_status' => $target,
            ]);

            throw new InvalidPaymentTransition($current, $target);
        }

        $updates = [
            'status' => $target,
            'lock_version' => $attempt->lock_version + 1,
        ];

        $this->copyImmutableIdentity($attempt, $updates, $context, 'provider', 64);
        $this->copyImmutableIdentity($attempt, $updates, $context, 'provider_reference', 191);
        $this->copyImmutableIdentity($attempt, $updates, $context, 'provider_transaction_id', 191);

        $hasProviderReference = isset($updates['provider_reference'])
            || isset($updates['provider_transaction_id']);
        $effectiveProvider = $updates['provider'] ?? $attempt->provider;

        if ($hasProviderReference && $effectiveProvider === null) {
            throw new PaymentContextMismatch(
                'A provider must be assigned before provider references can be stored.',
            );
        }

        if (array_key_exists('expires_at', $context)) {
            $updates['expires_at'] = $context['expires_at'];
        }

        if (isset($context['metadata']) && is_array($context['metadata'])) {
            $updates['metadata'] = array_replace_recursive(
                $attempt->metadata ?? [],
                $this->metadataSanitizer->sanitize($context['metadata']),
            );
        }

        if ($target === PaymentAttemptStatus::Paid) {
            $updates['paid_at'] = $attempt->paid_at
                ?? ($context['paid_at'] ?? now());
            $updates['failure_code'] = null;
            $updates['failure_message'] = null;
        }

        if ($target === PaymentAttemptStatus::Failed) {
            $updates['failure_code'] = $this->cleanText($context['failure_code'] ?? null, 64);
            $updates['failure_message'] = $this->cleanText($context['failure_message'] ?? null, 255);
        }

        $attempt->forceFill($updates)->save();

        $this->operationalLog->recordAfterCommit('payment_status_transitioned', [
            'attempt_id' => $attempt->id,
            'transaction_id' => $attempt->transaction_id,
            'from_status' => $current,
            'to_status' => $target,
        ]);

        return $attempt->refresh();
    }

    /**
     * @param  array<string, mixed>  $updates
     * @param  array<string, mixed>  $context
     */
    private function copyImmutableIdentity(
        PaymentAttempt $attempt,
        array &$updates,
        array $context,
        string $field,
        int $maxLength,
    ): void {
        if (! array_key_exists($field, $context) || $context[$field] === null) {
            return;
        }

        $value = substr(trim((string) $context[$field]), 0, $maxLength);

        if ($value === '') {
            throw new PaymentContextMismatch("Payment {$field} cannot be empty.");
        }

        $existing = $attempt->getAttribute($field);

        if ($existing !== null && ! hash_equals((string) $existing, $value)) {
            throw new PaymentContextMismatch("Payment {$field} cannot be replaced once assigned.");
        }

        $updates[$field] = $value;
    }

    private function cleanText(mixed $value, int $maxLength): ?string
    {
        if ($value === null) {
            return null;
        }

        $clean = trim((string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string) $value));

        return $clean === '' ? null : substr($clean, 0, $maxLength);
    }
}
