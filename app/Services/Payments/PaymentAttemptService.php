<?php

namespace App\Services\Payments;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Exceptions\Payments\PaymentContextMismatch;
use App\Exceptions\Payments\PaymentIdempotencyConflict;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final class PaymentAttemptService
{
    public function __construct(
        private readonly PaymentStateMachine $stateMachine,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    /**
     * Creates one provider-neutral attempt per idempotency key. Amount and
     * ownership are always copied from the server-owned logical transaction.
     *
     * @param  array<array-key, mixed>  $metadata
     */
    public function createOrResume(
        Transaction $transaction,
        User $user,
        string $idempotencyKey,
        string $requestFingerprint,
        string $currency = 'IDR',
        ?DateTimeInterface $expiresAt = null,
        array $metadata = [],
    ): PaymentAttempt {
        $idempotencyKey = strtolower(trim($idempotencyKey));
        $requestFingerprint = strtolower(trim($requestFingerprint));
        $currency = strtoupper(trim($currency));

        $this->validateIdentifiers($idempotencyKey, $requestFingerprint, $currency);

        if ($expiresAt !== null && $expiresAt->getTimestamp() <= now()->getTimestamp()) {
            throw new InvalidArgumentException('Payment attempt expiration must be in the future.');
        }

        return DB::transaction(function () use (
            $transaction,
            $user,
            $idempotencyKey,
            $requestFingerprint,
            $currency,
            $expiresAt,
            $metadata,
        ): PaymentAttempt {
            /** @var Transaction $lockedTransaction */
            $lockedTransaction = Transaction::query()
                ->lockForUpdate()
                ->findOrFail($transaction->id);

            if ((int) $lockedTransaction->user_id !== (int) $user->id) {
                throw new AuthorizationException('The logical transaction does not belong to this user.');
            }

            if ($lockedTransaction->transactionable_type === null
                || $lockedTransaction->transactionable_id === null) {
                throw new PaymentContextMismatch('The logical transaction has no payable subject.');
            }

            $existing = PaymentAttempt::query()
                ->where('idempotency_key', $idempotencyKey)
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                $this->assertReplayContext(
                    $existing,
                    $lockedTransaction,
                    $user,
                    $requestFingerprint,
                    $currency,
                );

                $this->operationalLog->recordAfterCommit('payment_idempotency_reused', [
                    'attempt_id' => $existing->id,
                    'transaction_id' => $lockedTransaction->id,
                    'status' => $existing->status,
                    'reuse_scope' => 'idempotency_key',
                ]);

                return $existing;
            }

            // Browser storage can be unavailable and two tabs may therefore
            // submit different keys for the same still-live payment intent.
            // The locked logical transaction serializes this fallback lookup.
            $sameIntent = PaymentAttempt::query()
                ->where('transaction_id', $lockedTransaction->id)
                ->where('request_fingerprint', $requestFingerprint)
                ->where('currency', $currency)
                ->where('amount', (int) $lockedTransaction->amount)
                ->whereIn('status', [
                    PaymentAttemptStatus::Draft->value,
                    PaymentAttemptStatus::Creating->value,
                    PaymentAttemptStatus::Pending->value,
                    PaymentAttemptStatus::Reconciling->value,
                    PaymentAttemptStatus::Paid->value,
                ])
                ->latest('id')
                ->first();

            if ($sameIntent !== null) {
                $this->assertReplayContext(
                    $sameIntent,
                    $lockedTransaction,
                    $user,
                    $requestFingerprint,
                    $currency,
                );

                $this->operationalLog->recordAfterCommit('payment_idempotency_reused', [
                    'attempt_id' => $sameIntent->id,
                    'transaction_id' => $lockedTransaction->id,
                    'status' => $sameIntent->status,
                    'reuse_scope' => 'logical_intent',
                ]);

                return $sameIntent;
            }

            // One logical transaction may have only one recognized live
            // payment intent. A changed payment method/fingerprint must not
            // create a second provider charge while the first attempt is
            // creating, pending, reconciling, or already paid.
            $otherRecognizedAttempt = PaymentAttempt::query()
                ->where('transaction_id', $lockedTransaction->id)
                ->whereIn('status', [
                    PaymentAttemptStatus::Draft->value,
                    PaymentAttemptStatus::Creating->value,
                    PaymentAttemptStatus::Pending->value,
                    PaymentAttemptStatus::Reconciling->value,
                    PaymentAttemptStatus::Paid->value,
                ])
                ->orderByDesc('id')
                ->lockForUpdate()
                ->first();

            if ($otherRecognizedAttempt !== null) {
                $this->operationalLog->record('payment_idempotency_conflict', [
                    'attempt_id' => $otherRecognizedAttempt->id,
                    'transaction_id' => $lockedTransaction->id,
                    'status' => $otherRecognizedAttempt->status,
                    'reason_code' => 'different_live_intent',
                ]);

                throw new PaymentIdempotencyConflict(
                    'This transaction already has a recognized payment attempt. Resume it or wait for a terminal result before changing the payment intent.',
                );
            }

            if ($lockedTransaction->payment_status !== 'UNPAID') {
                throw new PaymentContextMismatch('A new attempt cannot be created for a processed transaction.');
            }

            if ((int) $lockedTransaction->amount < 1) {
                throw new PaymentContextMismatch('A payable transaction must have a positive integer amount.');
            }

            $attemptNumber = ((int) PaymentAttempt::query()
                ->where('transaction_id', $lockedTransaction->id)
                ->max('attempt_number')) + 1;

            $attempt = PaymentAttempt::query()->createOrFirst(
                ['idempotency_key' => $idempotencyKey],
                [
                    'transaction_id' => $lockedTransaction->id,
                    'user_id' => $user->id,
                    'attempt_number' => $attemptNumber,
                    'request_fingerprint' => $requestFingerprint,
                    'amount' => (int) $lockedTransaction->amount,
                    'currency' => $currency,
                    'status' => PaymentAttemptStatus::Draft,
                    'metadata' => $metadata,
                    'expires_at' => $expiresAt,
                ],
            );

            $this->assertReplayContext(
                $attempt,
                $lockedTransaction,
                $user,
                $requestFingerprint,
                $currency,
            );

            $this->operationalLog->recordAfterCommit('payment_attempt_initialized', [
                'attempt_id' => $attempt->id,
                'transaction_id' => $attempt->transaction_id,
                'attempt_number' => $attempt->attempt_number,
                'status' => $attempt->status,
            ]);

            return $attempt;
        }, 3);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function transition(
        PaymentAttempt $candidate,
        PaymentAttemptStatus $target,
        array $context = [],
    ): PaymentAttempt {
        return DB::transaction(function () use ($candidate, $target, $context): PaymentAttempt {
            /** @var PaymentAttempt $attempt */
            $attempt = PaymentAttempt::query()
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            return $this->stateMachine->apply($attempt, $target, $context);
        }, 3);
    }

    public function applyGatewayResult(
        PaymentAttempt $candidate,
        PaymentGatewayResult $result,
    ): PaymentAttempt {
        return DB::transaction(function () use ($candidate, $result): PaymentAttempt {
            /** @var PaymentAttempt $attempt */
            $attempt = PaymentAttempt::query()
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            if ((int) $attempt->amount !== $result->amount
                || $attempt->currency !== $result->currency) {
                throw new PaymentContextMismatch('Gateway amount or currency does not match the payment attempt.');
            }

            return $this->stateMachine->apply($attempt, $result->status, [
                'provider' => $result->provider,
                'provider_reference' => $result->providerReference,
                'provider_transaction_id' => $result->providerTransactionId,
                'expires_at' => $result->expiresAt,
                'failure_code' => $result->failureCode,
                'failure_message' => $result->failureMessage,
                'metadata' => $result->metadata,
            ]);
        }, 3);
    }

    /**
     * Move an abandoned provider-initialization phase onto the explicit
     * reconciliation path. This conditional transition is safe when a
     * scheduler, a request-time recovery pass, and a retry race each other:
     * only the process that still observes the stale `creating` row may win.
     */
    public function markCreatingAsReconcilingIfStale(
        PaymentAttempt $candidate,
        DateTimeInterface $staleBefore,
    ): bool {
        return DB::transaction(function () use ($candidate, $staleBefore): bool {
            /** @var PaymentAttempt|null $attempt */
            $attempt = PaymentAttempt::query()
                ->lockForUpdate()
                ->find($candidate->id);

            if ($attempt === null
                || $attempt->status !== PaymentAttemptStatus::Creating
                || $attempt->updated_at === null
                || $attempt->updated_at->greaterThan(Carbon::instance($staleBefore))) {
                return false;
            }

            $this->stateMachine->apply(
                $attempt,
                PaymentAttemptStatus::Reconciling,
                [
                    'metadata' => [
                        'recovery' => [
                            'reason' => 'stale_creating_after_process_interruption',
                            'marked_at' => now()->toIso8601String(),
                        ],
                    ],
                ],
            );

            return true;
        }, 3);
    }

    /**
     * An open attempt carrying provider identity may represent a payment whose
     * response or webhook was lost. It must be reconciled with that provider
     * before a local expiry releases the purchased benefit.
     */
    public function hasUnresolvedProviderExposure(Transaction $transaction): bool
    {
        return $transaction->paymentAttempts()
            ->whereIn('status', [
                PaymentAttemptStatus::Creating->value,
                PaymentAttemptStatus::Pending->value,
                PaymentAttemptStatus::Reconciling->value,
            ])
            ->where(function ($query): void {
                $query
                    ->whereNotNull('provider')
                    ->orWhereNotNull('provider_reference')
                    ->orWhereNotNull('provider_transaction_id');
            })
            ->exists();
    }

    /**
     * Expire every non-terminal attempt for one logical transaction without
     * ever regressing a paid attempt. The intermediate transitions keep the
     * explicit state machine authoritative instead of force-writing status.
     */
    public function expireOpenAttempts(Transaction $candidate): int
    {
        return DB::transaction(function () use ($candidate): int {
            /** @var Transaction $transaction */
            $transaction = Transaction::query()
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            $attempts = PaymentAttempt::query()
                ->where('transaction_id', $transaction->id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            $expired = 0;

            foreach ($attempts as $attempt) {
                if ($attempt->status === PaymentAttemptStatus::Draft) {
                    $attempt = $this->stateMachine->apply(
                        $attempt,
                        PaymentAttemptStatus::Creating,
                    );
                }

                if ($attempt->status === PaymentAttemptStatus::Creating) {
                    $attempt = $this->stateMachine->apply(
                        $attempt,
                        PaymentAttemptStatus::Reconciling,
                    );
                }

                if (in_array($attempt->status, [
                    PaymentAttemptStatus::Pending,
                    PaymentAttemptStatus::Reconciling,
                ], true)) {
                    $this->stateMachine->apply(
                        $attempt,
                        PaymentAttemptStatus::Expired,
                    );
                    $expired++;
                }
            }

            return $expired;
        }, 3);
    }

    /**
     * Guard a destructive subject transition against a payment split-state.
     *
     * A logical transaction that is already PAID is left untouched so the
     * caller can preserve its existing domain-specific cancellation policy.
     * If an attempt is paid while the legacy transaction is not, the subject
     * must not be cancelled or expired until reconciliation makes the two
     * records agree. For a genuinely unpaid transaction, every open attempt
     * is moved to a terminal state through the authoritative state machine.
     */
    public function guardAndTerminateOpenAttempts(
        Transaction $candidate,
        PaymentAttemptStatus $terminalStatus = PaymentAttemptStatus::Cancelled,
        string $errorKey = 'status',
    ): int {
        if (! in_array($terminalStatus, [
            PaymentAttemptStatus::Cancelled,
            PaymentAttemptStatus::Expired,
        ], true)) {
            throw new InvalidArgumentException(
                'Destructive payment attempt termination must be cancelled or expired.',
            );
        }

        return DB::transaction(function () use (
            $candidate,
            $terminalStatus,
            $errorKey,
        ): int {
            /** @var Transaction $transaction */
            $transaction = Transaction::query()
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            $attempts = PaymentAttempt::query()
                ->where('transaction_id', $transaction->id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $hasPaidAttempt = $attempts->contains(
                fn (PaymentAttempt $attempt): bool => $attempt->status === PaymentAttemptStatus::Paid,
            );

            if ($hasPaidAttempt && $transaction->payment_status !== 'PAID') {
                throw ValidationException::withMessages([
                    $errorKey => 'Pembayaran telah terverifikasi tetapi status transaksi belum selaras. Perubahan dihentikan untuk rekonsiliasi pembayaran.',
                ]);
            }

            // A settled logical transaction is final financially. Domain
            // services may still cancel the service while retaining PAID,
            // but payment attempts must never be regressed or terminalized.
            if ($transaction->payment_status === 'PAID') {
                return 0;
            }

            $terminated = 0;

            foreach ($attempts as $attempt) {
                if ($attempt->status->isTerminal()) {
                    continue;
                }

                $attempt = $this->terminalizeOpenAttempt(
                    $attempt,
                    $terminalStatus,
                );

                if ($attempt->status->isTerminal()) {
                    $terminated++;
                }
            }

            return $terminated;
        }, 3);
    }

    private function terminalizeOpenAttempt(
        PaymentAttempt $attempt,
        PaymentAttemptStatus $terminalStatus,
    ): PaymentAttempt {
        if ($attempt->status === PaymentAttemptStatus::Draft) {
            $attempt = $this->stateMachine->apply(
                $attempt,
                PaymentAttemptStatus::Creating,
            );
        }

        if ($terminalStatus === PaymentAttemptStatus::Expired) {
            if ($attempt->status === PaymentAttemptStatus::Creating) {
                $attempt = $this->stateMachine->apply(
                    $attempt,
                    PaymentAttemptStatus::Reconciling,
                );
            }

            if (in_array($attempt->status, [
                PaymentAttemptStatus::Pending,
                PaymentAttemptStatus::Reconciling,
            ], true)) {
                return $this->stateMachine->apply(
                    $attempt,
                    PaymentAttemptStatus::Expired,
                );
            }

            return $attempt;
        }

        if ($attempt->status === PaymentAttemptStatus::Creating) {
            $attempt = $this->stateMachine->apply(
                $attempt,
                PaymentAttemptStatus::Pending,
            );
        }

        if ($attempt->status === PaymentAttemptStatus::Pending) {
            return $this->stateMachine->apply(
                $attempt,
                PaymentAttemptStatus::Cancelled,
            );
        }

        // Reconciling intentionally has no direct cancelled transition. Its
        // safe terminal path is expired, as defined by PaymentAttemptStatus.
        if ($attempt->status === PaymentAttemptStatus::Reconciling) {
            return $this->stateMachine->apply(
                $attempt,
                PaymentAttemptStatus::Expired,
            );
        }

        return $attempt;
    }

    private function validateIdentifiers(
        string $idempotencyKey,
        string $requestFingerprint,
        string $currency,
    ): void {
        if (! Str::isUuid($idempotencyKey)) {
            throw new InvalidArgumentException('Payment idempotency key must be a UUID.');
        }

        if (! preg_match('/\A[a-f0-9]{64}\z/', $requestFingerprint)) {
            throw new InvalidArgumentException('Payment request fingerprint must be a SHA-256 hexadecimal digest.');
        }

        if (! preg_match('/\A[A-Z]{3}\z/', $currency)) {
            throw new InvalidArgumentException('Payment currency must use a three-letter uppercase code.');
        }
    }

    private function assertReplayContext(
        PaymentAttempt $attempt,
        Transaction $transaction,
        User $user,
        string $requestFingerprint,
        string $currency,
    ): void {
        $matches = (int) $attempt->transaction_id === (int) $transaction->id
            && (int) $attempt->user_id === (int) $user->id
            && hash_equals($attempt->request_fingerprint, $requestFingerprint)
            && $attempt->currency === $currency
            && (int) $attempt->amount === (int) $transaction->amount;

        if (! $matches) {
            throw new PaymentIdempotencyConflict(
                'The idempotency key is already bound to a different user, subject, amount, currency, or request.',
            );
        }
    }
}
