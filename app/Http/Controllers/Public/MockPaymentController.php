<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\BookingOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MockPaymentController extends Controller
{
    public function pay(Request $request, BookingOrder $bookingOrder): RedirectResponse
    {
        abort_unless((bool) config('services.payment.mock', true), 404);
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            403,
        );

        $data = $request->validate([
            'payment_method' => ['required', 'in:bca_va,qris,card'],
            'customer_name' => ['required', 'string', 'max:255'],
            'whatsapp_number' => ['required', 'string', 'max:30'],
            'identity_category' => ['required', 'in:warga_ub,umum'],
            'identity_number' => ['nullable', 'required_if:identity_category,warga_ub', 'string', 'regex:/^[0-9]{6,30}$/'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $bookingOrder->load(['transaction', 'bookings']);

        abort_unless($bookingOrder->transaction, 422, 'Transaksi belum tersedia.');
        abort_unless($bookingOrder->transaction->payment_status === 'UNPAID', 403, 'Transaksi sudah diproses.');
        abort_unless(in_array($bookingOrder->status, ['draft', 'pending_payment'], true), 403, 'Order tidak dapat dibayar.');

        DB::transaction(function () use ($bookingOrder, $data): void {
            $bookingOrder->update([
                'customer_name' => $data['customer_name'],
                'whatsapp_number' => $data['whatsapp_number'],
                'identity_category' => $data['identity_category'],
                'identity_number' => $data['identity_category'] === 'warga_ub'
                    ? ($data['identity_number'] ?? null)
                    : null,
                'notes' => $data['notes'] ?? null,
            ]);

            $bookingOrder->transaction->update([
                'payment_status' => 'PAID',
                'paid_at' => now(),
            ]);

            $bookingOrder->update([
                'status' => 'paid',
            ]);

            $bookingOrder->bookings()->where('status', 'pending')->update([
                'customer_name' => $data['customer_name'],
                'notes' => $data['notes'] ?? null,
                'status' => 'confirmed',
            ]);
        });

        return redirect()->route('checkout.booking.success', $bookingOrder);
    }
}
