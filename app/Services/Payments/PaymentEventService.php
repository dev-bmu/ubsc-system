<?php

namespace App\Services\Payments;

use App\Data\Payments\VerifiedPaymentEvent;
use App\Exceptions\Payments\PaymentEventConflict;
use App\Models\PaymentAttempt;
use App\Models\PaymentEvent;
use Illuminate\Support\Facades\DB;

final class PaymentEventService
{
    public function __construct(
        private readonly PaymentStateMachine $stateMachine,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    public function record(
        PaymentAttempt $candidate,
        VerifiedPaymentEvent $incoming,
    ): PaymentEvent {
        return DB::transaction(function () use ($candidate, $incoming): PaymentEvent {
            /** @var PaymentAttempt $attempt */
            $attempt = PaymentAttempt::query()
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            $existing = $this->existingEvent($attempt, $incoming);

            if ($existing !== null) {
                $this->operationalLog->recordAfterCommit('payment_event_duplicate', [
                    'attempt_id' => $attempt->id,
                    'event_id' => $existing->id,
                    'provider' => $incoming->provider,
                    'event_type' => $incoming->eventType,
                ]);

                return $existing;
            }

            $event = PaymentEvent::create([
                'payment_attempt_id' => $attempt->id,
                'provider' => $incoming->provider,
                'provider_event_id' => $incoming->providerEventId,
                'event_type' => $incoming->eventType,
                'reported_status' => $incoming->reportedStatus,
                'reported_amount' => $incoming->reportedAmount,
                'reported_currency' => $incoming->reportedCurrency,
                'payload_hash' => $incoming->payloadHash,
                'metadata' => $incoming->metadata,
                'processing_result' => 'received',
                'occurred_at' => $incoming->occurredAt,
                'received_at' => now(),
            ]);

            $this->operationalLog->recordAfterCommit('payment_event_received', [
                'attempt_id' => $attempt->id,
                'event_id' => $event->id,
                'provider' => $incoming->provider,
                'event_type' => $incoming->eventType,
                'reported_status' => $incoming->reportedStatus,
            ]);

            if ($attempt->provider !== null
                && ! hash_equals($attempt->provider, $incoming->provider)) {
                return $this->finish($event, 'rejected', 'provider_mismatch');
            }

            if ((int) $attempt->amount !== $incoming->reportedAmount
                || $attempt->currency !== $incoming->reportedCurrency) {
                return $this->finish($event, 'rejected', 'amount_or_currency_mismatch');
            }

            if ($incoming->reportedStatus === null) {
                return $this->finish($event, 'ignored', 'no_normalized_status');
            }

            if ($attempt->status === $incoming->reportedStatus) {
                return $this->finish($event, 'ignored', 'status_unchanged');
            }

            if (! $attempt->status->canTransitionTo($incoming->reportedStatus)) {
                return $this->finish(
                    $event,
                    'ignored',
                    'out_of_order_'.$attempt->status->value.'_to_'.$incoming->reportedStatus->value,
                );
            }

            $this->stateMachine->apply($attempt, $incoming->reportedStatus, [
                'provider' => $incoming->provider,
                'provider_reference' => $incoming->providerReference,
                'provider_transaction_id' => $incoming->providerTransactionId,
                'paid_at' => $incoming->occurredAt,
                'failure_code' => $incoming->failureCode,
                'failure_message' => $incoming->failureMessage,
                'metadata' => $incoming->metadata,
            ]);

            return $this->finish($event, 'processed', 'state_transition_applied');
        }, 3);
    }

    private function existingEvent(
        PaymentAttempt $attempt,
        VerifiedPaymentEvent $incoming,
    ): ?PaymentEvent {
        if ($incoming->providerEventId !== null) {
            $byProviderId = PaymentEvent::query()
                ->where('provider', $incoming->provider)
                ->where('provider_event_id', $incoming->providerEventId)
                ->first();

            if ($byProviderId !== null) {
                $sameContext = (int) $byProviderId->payment_attempt_id === (int) $attempt->id
                    && $byProviderId->provider === $incoming->provider
                    && $byProviderId->event_type === $incoming->eventType
                    && $byProviderId->reported_status === $incoming->reportedStatus
                    && (int) $byProviderId->reported_amount === $incoming->reportedAmount
                    && $byProviderId->reported_currency === $incoming->reportedCurrency
                    && hash_equals($byProviderId->payload_hash, $incoming->payloadHash);

                if (! $sameContext) {
                    throw new PaymentEventConflict(
                        'The provider event identifier is already bound to a different event.',
                    );
                }

                return $byProviderId;
            }
        }

        $byPayload = PaymentEvent::query()
            ->where('payment_attempt_id', $attempt->id)
            ->where('provider', $incoming->provider)
            ->where('event_type', $incoming->eventType)
            ->where('payload_hash', $incoming->payloadHash)
            ->first();

        if ($byPayload === null) {
            return null;
        }

        if ($byPayload->reported_status !== $incoming->reportedStatus
            || (int) $byPayload->reported_amount !== $incoming->reportedAmount
            || $byPayload->reported_currency !== $incoming->reportedCurrency) {
            throw new PaymentEventConflict(
                'The payment payload hash was replayed with a different normalized context.',
            );
        }

        return $byPayload;
    }

    private function finish(
        PaymentEvent $event,
        string $result,
        string $message,
    ): PaymentEvent {
        $event->update([
            'processing_result' => $result,
            'processing_message' => $message,
            'processed_at' => now(),
        ]);

        $this->operationalLog->recordAfterCommit('payment_event_processed', [
            'attempt_id' => $event->payment_attempt_id,
            'event_id' => $event->id,
            'result' => $result,
            'message_code' => $message,
            'reported_status' => $event->reported_status,
        ]);

        return $event->refresh();
    }
}
