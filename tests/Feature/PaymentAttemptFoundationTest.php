<?php

namespace Tests\Feature;

use App\Data\Payments\PaymentGatewayResult;
use App\Data\Payments\VerifiedPaymentEvent;
use App\Enums\PaymentAttemptStatus;
use App\Exceptions\Payments\InvalidPaymentTransition;
use App\Exceptions\Payments\PaymentContextMismatch;
use App\Exceptions\Payments\PaymentEventConflict;
use App\Exceptions\Payments\PaymentIdempotencyConflict;
use App\Models\BookingOrder;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Payments\PaymentAttemptService;
use App\Services\Payments\PaymentEventService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PaymentAttemptFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_or_resume_is_idempotent_and_uses_server_owned_money(): void
    {
        $user = User::factory()->create();
        $transaction = $this->logicalTransaction($user);
        $key = (string) Str::uuid();
        $fingerprint = hash('sha256', 'checkout-intent-a');
        $service = app(PaymentAttemptService::class);

        $attempt = $service->createOrResume(
            $transaction,
            $user,
            $key,
            $fingerprint,
            metadata: [
                'channel' => 'web',
                'authorization' => 'Bearer must-not-persist',
                'nested' => [
                    'access_token' => 'must-not-persist',
                    'safe_reference' => 'checkout-a',
                ],
            ],
        );
        $replayed = $service->createOrResume(
            $transaction,
            $user,
            $key,
            $fingerprint,
        );

        $this->assertSame($attempt->id, $replayed->id);
        $this->assertTrue(Str::isUuid($attempt->public_id));
        $this->assertSame(PaymentAttemptStatus::Draft, $attempt->status);
        $this->assertSame(106000, $attempt->amount);
        $this->assertSame('IDR', $attempt->currency);
        $this->assertSame('web', $attempt->metadata['channel']);
        $this->assertArrayNotHasKey('authorization', $attempt->metadata);
        $this->assertArrayNotHasKey('access_token', $attempt->metadata['nested']);
        $this->assertSame('checkout-a', $attempt->metadata['nested']['safe_reference']);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_idempotency_key_cannot_be_rebound_to_another_user_or_subject(): void
    {
        $firstUser = User::factory()->create();
        $secondUser = User::factory()->create();
        $service = app(PaymentAttemptService::class);
        $key = (string) Str::uuid();

        $service->createOrResume(
            $this->logicalTransaction($firstUser),
            $firstUser,
            $key,
            hash('sha256', 'first-intent'),
        );

        $this->expectException(PaymentIdempotencyConflict::class);

        $service->createOrResume(
            $this->logicalTransaction($secondUser),
            $secondUser,
            $key,
            hash('sha256', 'second-intent'),
        );
    }

    public function test_same_live_payment_intent_with_a_second_key_is_resumed(): void
    {
        $user = User::factory()->create();
        $transaction = $this->logicalTransaction($user);
        $service = app(PaymentAttemptService::class);
        $fingerprint = hash('sha256', 'same-payment-intent');

        $first = $service->createOrResume(
            $transaction,
            $user,
            (string) Str::uuid(),
            $fingerprint,
        );
        $second = $service->createOrResume(
            $transaction,
            $user,
            (string) Str::uuid(),
            $fingerprint,
        );

        $this->assertSame($first->id, $second->id);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_changed_payment_intent_cannot_create_a_second_live_attempt(): void
    {
        $user = User::factory()->create();
        $transaction = $this->logicalTransaction($user);
        $service = app(PaymentAttemptService::class);

        $service->createOrResume(
            $transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'qris-intent'),
        );

        try {
            $service->createOrResume(
                $transaction,
                $user,
                (string) Str::uuid(),
                hash('sha256', 'card-intent'),
            );
            $this->fail('A second live payment intent should have been rejected.');
        } catch (PaymentIdempotencyConflict) {
            $this->assertDatabaseCount('payment_attempts', 1);
        }
    }

    public function test_public_identifier_is_unique_at_the_database_boundary(): void
    {
        $first = $this->attempt();
        $second = $this->attempt();

        $this->expectException(QueryException::class);

        $second->forceFill(['public_id' => $first->public_id])->save();
    }

    public function test_idempotency_key_is_unique_at_the_database_boundary(): void
    {
        $first = $this->attempt();
        $second = $this->attempt();

        $this->expectException(QueryException::class);

        $second->forceFill(['idempotency_key' => $first->idempotency_key])->save();
    }

    public function test_state_machine_reaches_paid_and_paid_is_final(): void
    {
        $attempt = $this->attempt();
        $service = app(PaymentAttemptService::class);

        $attempt = $service->transition($attempt, PaymentAttemptStatus::Creating);
        $attempt = $service->transition($attempt, PaymentAttemptStatus::Pending, [
            'provider' => 'gateway_primary',
            'provider_reference' => 'reference-paid-final',
        ]);
        $attempt = $service->transition($attempt, PaymentAttemptStatus::Paid, [
            'provider' => 'gateway_primary',
            'provider_reference' => 'reference-paid-final',
            'provider_transaction_id' => 'transaction-paid-final',
        ]);

        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->status);
        $this->assertNotNull($attempt->paid_at);
        $this->assertSame(3, $attempt->lock_version);

        try {
            $service->transition($attempt, PaymentAttemptStatus::Failed);
            $this->fail('A paid payment attempt was allowed to regress.');
        } catch (InvalidPaymentTransition) {
            $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);
        }
    }

    public function test_transition_matrix_is_explicit_and_fail_closed(): void
    {
        $allowed = [
            'draft' => ['creating'],
            'creating' => ['pending', 'paid', 'failed', 'reconciling'],
            'pending' => ['paid', 'failed', 'expired', 'cancelled'],
            'reconciling' => ['pending', 'paid', 'failed', 'expired'],
            'paid' => [],
            'failed' => [],
            'expired' => [],
            'cancelled' => [],
        ];

        foreach (PaymentAttemptStatus::cases() as $from) {
            foreach (PaymentAttemptStatus::cases() as $to) {
                $this->assertSame(
                    in_array($to->value, $allowed[$from->value], true),
                    $from->canTransitionTo($to),
                    "Unexpected transition {$from->value} -> {$to->value}.",
                );
            }
        }
    }

    public function test_gateway_result_money_is_checked_before_any_state_change(): void
    {
        $service = app(PaymentAttemptService::class);
        $attempt = $service->transition($this->attempt(), PaymentAttemptStatus::Creating);

        try {
            $service->applyGatewayResult($attempt, new PaymentGatewayResult(
                provider: 'gateway_primary',
                status: PaymentAttemptStatus::Pending,
                amount: 1,
                currency: 'IDR',
                providerReference: 'reference-wrong-amount',
            ));
            $this->fail('A mismatched gateway amount was accepted.');
        } catch (PaymentContextMismatch) {
            $attempt = $attempt->fresh();
            $this->assertSame(PaymentAttemptStatus::Creating, $attempt->status);
            $this->assertNull($attempt->provider);
            $this->assertNull($attempt->provider_reference);
        }
    }

    public function test_duplicate_event_is_processed_once_and_out_of_order_event_is_ignored(): void
    {
        $attemptService = app(PaymentAttemptService::class);
        $eventService = app(PaymentEventService::class);
        $attempt = $attemptService->transition($this->attempt(), PaymentAttemptStatus::Creating);
        $attempt = $attemptService->transition($attempt, PaymentAttemptStatus::Pending, [
            'provider' => 'gateway_primary',
            'provider_reference' => 'reference-event-paid',
        ]);
        $paidEvent = VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: 'event-paid-001',
            eventType: 'payment.updated',
            reportedStatus: PaymentAttemptStatus::Paid,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['status' => 'paid', 'sequence' => 2],
            providerReference: 'reference-event-paid',
            providerTransactionId: 'transaction-event-paid',
            occurredAt: now(),
            metadata: [
                'delivery' => 'verified',
                'signature' => 'must-not-persist',
            ],
        );

        $first = $eventService->record($attempt, $paidEvent);
        $duplicate = $eventService->record($attempt, $paidEvent);

        $this->assertSame($first->id, $duplicate->id);
        $this->assertSame('processed', $first->processing_result);
        $this->assertSame('verified', $first->metadata['delivery']);
        $this->assertArrayNotHasKey('signature', $first->metadata);
        $this->assertDatabaseCount('payment_events', 1);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);

        $latePending = VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: 'event-pending-late-001',
            eventType: 'payment.updated',
            reportedStatus: PaymentAttemptStatus::Pending,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['status' => 'pending', 'sequence' => 1],
            providerReference: 'reference-event-paid',
        );
        $ignored = $eventService->record($attempt, $latePending);

        $this->assertSame('ignored', $ignored->processing_result);
        $this->assertSame('out_of_order_paid_to_pending', $ignored->processing_message);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);
        $this->assertDatabaseCount('payment_events', 2);
    }

    public function test_terminal_failed_attempt_ignores_a_late_paid_event(): void
    {
        $attemptService = app(PaymentAttemptService::class);
        $eventService = app(PaymentEventService::class);
        $attempt = $attemptService->transition($this->attempt(), PaymentAttemptStatus::Creating);
        $attempt = $attemptService->transition($attempt, PaymentAttemptStatus::Failed, [
            'failure_code' => 'DECLINED',
            'failure_message' => 'Payment was declined.',
        ]);

        $event = $eventService->record($attempt, VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: 'event-paid-after-failed',
            eventType: 'payment.updated',
            reportedStatus: PaymentAttemptStatus::Paid,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['status' => 'paid', 'sequence' => 99],
        ));

        $this->assertSame('ignored', $event->processing_result);
        $this->assertSame('out_of_order_failed_to_paid', $event->processing_message);
        $this->assertSame(PaymentAttemptStatus::Failed, $attempt->fresh()->status);
        $this->assertNull($attempt->fresh()->paid_at);
    }

    public function test_amount_or_currency_mismatch_is_recorded_and_rejected(): void
    {
        $attemptService = app(PaymentAttemptService::class);
        $eventService = app(PaymentEventService::class);
        $attempt = $attemptService->transition($this->attempt(), PaymentAttemptStatus::Creating);
        $attempt = $attemptService->transition($attempt, PaymentAttemptStatus::Pending);

        $event = $eventService->record($attempt, VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: 'event-amount-mismatch',
            eventType: 'payment.updated',
            reportedStatus: PaymentAttemptStatus::Paid,
            reportedAmount: 1,
            reportedCurrency: 'IDR',
            payload: ['amount' => 1, 'status' => 'paid'],
        ));

        $this->assertSame('rejected', $event->processing_result);
        $this->assertSame('amount_or_currency_mismatch', $event->processing_message);
        $this->assertSame(PaymentAttemptStatus::Pending, $attempt->fresh()->status);
        $this->assertNull($attempt->fresh()->paid_at);
    }

    public function test_provider_event_identifier_cannot_be_reused_for_another_attempt(): void
    {
        $service = app(PaymentEventService::class);
        $first = $this->attempt();
        $second = $this->attempt();

        $service->record($first, VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: 'event-global-unique',
            eventType: 'payment.observed',
            reportedStatus: null,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['attempt' => 1],
        ));

        $this->expectException(PaymentEventConflict::class);

        $service->record($second, VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: 'event-global-unique',
            eventType: 'payment.observed',
            reportedStatus: null,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['attempt' => 2],
        ));
    }

    public function test_provider_reference_is_unique_when_present(): void
    {
        $first = $this->attempt();
        $second = $this->attempt();
        $first->forceFill([
            'provider' => 'gateway_primary',
            'provider_reference' => 'reference-unique',
        ])->save();

        $this->expectException(QueryException::class);

        $second->forceFill([
            'provider' => 'gateway_primary',
            'provider_reference' => 'reference-unique',
        ])->save();
    }

    public function test_provider_transaction_identifier_is_unique_when_present(): void
    {
        $first = $this->attempt();
        $second = $this->attempt();
        $first->forceFill([
            'provider' => 'gateway_primary',
            'provider_transaction_id' => 'provider-transaction-unique',
        ])->save();

        $this->expectException(QueryException::class);

        $second->forceFill([
            'provider' => 'gateway_primary',
            'provider_transaction_id' => 'provider-transaction-unique',
        ])->save();
    }

    public function test_payload_hash_is_canonical_and_deduplicates_without_an_event_identifier(): void
    {
        $attempt = $this->attempt();
        $service = app(PaymentEventService::class);
        $first = VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: null,
            eventType: 'payment.observed',
            reportedStatus: null,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['b' => 2, 'a' => 1],
        );
        $samePayload = VerifiedPaymentEvent::fromPayload(
            provider: 'gateway_primary',
            providerEventId: null,
            eventType: 'payment.observed',
            reportedStatus: null,
            reportedAmount: 106000,
            reportedCurrency: 'IDR',
            payload: ['a' => 1, 'b' => 2],
        );

        $recorded = $service->record($attempt, $first);
        $duplicate = $service->record($attempt, $samePayload);

        $this->assertSame($first->payloadHash, $samePayload->payloadHash);
        $this->assertSame($recorded->id, $duplicate->id);
        $this->assertDatabaseCount('payment_events', 1);
    }

    public function test_payment_audit_history_survives_user_deletion(): void
    {
        $attempt = $this->attempt();
        $user = $attempt->user;
        $transaction = $attempt->transaction;
        $event = app(PaymentEventService::class)->record(
            $attempt,
            VerifiedPaymentEvent::fromPayload(
                provider: 'gateway_primary',
                providerEventId: 'event-before-user-deletion',
                eventType: 'payment.observed',
                reportedStatus: null,
                reportedAmount: 106000,
                reportedCurrency: 'IDR',
                payload: ['status' => 'observed'],
            ),
        );

        $user->delete();

        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'user_id' => null,
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'user_id' => null,
        ]);
        $this->assertDatabaseHas('payment_events', [
            'id' => $event->id,
            'payment_attempt_id' => $attempt->id,
        ]);
    }

    public function test_logical_transaction_cannot_be_deleted_while_attempt_history_exists(): void
    {
        $attempt = $this->attempt();

        $this->expectException(QueryException::class);

        $attempt->transaction->delete();
    }

    public function test_open_attempts_expire_through_the_state_machine_without_touching_paid(): void
    {
        $service = app(PaymentAttemptService::class);
        $draft = $this->attempt();

        $this->assertSame(1, $service->expireOpenAttempts($draft->transaction));
        $this->assertSame(
            PaymentAttemptStatus::Expired,
            $draft->fresh()->status,
        );

        $paid = $this->attempt();
        $paid = $service->transition($paid, PaymentAttemptStatus::Creating);
        $paid = $service->applyGatewayResult(
            $paid,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: $paid->amount,
                currency: $paid->currency,
                providerReference: 'paid-'.$paid->public_id,
            ),
        );

        $this->assertSame(0, $service->expireOpenAttempts($paid->transaction));
        $this->assertSame(PaymentAttemptStatus::Paid, $paid->fresh()->status);
    }

    private function attempt(): PaymentAttempt
    {
        $user = User::factory()->create();

        return app(PaymentAttemptService::class)->createOrResume(
            $this->logicalTransaction($user),
            $user,
            (string) Str::uuid(),
            hash('sha256', (string) Str::uuid()),
        );
    }

    private function logicalTransaction(User $user): Transaction
    {
        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);

        return Transaction::create([
            'user_id' => $user->id,
            'transactionable_type' => BookingOrder::class,
            'transactionable_id' => $order->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
        ]);
    }
}
