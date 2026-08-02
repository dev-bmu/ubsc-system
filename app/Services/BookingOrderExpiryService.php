<?php

namespace App\Services;

use App\Models\BookingOrder;
use App\Models\Transaction;
use App\Services\Payments\PaymentAttemptService;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class BookingOrderExpiryService
{
    public function __construct(
        private readonly PaymentAttemptService $paymentAttempts,
    ) {}

    public function isDue(
        BookingOrder $order,
        ?CarbonInterface $at = null,
    ): bool {
        $at ??= now();

        return in_array($order->status, ['draft', 'pending_payment'], true)
            && $order->expires_at !== null
            && $order->expires_at->lessThanOrEqualTo($at);
    }

    /**
     * Expire one already-locked order and release each pending booking hold.
     */
    public function expire(
        BookingOrder $order,
        ?Transaction $transaction = null,
        ?CarbonInterface $at = null,
    ): bool {
        if (! $this->isDue($order, $at)) {
            return false;
        }

        $transaction ??= $order->transaction()->first();

        if ($transaction?->payment_status === 'PAID') {
            return false;
        }

        // Never release a benefit after a verified paid attempt. A split
        // state is left intact for reconciliation rather than converted into
        // an unpaid expiry that could discard a customer's payment.
        if ($transaction?->paymentAttempts()
            ->where('status', 'paid')
            ->exists()) {
            return false;
        }

        // A provider identity means the request may already have crossed the
        // network boundary even when the local response was lost. Releasing
        // the slot before provider reconciliation could charge a customer and
        // resell the same inventory, so this state intentionally fails closed.
        if ($transaction
            && $this->paymentAttempts->hasUnresolvedProviderExposure($transaction)) {
            return false;
        }

        // A confirmed child under an unpaid order is an invalid legacy state;
        // release it together with normal pending holds when the order expires.
        $order->bookings()
            ->whereIn('status', ['pending', 'confirmed'])
            ->update(['status' => 'cancelled']);

        if ($transaction && $transaction->payment_status !== 'EXPIRED') {
            $this->paymentAttempts->expireOpenAttempts($transaction);
            $transaction->update(['payment_status' => 'EXPIRED']);
        }

        $order->update(['status' => 'expired']);

        return true;
    }

    /**
     * Expire all due public booking orders in small locked batches.
     */
    public function expireDue(
        ?CarbonInterface $at = null,
        ?int $userId = null,
    ): int {
        $at ??= now();
        $expiredCount = 0;

        BookingOrder::query()
            ->whereIn('status', ['draft', 'pending_payment'])
            ->when(
                $userId !== null,
                fn ($query) => $query->where('user_id', $userId),
            )
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', $at)
            ->select('id')
            ->chunkById(100, function ($orders) use ($at, &$expiredCount): void {
                foreach ($orders as $orderReference) {
                    $expired = DB::transaction(function () use ($orderReference, $at): bool {
                        $order = BookingOrder::query()
                            ->lockForUpdate()
                            ->find($orderReference->id);

                        if (! $order) {
                            return false;
                        }

                        $transaction = $order->transaction()
                            ->lockForUpdate()
                            ->first();

                        return $this->expire($order, $transaction, $at);
                    }, 3);

                    if ($expired) {
                        $expiredCount++;
                    }
                }
            });

        return $expiredCount;
    }

    public function expireDueForUser(
        int $userId,
        ?CarbonInterface $at = null,
    ): int {
        return $this->expireDue($at, $userId);
    }

    public function expireOrderIfDue(
        int $orderId,
        ?CarbonInterface $at = null,
    ): bool {
        return DB::transaction(function () use ($orderId, $at): bool {
            $order = BookingOrder::query()
                ->lockForUpdate()
                ->find($orderId);

            if (! $order) {
                return false;
            }

            $transaction = $order->transaction()
                ->lockForUpdate()
                ->first();

            return $this->expire($order, $transaction, $at);
        }, 3);
    }
}
