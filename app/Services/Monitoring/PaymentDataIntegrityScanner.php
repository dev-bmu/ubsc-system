<?php

namespace App\Services\Monitoring;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Services\Monitoring\Contracts\DataIntegrityDomainScanner;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class PaymentDataIntegrityScanner extends AbstractDataIntegrityDomainScanner implements DataIntegrityDomainScanner
{
    public function domain(): string
    {
        return 'payments';
    }

    public function scan(CarbonImmutable $at, int $sampleLimit): array
    {
        $subjectTypes = $this->subjectTypes();
        $staleAttemptSeconds = max(
            30,
            (int) config('data_integrity.stale_payment_attempt_seconds', 300),
        );
        $stuckEventSeconds = max(
            60,
            (int) config('data_integrity.stuck_payment_event_seconds', 600),
        );

        return [
            $this->result(
                $this->missingOrUnknownSubjects($subjectTypes),
                $sampleLimit,
                'payment.transaction_subject_missing',
                $this->domain(),
                'critical',
                'Transaction subject is missing',
                'A transaction has an unknown subject type or points at a missing booking, order, or membership.',
                'Restrict financial operations on the record and reconstruct provenance from immutable evidence.',
            ),
            $this->result(
                $this->subjectOwnershipMismatch($subjectTypes),
                $sampleLimit,
                'payment.transaction_ownership_mismatch',
                $this->domain(),
                'critical',
                'Transaction ownership mismatch',
                'A transaction and its subject point at different account identities.',
                'Restrict access and investigate the checkout or administrative action that created it.',
            ),
            $this->result(
                DB::table('transactions')
                    ->selectRaw('id AS subject_id, NULL AS related_id')
                    ->where(function (Builder $query): void {
                        $query
                            ->where(function (Builder $paid): void {
                                $paid
                                    ->where('payment_status', 'PAID')
                                    ->whereNull('paid_at');
                            })
                            ->orWhere(function (Builder $notPaid): void {
                                $notPaid
                                    ->where('payment_status', '<>', 'PAID')
                                    ->whereNotNull('paid_at');
                            });
                    }),
                $sampleLimit,
                'payment.transaction_paid_timestamp_mismatch',
                $this->domain(),
                'critical',
                'Transaction paid timestamp disagrees with status',
                'The paid status and paid_at boundary are inconsistent.',
                'Verify settlement evidence before applying an audited state correction.',
            ),
            $this->result(
                DB::table('payment_attempts')
                    ->selectRaw('id AS subject_id, transaction_id AS related_id')
                    ->where(function (Builder $query): void {
                        $query
                            ->where(function (Builder $paid): void {
                                $paid
                                    ->where('status', 'paid')
                                    ->whereNull('paid_at');
                            })
                            ->orWhere(function (Builder $notPaid): void {
                                $notPaid
                                    ->where('status', '<>', 'paid')
                                    ->whereNotNull('paid_at');
                            });
                    }),
                $sampleLimit,
                'payment.attempt_paid_timestamp_mismatch',
                $this->domain(),
                'critical',
                'Payment attempt paid timestamp disagrees with status',
                'The attempt state and its settlement timestamp are inconsistent.',
                'Verify the provider event ledger before applying an audited correction.',
            ),
            $this->result(
                DB::table('payment_attempts as attempt')
                    ->join('transactions as payment_tx', 'payment_tx.id', '=', 'attempt.transaction_id')
                    ->selectRaw('attempt.id AS subject_id, payment_tx.id AS related_id')
                    ->where('attempt.status', 'paid')
                    ->where('payment_tx.payment_status', '<>', 'PAID'),
                $sampleLimit,
                'payment.paid_attempt_not_projected',
                $this->domain(),
                'critical',
                'Paid attempt is not projected to its transaction',
                'Provider-verified settlement exists while the logical transaction is not paid.',
                'Run the existing payment recovery workflow; never create or collect a second charge.',
                'safe_candidate',
            ),
            $this->result(
                DB::table('payment_attempts')
                    ->selectRaw('transaction_id AS subject_id, NULL AS related_id')
                    ->where('status', 'paid')
                    ->groupBy('transaction_id')
                    ->havingRaw('COUNT(*) > 1'),
                $sampleLimit,
                'payment.multiple_paid_attempts',
                $this->domain(),
                'critical',
                'Multiple paid attempts exist for one transaction',
                'One logical transaction has more than one paid payment attempt.',
                'Escalate for financial reconciliation and potential duplicate-charge handling.',
            ),
            $this->result(
                DB::table('payment_attempts as attempt')
                    ->join('transactions as payment_tx', 'payment_tx.id', '=', 'attempt.transaction_id')
                    ->selectRaw('attempt.id AS subject_id, payment_tx.id AS related_id')
                    ->whereColumn('attempt.amount', '<>', 'payment_tx.amount'),
                $sampleLimit,
                'payment.attempt_amount_mismatch',
                $this->domain(),
                'critical',
                'Payment attempt amount differs from transaction',
                'The provider attempt amount does not match the immutable logical transaction amount.',
                'Do not settle automatically; compare provider evidence and the service snapshot.',
            ),
            $this->result(
                $this->attemptOwnershipMismatch(),
                $sampleLimit,
                'payment.attempt_ownership_mismatch',
                $this->domain(),
                'critical',
                'Payment attempt ownership mismatch',
                'A payment attempt and its logical transaction point at different account identities.',
                'Restrict the attempt and investigate its idempotency and request fingerprint.',
            ),
            $this->result(
                DB::table('payment_attempts')
                    ->selectRaw('id AS subject_id, transaction_id AS related_id')
                    ->where(function (Builder $query): void {
                        $query
                            ->whereRaw('LENGTH(currency) <> 3')
                            ->orWhereRaw('currency <> UPPER(currency)');
                    }),
                $sampleLimit,
                'payment.attempt_currency_invalid',
                $this->domain(),
                'critical',
                'Payment attempt currency is invalid',
                'A payment attempt does not use a normalized three-letter currency code.',
                'Verify the quoted transaction and provider evidence before correction.',
            ),
            $this->result(
                DB::table('payment_attempts')
                    ->selectRaw('id AS subject_id, transaction_id AS related_id')
                    ->where('status', 'creating')
                    ->where('updated_at', '<=', $at->subSeconds($staleAttemptSeconds)),
                $sampleLimit,
                'payment.attempt_initialization_stale',
                $this->domain(),
                'warning',
                'Payment attempt initialization is stale',
                'An attempt remained in creating beyond the recovery threshold.',
                'Run the existing payment recovery workflow to move it into explicit reconciliation.',
                'safe_candidate',
                ['stale_after_seconds' => $staleAttemptSeconds],
            ),
            $this->result(
                DB::table('payment_events')
                    ->selectRaw('id AS subject_id, payment_attempt_id AS related_id')
                    ->where('processing_result', 'received')
                    ->whereNull('processed_at')
                    ->where('received_at', '<=', $at->subSeconds($stuckEventSeconds)),
                $sampleLimit,
                'payment.event_processing_stuck',
                $this->domain(),
                'warning',
                'Payment event processing is stuck',
                'A received provider event was not finalized within the processing threshold.',
                'Inspect the event and provider delivery; do not replay it with a different identity.',
                'manual_review',
                ['stuck_after_seconds' => $stuckEventSeconds],
            ),
            $this->result(
                DB::table('payment_events')
                    ->selectRaw('id AS subject_id, payment_attempt_id AS related_id')
                    ->where(function (Builder $query): void {
                        $query
                            ->where(function (Builder $finished): void {
                                $finished
                                    ->whereIn('processing_result', ['processed', 'ignored', 'rejected'])
                                    ->whereNull('processed_at');
                            })
                            ->orWhere(function (Builder $unfinished): void {
                                $unfinished
                                    ->where('processing_result', 'received')
                                    ->whereNotNull('processed_at');
                            });
                    }),
                $sampleLimit,
                'payment.event_processing_timestamp_mismatch',
                $this->domain(),
                'critical',
                'Payment event processing timestamp disagrees with result',
                'The event completion result and processed_at boundary are inconsistent.',
                'Verify the append-only provider event evidence before applying a correction.',
            ),
        ];
    }

    /**
     * @return array{booking:string,booking_order:string,membership:string}
     */
    private function subjectTypes(): array
    {
        return [
            'booking' => (new Booking)->getMorphClass(),
            'booking_order' => (new BookingOrder)->getMorphClass(),
            'membership' => (new Membership)->getMorphClass(),
        ];
    }

    /**
     * @param  array{booking:string,booking_order:string,membership:string}  $types
     */
    private function missingOrUnknownSubjects(array $types): Builder
    {
        $unknown = DB::table('transactions as payment_tx')
            ->selectRaw('payment_tx.id AS subject_id, NULL AS related_id')
            ->where(function (Builder $query) use ($types): void {
                $query
                    ->whereNull('payment_tx.transactionable_type')
                    ->orWhereNotIn('payment_tx.transactionable_type', array_values($types));
            });

        $missingBooking = DB::table('transactions as payment_tx')
            ->leftJoin('bookings as subject', 'subject.id', '=', 'payment_tx.transactionable_id')
            ->selectRaw('payment_tx.id AS subject_id, payment_tx.transactionable_id AS related_id')
            ->where('payment_tx.transactionable_type', $types['booking'])
            ->whereNull('subject.id');

        $missingOrder = DB::table('transactions as payment_tx')
            ->leftJoin('booking_orders as subject', 'subject.id', '=', 'payment_tx.transactionable_id')
            ->selectRaw('payment_tx.id AS subject_id, payment_tx.transactionable_id AS related_id')
            ->where('payment_tx.transactionable_type', $types['booking_order'])
            ->whereNull('subject.id');

        $missingMembership = DB::table('transactions as payment_tx')
            ->leftJoin('memberships as subject', 'subject.id', '=', 'payment_tx.transactionable_id')
            ->selectRaw('payment_tx.id AS subject_id, payment_tx.transactionable_id AS related_id')
            ->where('payment_tx.transactionable_type', $types['membership'])
            ->whereNull('subject.id');

        return $unknown
            ->unionAll($missingBooking)
            ->unionAll($missingOrder)
            ->unionAll($missingMembership);
    }

    /**
     * @param  array{booking:string,booking_order:string,membership:string}  $types
     */
    private function subjectOwnershipMismatch(array $types): Builder
    {
        $booking = $this->ownerMismatchQuery('bookings', $types['booking']);
        $order = $this->ownerMismatchQuery('booking_orders', $types['booking_order']);
        $membership = $this->ownerMismatchQuery('memberships', $types['membership']);

        return $booking->unionAll($order)->unionAll($membership);
    }

    private function ownerMismatchQuery(string $table, string $type): Builder
    {
        return DB::table('transactions as payment_tx')
            ->join($table.' as subject', 'subject.id', '=', 'payment_tx.transactionable_id')
            ->selectRaw('payment_tx.id AS subject_id, subject.id AS related_id')
            ->where('payment_tx.transactionable_type', $type)
            ->where(function (Builder $query): void {
                $query
                    ->whereColumn('payment_tx.user_id', '<>', 'subject.user_id')
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNull('payment_tx.user_id')
                            ->whereNotNull('subject.user_id');
                    })
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNotNull('payment_tx.user_id')
                            ->whereNull('subject.user_id');
                    });
            });
    }

    private function attemptOwnershipMismatch(): Builder
    {
        return DB::table('payment_attempts as attempt')
            ->join('transactions as payment_tx', 'payment_tx.id', '=', 'attempt.transaction_id')
            ->selectRaw('attempt.id AS subject_id, payment_tx.id AS related_id')
            ->where(function (Builder $query): void {
                $query
                    ->whereColumn('attempt.user_id', '<>', 'payment_tx.user_id')
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNull('attempt.user_id')
                            ->whereNotNull('payment_tx.user_id');
                    })
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNotNull('attempt.user_id')
                            ->whereNull('payment_tx.user_id');
                    });
            });
    }
}
