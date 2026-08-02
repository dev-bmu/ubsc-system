<?php

namespace App\Services;

use App\Enums\PaymentAttemptStatus;
use App\Models\Booking;
use App\Models\Membership;
use App\Models\Transaction;
use App\Services\Payments\PaymentAttemptService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ServiceLifecycleService
{
    public function __construct(
        private readonly MembershipLifecycleService $memberships,
        private readonly PaymentAttemptService $paymentAttempts,
        private readonly BookingInventoryService $bookingInventory,
    ) {}

    /**
     * Persist every due lifecycle transition. Safe to call repeatedly.
     *
     * @return array{bookings_completed: int, memberships_expired: int, membership_payments_expired: int, legacy_booking_payments_expired: int}
     */
    public function reconcileAll(?CarbonInterface $at = null): array
    {
        return $this->reconcile(null, $at);
    }

    /**
     * Reconcile one user's services as a request-time backstop when the
     * scheduler is delayed or temporarily unavailable.
     *
     * @return array{bookings_completed: int, memberships_expired: int, membership_payments_expired: int, legacy_booking_payments_expired: int}
     */
    public function reconcileForUser(
        int $userId,
        ?CarbonInterface $at = null,
    ): array {
        return $this->reconcile($userId, $at);
    }

    public function bookingStatus(
        Booking $booking,
        ?CarbonInterface $at = null,
    ): string {
        if (in_array($booking->status, ['cancelled', 'completed'], true)) {
            return $booking->status;
        }

        if ($booking->status === 'pending') {
            return 'awaiting_payment';
        }

        if ($booking->status !== 'confirmed') {
            return (string) $booking->status;
        }

        $now = $this->localNow($at);

        if ($now->greaterThanOrEqualTo($this->bookingEndsAt($booking))) {
            return 'completed';
        }

        if ($now->greaterThanOrEqualTo($this->bookingStartsAt($booking))) {
            return 'ongoing';
        }

        return 'scheduled';
    }

    public function membershipStatus(
        Membership $membership,
        ?CarbonInterface $at = null,
    ): string {
        if (in_array($membership->status, ['cancelled', 'expired'], true)) {
            return $membership->status;
        }

        $paymentStatus = $membership->relationLoaded('transaction')
            ? $membership->transaction?->payment_status
            : $membership->transaction()->value('payment_status');

        if ($paymentStatus !== 'PAID' || $membership->status !== 'active') {
            return 'awaiting_payment';
        }

        $today = $this->localNow($at)->startOfDay();
        $start = CarbonImmutable::parse(
            $membership->start_date->toDateString(),
            $this->timezone(),
        )->startOfDay();
        $end = CarbonImmutable::parse(
            $membership->end_date->toDateString(),
            $this->timezone(),
        )->startOfDay();

        if ($today->lessThan($start)) {
            return 'scheduled';
        }

        if ($today->greaterThan($end)) {
            return 'expired';
        }

        return 'active';
    }

    public function bookingStartsAt(Booking $booking): CarbonImmutable
    {
        return $this->bookingBoundary($booking, (string) $booking->start_time);
    }

    public function bookingEndsAt(Booking $booking): CarbonImmutable
    {
        return $this->bookingBoundary($booking, (string) $booking->end_time);
    }

    public function bookingNextTransitionAt(
        Booking $booking,
        ?CarbonInterface $at = null,
    ): ?CarbonImmutable {
        return match ($this->bookingStatus($booking, $at)) {
            'scheduled' => $this->bookingStartsAt($booking),
            'ongoing' => $this->bookingEndsAt($booking),
            default => null,
        };
    }

    public function membershipStartsAt(Membership $membership): CarbonImmutable
    {
        return CarbonImmutable::parse(
            $membership->start_date->toDateString(),
            $this->timezone(),
        )->startOfDay();
    }

    /**
     * Membership end dates are inclusive. Expiry occurs at midnight after
     * the displayed end date in the venue timezone.
     */
    public function membershipExpiresAt(Membership $membership): CarbonImmutable
    {
        return CarbonImmutable::parse(
            $membership->end_date->toDateString(),
            $this->timezone(),
        )->addDay()->startOfDay();
    }

    public function membershipNextTransitionAt(
        Membership $membership,
        ?CarbonInterface $at = null,
    ): ?CarbonImmutable {
        return match ($this->membershipStatus($membership, $at)) {
            'scheduled' => $this->membershipStartsAt($membership),
            'active' => $this->membershipExpiresAt($membership),
            default => null,
        };
    }

    private function reconcile(
        ?int $userId,
        ?CarbonInterface $at,
    ): array {
        $now = $this->localNow($at);

        return [
            'bookings_completed' => $this->completeDueBookings($userId, $now),
            'memberships_expired' => $this->expireDueMemberships($userId, $now),
            'membership_payments_expired' => $this->expireDueMembershipPayments($userId, $now),
            'legacy_booking_payments_expired' => $this->expireDueLegacyBookingPayments($userId, $now),
        ];
    }

    /**
     * Preserve the former one-hour legacy direct-booking expiry without its
     * unsafe raw updates. Resource, booking, transaction, and attempts are now
     * locked in writer order; a paid or provider-ambiguous attempt fails closed
     * for payment recovery instead of being downgraded.
     */
    private function expireDueLegacyBookingPayments(
        ?int $userId,
        CarbonImmutable $at,
    ): int {
        $expired = 0;
        $candidateIds = Transaction::query()
            ->where('payment_status', 'UNPAID')
            ->where('transactionable_type', Booking::class)
            ->where('created_at', '<', $at->subHour())
            ->when(
                $userId !== null,
                fn (Builder $query) => $query->where('user_id', $userId),
            )
            ->orderBy('id')
            ->limit(500)
            ->pluck('id');

        foreach ($candidateIds as $transactionId) {
            /** @var Transaction|null $referenceTransaction */
            $referenceTransaction = Transaction::query()->find($transactionId);
            /** @var Booking|null $referenceBooking */
            $referenceBooking = $referenceTransaction?->transactionable;

            if (! $referenceBooking instanceof Booking) {
                continue;
            }

            $this->bookingInventory->prepareWriteTransactionIsolation();
            $changed = DB::transaction(function () use (
                $transactionId,
                $referenceBooking,
            ): bool {
                $this->bookingInventory->lockResources(
                    [$referenceBooking->facility_id],
                    [$referenceBooking->facility_unit_id],
                );

                $booking = Booking::query()
                    ->lockForUpdate()
                    ->find($referenceBooking->id);
                $transaction = Transaction::query()
                    ->lockForUpdate()
                    ->find($transactionId);

                if (! $booking
                    || ! $transaction
                    || $transaction->payment_status !== 'UNPAID') {
                    return false;
                }

                if ($transaction->paymentAttempts()
                    ->where('status', 'paid')
                    ->exists()) {
                    return false;
                }

                if ($this->paymentAttempts->hasUnresolvedProviderExposure($transaction)) {
                    return false;
                }

                $this->paymentAttempts->guardAndTerminateOpenAttempts(
                    $transaction,
                    PaymentAttemptStatus::Expired,
                    'payment_recovery',
                );
                $transaction->refresh();

                if ($transaction->payment_status !== 'UNPAID') {
                    return false;
                }

                $transaction->update(['payment_status' => 'EXPIRED']);

                if (in_array($booking->status, ['pending', 'confirmed'], true)) {
                    $booking->update(['status' => 'cancelled']);
                }

                return true;
            }, 3);

            if ($changed) {
                $expired++;
            }
        }

        return $expired;
    }

    private function expireDueMembershipPayments(
        ?int $userId,
        CarbonImmutable $at,
    ): int {
        $expired = 0;

        Membership::query()
            ->where('status', 'pending_payment')
            ->whereNotNull('registration_expires_at')
            ->where('registration_expires_at', '<=', $at)
            ->when(
                $userId !== null,
                fn (Builder $query) => $query->where('user_id', $userId),
            )
            ->select('id')
            ->chunkById(100, function ($rows) use ($at, &$expired): void {
                foreach ($rows as $row) {
                    $changed = DB::transaction(function () use ($row, $at): bool {
                        $membership = Membership::query()
                            ->with(['plan', 'transaction'])
                            ->lockForUpdate()
                            ->find($row->id);

                        if (! $membership
                            || $membership->status !== 'pending_payment'
                            || $membership->registration_expires_at === null
                            || $membership->registration_expires_at->greaterThan($at)) {
                            return false;
                        }

                        $transaction = $membership->transaction()
                            ->lockForUpdate()
                            ->first();

                        if ($transaction?->payment_status === 'PAID') {
                            return false;
                        }

                        if ($transaction?->paymentAttempts()
                            ->where('status', 'paid')
                            ->exists()) {
                            return false;
                        }

                        if ($transaction
                            && $this->paymentAttempts->hasUnresolvedProviderExposure($transaction)) {
                            return false;
                        }

                        if ($transaction && $transaction->payment_status === 'UNPAID') {
                            $this->paymentAttempts->expireOpenAttempts($transaction);
                            $transaction->update(['payment_status' => 'EXPIRED']);
                        }

                        $membership->update(['status' => 'cancelled']);
                        $membership->refresh()->load(['plan', 'transaction']);
                        $this->memberships->writeStatusHistory(
                            $membership,
                            'payment_expired',
                            null,
                            'system',
                        );

                        return true;
                    }, 3);

                    if ($changed) {
                        $expired++;
                    }
                }
            });

        return $expired;
    }

    private function completeDueBookings(
        ?int $userId,
        CarbonImmutable $at,
    ): int {
        $completed = 0;
        $date = $at->toDateString();
        $time = $at->format('H:i:s');

        Booking::query()
            ->where('status', 'confirmed')
            ->when(
                $userId !== null,
                fn (Builder $query) => $query->where('user_id', $userId),
            )
            ->where(function (Builder $query) use ($date, $time): void {
                $query
                    ->whereDate('booking_date', '<', $date)
                    ->orWhere(function (Builder $sameDay) use ($date, $time): void {
                        $sameDay
                            ->whereDate('booking_date', $date)
                            ->whereTime('end_time', '<=', $time);
                    });
            })
            ->select('id')
            ->chunkById(100, function ($rows) use ($at, &$completed): void {
                foreach ($rows as $row) {
                    $changed = DB::transaction(function () use ($row, $at): bool {
                        $booking = Booking::query()
                            ->lockForUpdate()
                            ->find($row->id);

                        if (! $booking
                            || $booking->status !== 'confirmed'
                            || $this->bookingStatus($booking, $at) !== 'completed') {
                            return false;
                        }

                        return $booking->update(['status' => 'completed']);
                    });

                    if ($changed) {
                        $completed++;
                    }
                }
            });

        return $completed;
    }

    private function expireDueMemberships(
        ?int $userId,
        CarbonImmutable $at,
    ): int {
        $expired = 0;
        $date = $at->toDateString();

        Membership::query()
            ->where('status', 'active')
            ->when(
                $userId !== null,
                fn (Builder $query) => $query->where('user_id', $userId),
            )
            ->whereDate('end_date', '<', $date)
            ->select('id')
            ->chunkById(100, function ($rows) use ($at, &$expired): void {
                foreach ($rows as $row) {
                    $changed = DB::transaction(function () use ($row, $at): bool {
                        $membership = Membership::query()
                            ->with(['plan', 'transaction'])
                            ->lockForUpdate()
                            ->find($row->id);

                        if (! $membership
                            || $membership->status !== 'active'
                            || $this->membershipStatus($membership, $at) !== 'expired') {
                            return false;
                        }

                        $membership->update(['status' => 'expired']);
                        $membership->refresh()->load(['plan', 'transaction']);
                        $this->memberships->writeStatusHistory(
                            $membership,
                            'auto_expired',
                            null,
                            'system',
                        );

                        return true;
                    });

                    if ($changed) {
                        $expired++;
                    }
                }
            });

        return $expired;
    }

    private function bookingBoundary(
        Booking $booking,
        string $time,
    ): CarbonImmutable {
        $normalizedTime = substr($time, 0, 8);
        if (strlen($normalizedTime) === 5) {
            $normalizedTime .= ':00';
        }

        $value = sprintf(
            '%s %s',
            $booking->booking_date->toDateString(),
            $normalizedTime,
        );

        return CarbonImmutable::createFromFormat(
            'Y-m-d H:i:s',
            $value,
            $this->timezone(),
        );
    }

    private function localNow(?CarbonInterface $at = null): CarbonImmutable
    {
        if ($at === null) {
            return CarbonImmutable::now($this->timezone());
        }

        return CarbonImmutable::instance($at)
            ->setTimezone($this->timezone());
    }

    private function timezone(): string
    {
        return (string) config('app.timezone', 'Asia/Jakarta');
    }
}
