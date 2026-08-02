<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Transaction;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class BookingOrderIntegrityService
{
    /**
     * @param  Collection<int, Booking>  $bookings
     */
    public function assertPayable(
        BookingOrder $order,
        Transaction $transaction,
        Collection $bookings,
    ): void {
        $this->assertAggregateTotals($order, $transaction, $bookings);

        if (! in_array($order->status, ['draft', 'pending_payment'], true)
            || $transaction->payment_status !== 'UNPAID') {
            $this->fail('Reservasi ini tidak berada pada status yang dapat dibayar.');
        }

        if ($bookings->contains(fn (Booking $booking): bool => $booking->status !== 'pending')) {
            $this->fail('Detail reservasi berubah dan pembayaran dihentikan demi keamanan.');
        }
    }

    /**
     * Validate the immutable monetary relationship for both first payment and
     * an idempotent retry of an already-settled order.
     *
     * @param  Collection<int, Booking>  $bookings
     */
    public function assertAggregateTotals(
        BookingOrder $order,
        Transaction $transaction,
        Collection $bookings,
    ): void {
        if ($bookings->isEmpty()) {
            $this->fail('Detail reservasi tidak ditemukan dan pembayaran dihentikan demi keamanan.');
        }

        if ($bookings->contains(function (Booking $booking) use ($order): bool {
            return (int) $booking->booking_order_id !== (int) $order->id
                || (int) $booking->user_id !== (int) $order->user_id;
        })) {
            $this->fail('Kepemilikan detail reservasi tidak konsisten.');
        }

        $childrenSubtotal = (int) $bookings->sum(
            fn (Booking $booking): int => (int) $booking->subtotal_price,
        );
        $expectedTotal = (int) $order->subtotal_amount + (int) $order->transaction_fee;

        if ($childrenSubtotal !== (int) $order->subtotal_amount
            || $expectedTotal !== (int) $order->total_amount
            || (int) $transaction->amount !== (int) $order->total_amount) {
            $this->fail('Nilai reservasi tidak konsisten dan pembayaran dihentikan demi keamanan.');
        }
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages([
            'payment_method' => $message,
        ]);
    }
}
