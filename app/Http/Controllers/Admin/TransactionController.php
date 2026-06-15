<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Membership;
use App\Models\Transaction;
use App\Services\MembershipLifecycleService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;

class TransactionController extends Controller
{
    public function __construct(private readonly MembershipLifecycleService $memberships)
    {
    }

    public function simulatePay(Transaction $transaction): RedirectResponse
    {
        $this->authorizeAny(['manage-bookings', 'manage-payment-links']);

        abort_unless($transaction->payment_status === 'UNPAID', 403, 'Transaksi sudah diproses.');

        DB::transaction(function () use ($transaction) {
            $transaction->update([
                'payment_status' => 'PAID',
                'paid_at'        => now(),
            ]);

            $subject = $transaction->transactionable;
            if ($subject instanceof Booking) {
                $subject->update(['status' => 'confirmed']);
            } elseif ($subject instanceof Membership) {
                $subject->update(['status' => 'active']);
                $subject->refresh()->load(['plan', 'transaction']);
                $this->memberships->writeStatusHistory($subject, 'payment_confirmed', auth()->user());
            }
        });

        return back()->with('success', 'Pembayaran berhasil dikonfirmasi (Simulasi).');
    }

    /**
     * @param array<int, string> $permissions
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
