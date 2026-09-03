<?php

namespace App\Services\Payments;

use App\Enums\PaymentAttemptStatus;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Services\BookingInventoryService;
use App\Services\BookingOrderExpiryService;
use App\Services\BookingOrderIntegrityService;
use App\Services\MembershipLifecycleService;
use App\Services\ServiceLifecycleService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

/**
 * Durable, provider-neutral recovery for committed payment phase boundaries.
 *
 * The service never creates a new order or provider payment. It only projects
 * already-verified settlement, moves abandoned initialization to the explicit
 * reconciliation state, and then runs the normal idempotent expiry/lifecycle
 * policies. Every candidate is isolated in a short transaction so a process
 * may stop at any point and the next invocation can safely continue.
 */
final class PaymentRecoveryService
{
    public function __construct(
        private readonly PaymentAttemptService $paymentAttempts,
        private readonly BookingInventoryService $inventory,
        private readonly BookingOrderIntegrityService $bookingIntegrity,
        private readonly MembershipLifecycleService $memberships,
        private readonly BookingOrderExpiryService $bookingExpiry,
        private readonly ServiceLifecycleService $serviceLifecycle,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    /**
     * @return array{
     *     booking_orders_recovered:int,
     *     direct_bookings_recovered:int,
     *     memberships_recovered:int,
     *     stale_attempts_reconciling:int,
     *     booking_orders_expired:int,
     *     lifecycle:array<string,int>,
     *     errors:int
     * }
     */
    public function recoverAll(
        ?CarbonInterface $at = null,
        int $limit = 100,
        ?int $staleAfterSeconds = null,
    ): array {
        return $this->recover(null, $at, $limit, $staleAfterSeconds);
    }

    /**
     * Request-time backstop for the authenticated owner. This keeps recovery
     * available during the short window before a restarted scheduler resumes.
     *
     * @return array<string, mixed>
     */
    public function recoverForUser(
        int $userId,
        ?CarbonInterface $at = null,
        int $limit = 25,
    ): array {
        if ($userId < 1) {
            throw new RuntimeException('Payment recovery requires a valid user identifier.');
        }

        return $this->recover($userId, $at, $limit, null);
    }

    public function recoverBookingOrder(int $orderId): bool
    {
        return $this->recoverBookingOrderCandidate($orderId);
    }

    public function recoverMembership(int $membershipId): bool
    {
        return $this->recoverMembershipCandidate($membershipId);
    }

    /**
     * @return array<string, mixed>
     */
    private function recover(
        ?int $userId,
        ?CarbonInterface $at,
        int $limit,
        ?int $staleAfterSeconds,
    ): array {
        $now = $at === null
            ? CarbonImmutable::now((string) config('app.timezone', 'Asia/Jakarta'))
            : CarbonImmutable::instance($at)
                ->setTimezone((string) config('app.timezone', 'Asia/Jakarta'));
        $limit = max(1, min(1000, $limit));
        $report = [
            'booking_orders_recovered' => 0,
            'direct_bookings_recovered' => 0,
            'memberships_recovered' => 0,
            'stale_attempts_reconciling' => 0,
            'booking_orders_expired' => 0,
            'lifecycle' => [],
            'errors' => 0,
        ];

        BookingOrder::query()
            ->when($userId !== null, fn (Builder $query) => $query->where('user_id', $userId))
            ->whereHas('transaction', fn (Builder $transaction) => $this->settledTransaction($transaction))
            ->where(function (Builder $query): void {
                $query
                    ->whereIn('status', ['draft', 'pending_payment'])
                    ->orWhere(function (Builder $paidOrder): void {
                        $paidOrder
                            ->where('status', 'paid')
                            ->whereHas(
                                'bookings',
                                fn (Builder $booking) => $booking->where('status', 'pending'),
                            );
                    });
            })
            ->select('id')
            ->chunkById($limit, function ($rows) use (&$report): void {
                foreach ($rows as $row) {
                    $this->attemptCandidate(
                        'booking_order',
                        (int) $row->id,
                        fn (): bool => $this->recoverBookingOrderCandidate((int) $row->id),
                        $report,
                        'booking_orders_recovered',
                    );
                }
            });

        Booking::query()
            ->whereNull('booking_order_id')
            ->when($userId !== null, fn (Builder $query) => $query->where('user_id', $userId))
            ->where(function (Builder $booking): void {
                $booking
                    ->where('status', 'pending')
                    ->orWhere(function (Builder $settledBenefit): void {
                        $settledBenefit
                            ->whereIn('status', ['confirmed', 'completed'])
                            ->whereHas('transaction', function (Builder $transaction): void {
                                $transaction
                                    ->where('payment_status', '!=', 'PAID')
                                    ->whereHas(
                                        'paymentAttempts',
                                        fn (Builder $attempt) => $attempt
                                            ->where('status', PaymentAttemptStatus::Paid->value),
                                    );
                            });
                    });
            })
            ->whereHas('transaction', fn (Builder $transaction) => $this->settledTransaction($transaction))
            ->select('id')
            ->chunkById($limit, function ($rows) use (&$report): void {
                foreach ($rows as $row) {
                    $this->attemptCandidate(
                        'direct_booking',
                        (int) $row->id,
                        fn (): bool => $this->recoverDirectBookingCandidate((int) $row->id),
                        $report,
                        'direct_bookings_recovered',
                    );
                }
            });

        Membership::query()
            ->when($userId !== null, fn (Builder $query) => $query->where('user_id', $userId))
            ->where('status', 'pending_payment')
            ->whereHas('transaction', fn (Builder $transaction) => $this->settledTransaction($transaction))
            ->select('id')
            ->chunkById($limit, function ($rows) use (&$report): void {
                foreach ($rows as $row) {
                    $this->attemptCandidate(
                        'membership',
                        (int) $row->id,
                        fn (): bool => $this->recoverMembershipCandidate((int) $row->id),
                        $report,
                        'memberships_recovered',
                    );
                }
            });

        $staleSeconds = max(
            30,
            min(
                86400,
                $staleAfterSeconds
                    ?? (int) config('services.payment.recovery_stale_seconds', 120),
            ),
        );
        $staleBefore = $now->subSeconds($staleSeconds);
        PaymentAttempt::query()
            ->where('status', PaymentAttemptStatus::Creating->value)
            ->where('updated_at', '<=', $staleBefore)
            ->when($userId !== null, fn (Builder $query) => $query->where('user_id', $userId))
            ->select('id')
            ->chunkById($limit, function ($rows) use ($staleBefore, &$report): void {
                foreach ($rows as $row) {
                    $attemptId = (int) $row->id;
                    $this->attemptCandidate(
                        'stale_attempt',
                        $attemptId,
                        function () use ($attemptId, $staleBefore): bool {
                            $attempt = PaymentAttempt::query()->find($attemptId);

                            return $attempt !== null
                                && $this->paymentAttempts->markCreatingAsReconcilingIfStale(
                                    $attempt,
                                    $staleBefore,
                                );
                        },
                        $report,
                        'stale_attempts_reconciling',
                    );
                }
            });

        // Paid projections run first. Only after they are durable may normal
        // expiry release genuinely unpaid, provider-unbound holds.
        try {
            $report['booking_orders_expired'] = $userId === null
                ? $this->bookingExpiry->expireDue($now)
                : $this->bookingExpiry->expireDueForUser($userId, $now);
        } catch (Throwable $exception) {
            $report['errors']++;
            $this->logFailure('booking_expiry', null, $exception);
        }

        try {
            $report['lifecycle'] = $userId === null
                ? $this->serviceLifecycle->reconcileAll($now)
                : $this->serviceLifecycle->reconcileForUser($userId, $now);
        } catch (Throwable $exception) {
            $report['errors']++;
            $this->logFailure('service_lifecycle', $userId, $exception);
        }

        return $report;
    }

    private function settledTransaction(Builder $query): Builder
    {
        return $query->where(function (Builder $settled): void {
            $settled
                ->where('payment_status', 'PAID')
                ->orWhereHas(
                    'paymentAttempts',
                    fn (Builder $attempt) => $attempt
                        ->where('status', PaymentAttemptStatus::Paid->value),
                );
        });
    }

    private function recoverBookingOrderCandidate(int $orderId): bool
    {
        $references = Booking::query()
            ->where('booking_order_id', $orderId)
            ->get(['facility_id', 'facility_unit_id']);

        if ($references->isEmpty()) {
            throw new RuntimeException('Booking order has no inventory rows.');
        }

        $this->inventory->prepareWriteTransactionIsolation();

        return DB::transaction(function () use ($orderId, $references): bool {
            $lockedResources = $this->inventory->lockResources(
                $references->pluck('facility_id'),
                $references->pluck('facility_unit_id'),
            );

            /** @var BookingOrder|null $order */
            $order = BookingOrder::query()
                ->lockForUpdate()
                ->find($orderId);

            if ($order === null) {
                return false;
            }

            $bookings = Booking::query()
                ->where('booking_order_id', $order->id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            $this->assertReferencesCovered($bookings, $lockedResources);

            /** @var Transaction|null $transaction */
            $transaction = $order->transaction()
                ->lockForUpdate()
                ->first();

            if ($transaction === null) {
                throw new RuntimeException('Booking order recovery has no transaction.');
            }

            if ((int) $order->user_id < 1
                || (int) $transaction->user_id < 1
                || (int) $transaction->user_id !== (int) $order->user_id) {
                throw new RuntimeException('Booking order and transaction ownership do not match.');
            }

            $paidAttempt = $this->lockedPaidAttempt($transaction);

            if ($transaction->payment_status !== 'PAID' && $paidAttempt === null) {
                return false;
            }

            $this->assertPaidAttemptContext(
                $paidAttempt,
                $transaction,
                (int) $order->user_id,
                (string) $order->currency,
            );

            if (! in_array($order->status, ['draft', 'pending_payment', 'paid'], true)
                || $bookings->contains(fn (Booking $booking) => $booking->status === 'cancelled')) {
                throw new RuntimeException('Settled booking order is no longer safe for automatic confirmation.');
            }

            $settledAt = $transaction->paid_at ?? $paidAttempt?->paid_at;
            if ($settledAt !== null
                && $order->expires_at !== null
                && $settledAt->greaterThan($order->expires_at)) {
                throw new RuntimeException('Booking payment settled after the inventory hold deadline.');
            }

            $this->bookingIntegrity->assertAggregateTotals($order, $transaction, $bookings);
            $this->inventory->assertBookingAggregateAvailable(
                $bookings,
                $lockedResources['facilities'],
                $lockedResources['units'],
                'payment_recovery',
            );

            $changed = $transaction->payment_status !== 'PAID'
                || $order->status !== 'paid'
                || $bookings->contains(fn (Booking $booking) => $booking->status === 'pending');
            $paymentMethod = $this->paymentMethod($transaction, $paidAttempt);

            if ($transaction->payment_status !== 'PAID') {
                $transaction->update([
                    'payment_status' => 'PAID',
                    'payment_method' => $transaction->payment_method ?: $paymentMethod,
                    'paid_at' => $settledAt ?? now(),
                ]);
            }

            if ($order->status !== 'paid') {
                $order->update(['status' => 'paid']);
            }

            foreach ($bookings as $booking) {
                if ($booking->status === 'pending') {
                    $booking->update(['status' => 'confirmed']);
                }
            }

            $this->inventory->assertPersistedBookingsWithinCapacity(
                $bookings,
                $lockedResources['facilities'],
                $lockedResources['units'],
                'payment_recovery',
            );

            if ($changed) {
                $this->operationalLog->recordAfterCommit('reservation_confirmed', [
                    'booking_order_id' => $order->id,
                    'transaction_id' => $transaction->id,
                    'booking_count' => $bookings->count(),
                    'confirmation_source' => 'recovery',
                ]);
            }

            return $changed;
        }, (int) config('resilience.database.transaction_attempts', 3));
    }

    private function recoverDirectBookingCandidate(int $bookingId): bool
    {
        /** @var Booking|null $reference */
        $reference = Booking::query()->find($bookingId);
        if ($reference === null) {
            return false;
        }

        $this->inventory->prepareWriteTransactionIsolation();

        return DB::transaction(function () use ($bookingId, $reference): bool {
            $lockedResources = $this->inventory->lockResources(
                [$reference->facility_id],
                [$reference->facility_unit_id],
            );

            /** @var Booking|null $booking */
            $booking = Booking::query()
                ->lockForUpdate()
                ->find($bookingId);

            if ($booking === null) {
                return false;
            }

            /** @var Transaction|null $transaction */
            $transaction = $booking->transaction()
                ->lockForUpdate()
                ->first();

            if ($transaction === null) {
                throw new RuntimeException('Direct booking recovery has no transaction.');
            }

            if ((int) $booking->user_id < 1
                || (int) $transaction->user_id < 1
                || (int) $transaction->user_id !== (int) $booking->user_id) {
                throw new RuntimeException('Direct booking and transaction ownership do not match.');
            }

            $paidAttempt = $this->lockedPaidAttempt($transaction);
            if ($transaction->payment_status !== 'PAID' && $paidAttempt === null) {
                return false;
            }

            $snapshot = is_array($transaction->service_snapshot)
                ? $transaction->service_snapshot
                : [];
            $expectedCurrency = strtoupper((string) ($snapshot['currency']
                ?? config('services.payment.currency', 'IDR')));
            $this->assertPaidAttemptContext(
                $paidAttempt,
                $transaction,
                (int) $booking->user_id,
                $expectedCurrency,
            );

            if (! in_array($booking->status, ['pending', 'confirmed', 'completed'], true)) {
                throw new RuntimeException('Settled direct booking is not safe for automatic confirmation.');
            }

            if ($booking->status === 'pending') {
                $facility = $lockedResources['facilities']->get((int) $booking->facility_id);
                $unit = $booking->facility_unit_id
                    ? $lockedResources['units']->get((int) $booking->facility_unit_id)
                    : null;

                if ($facility === null) {
                    throw new RuntimeException('Direct booking inventory no longer exists.');
                }

                $this->inventory->assertAvailable(
                    $facility,
                    $unit,
                    $booking->booking_date->toDateString(),
                    substr((string) $booking->start_time, 0, 5),
                    substr((string) $booking->end_time, 0, 5),
                    max(1, (int) $booking->pax),
                    [$booking->id],
                    'payment_recovery',
                );
            }

            $changed = $transaction->payment_status !== 'PAID'
                || $booking->status === 'pending';
            $settledAt = $transaction->paid_at ?? $paidAttempt?->paid_at;

            if ($transaction->payment_status !== 'PAID') {
                $transaction->update([
                    'payment_status' => 'PAID',
                    'payment_method' => $transaction->payment_method
                        ?: $this->paymentMethod($transaction, $paidAttempt),
                    'paid_at' => $settledAt ?? now(),
                ]);
            }

            if ($booking->status === 'pending') {
                $booking->update(['status' => 'confirmed']);
            }

            $this->inventory->assertPersistedBookingsWithinCapacity(
                collect([$booking]),
                $lockedResources['facilities'],
                $lockedResources['units'],
                'payment_recovery',
            );

            if ($changed) {
                $this->operationalLog->recordAfterCommit('reservation_confirmed', [
                    'booking_id' => $booking->id,
                    'transaction_id' => $transaction->id,
                    'booking_count' => 1,
                    'confirmation_source' => 'recovery',
                ]);
            }

            return $changed;
        }, (int) config('resilience.database.transaction_attempts', 3));
    }

    private function recoverMembershipCandidate(int $membershipId): bool
    {
        /** @var Membership|null $membership */
        $membership = Membership::query()->find($membershipId);
        if ($membership === null || $membership->status !== 'pending_payment') {
            return false;
        }

        /** @var Transaction|null $transaction */
        $transaction = $membership->transaction()->first();
        if ($transaction === null) {
            throw new RuntimeException('Membership recovery has no transaction.');
        }

        if ((int) $membership->user_id < 1
            || (int) $transaction->user_id < 1
            || (int) $transaction->user_id !== (int) $membership->user_id) {
            throw new RuntimeException('Membership and transaction ownership do not match.');
        }

        $paidAttempts = $transaction->paymentAttempts()
            ->where('status', PaymentAttemptStatus::Paid->value)
            ->orderBy('id')
            ->get();

        if ($paidAttempts->count() > 1) {
            throw new RuntimeException('Multiple paid attempts exist for one membership transaction.');
        }

        /** @var PaymentAttempt|null $paidAttempt */
        $paidAttempt = $paidAttempts->first();

        if ($transaction->payment_status !== 'PAID' && $paidAttempt === null) {
            return false;
        }

        $snapshot = is_array($transaction->service_snapshot)
            ? $transaction->service_snapshot
            : [];
        $this->assertPaidAttemptContext(
            $paidAttempt,
            $transaction,
            (int) $membership->user_id,
            strtoupper((string) ($snapshot['currency']
                ?? config('services.payment.currency', 'IDR'))),
        );

        return $this->memberships->reconcileSettledPayment(
            $membership,
            $paidAttempt,
        );
    }

    private function lockedPaidAttempt(Transaction $transaction): ?PaymentAttempt
    {
        $attempts = PaymentAttempt::query()
            ->where('transaction_id', $transaction->id)
            ->where('status', PaymentAttemptStatus::Paid->value)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        if ($attempts->count() > 1) {
            throw new RuntimeException('Multiple paid attempts exist for one logical transaction.');
        }

        return $attempts->first();
    }

    private function assertPaidAttemptContext(
        ?PaymentAttempt $attempt,
        Transaction $transaction,
        int $userId,
        string $currency,
    ): void {
        if ($attempt === null) {
            return;
        }

        if ($userId < 1
            || (int) $attempt->transaction_id !== (int) $transaction->id
            || (int) $attempt->amount !== (int) $transaction->amount
            || $attempt->user_id === null
            || (int) $attempt->user_id !== $userId
            || strtoupper($attempt->currency) !== strtoupper($currency)) {
            throw ValidationException::withMessages([
                'payment_recovery' => 'Konteks pembayaran tidak sesuai dengan transaksi yang dipulihkan.',
            ]);
        }
    }

    /**
     * @param  array{facilities:mixed,units:mixed}  $lockedResources
     */
    private function assertReferencesCovered($bookings, array $lockedResources): void
    {
        foreach ($bookings as $booking) {
            if (! $lockedResources['facilities']->has((int) $booking->facility_id)
                || ($booking->facility_unit_id !== null
                    && ! $lockedResources['units']->has((int) $booking->facility_unit_id))) {
                throw new RuntimeException('Booking inventory changed during recovery; retry required.');
            }
        }
    }

    private function paymentMethod(
        Transaction $transaction,
        ?PaymentAttempt $attempt,
    ): string {
        $metadata = is_array($attempt?->metadata) ? $attempt->metadata : [];
        $snapshot = is_array($transaction->service_snapshot)
            ? $transaction->service_snapshot
            : [];

        return (string) ($transaction->payment_method
            ?: ($metadata['payment_method'] ?? null)
            ?: ($snapshot['payment_method'] ?? null)
            ?: $attempt?->provider
            ?: 'verified_payment');
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function attemptCandidate(
        string $kind,
        int $id,
        callable $operation,
        array &$report,
        string $counter,
    ): void {
        try {
            if ($operation()) {
                $report[$counter]++;
            }
        } catch (Throwable $exception) {
            $report['errors']++;
            $this->logFailure($kind, $id, $exception);
        }
    }

    private function logFailure(
        string $kind,
        ?int $id,
        Throwable $exception,
    ): void {
        $this->operationalLog->record('payment_recovery_failed', [
            'operation' => $kind,
            'record_id' => $id,
            'exception' => $exception::class,
            'error_fingerprint' => hash(
                'sha256',
                $exception::class.'|'.$exception->getMessage(),
            ),
        ]);
    }
}
