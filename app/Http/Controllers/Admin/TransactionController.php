<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\Transaction;
use App\Services\BookingInventoryService;
use App\Services\MembershipLifecycleService;
use App\Services\Payments\PaymentRecoveryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;

class TransactionController extends Controller
{
    public function __construct(
        private readonly BookingInventoryService $bookingInventory,
        private readonly MembershipLifecycleService $memberships,
        private readonly PaymentRecoveryService $paymentRecovery,
    ) {}

    public function simulatePay(Transaction $transaction): RedirectResponse
    {
        $subject = $transaction->transactionable;

        if ($subject instanceof Membership) {
            $this->authorizeAny(['manage-members', 'manage-payment-links']);

            if ($subject->user_id !== null) {
                $this->paymentRecovery->recoverForUser((int) $subject->user_id);
            } else {
                $this->paymentRecovery->recoverAll();
            }

            $subject->refresh();
            $this->memberships->confirmPayment(
                $subject,
                'admin_confirmation',
                auth()->user(),
                'admin',
            );

            return back()->with('success', 'Pembayaran membership berhasil dikonfirmasi.');
        }

        $this->authorizeAny(['manage-bookings', 'manage-payment-links']);

        if ($subject instanceof BookingOrder) {
            abort(
                409,
                'Order reservasi publik harus dikonfirmasi melalui alur pembayaran order yang atomik.',
            );
        }

        abort_unless(
            $subject instanceof Booking,
            409,
            'Jenis transaksi ini tidak didukung oleh simulasi pembayaran admin.',
        );

        /** @var Booking $bookingReference */
        $bookingReference = $subject;

        $this->bookingInventory->prepareWriteTransactionIsolation();
        DB::transaction(function () use ($transaction, $bookingReference): void {
            $lockedResources = $this->bookingInventory->lockResources(
                [(int) $bookingReference->facility_id],
                [$bookingReference->facility_unit_id],
            );
            /** @var Booking $lockedSubject */
            $lockedSubject = Booking::query()
                ->lockForUpdate()
                ->findOrFail($bookingReference->id);
            $lockedTransaction = $lockedSubject->transaction()
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                (int) $lockedTransaction->id === (int) $transaction->id,
                409,
                'Transaksi reservasi berubah dan tidak dapat dikonfirmasi.',
            );

            if ($lockedTransaction->payment_status === 'PAID') {
                return;
            }

            abort_unless($lockedTransaction->payment_status === 'UNPAID', 403, 'Transaksi sudah diproses.');

            $facility = $lockedResources['facilities']->get((int) $lockedSubject->facility_id);
            $unit = $lockedSubject->facility_unit_id
                ? $lockedResources['units']->get((int) $lockedSubject->facility_unit_id)
                : null;

            abort_unless($facility, 409, 'Inventori reservasi tidak lagi tersedia.');

            $this->bookingInventory->assertAvailable(
                $facility,
                $unit,
                $lockedSubject->booking_date->format('Y-m-d'),
                (string) $lockedSubject->start_time,
                (string) $lockedSubject->end_time,
                max(1, (int) $lockedSubject->pax),
                [(int) $lockedSubject->id],
                'payment_status',
            );

            $lockedTransaction->update([
                'payment_status' => 'PAID',
                'paid_at' => now(),
            ]);

            $lockedSubject->update(['status' => 'confirmed']);
        }, 3);

        return back()->with('success', 'Pembayaran berhasil dikonfirmasi (Simulasi).');
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function authorizeAny(array $permissions): void
    {
        foreach ($permissions as $permission) {
            if (auth()->user()?->can($permission)) {
                return;
            }
        }

        abort(403);
    }
}
