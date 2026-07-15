<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\BookingOrder;
use App\Services\BookingCartValidator;
use App\Services\BookingPriceCalculator;
use App\Services\BookingSlotMerger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class PublicCheckoutController extends Controller
{
    public function __construct(
        private readonly BookingCartValidator $cartValidator,
        private readonly BookingSlotMerger $slotMerger,
        private readonly BookingPriceCalculator $priceCalculator,
    ) {
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.facility_id' => ['required', 'integer', 'exists:facilities,id'],
            'items.*.facility_unit_id' => ['nullable', 'integer', 'exists:facility_units,id'],
            'items.*.booking_date' => ['required', 'date_format:Y-m-d'],
            'items.*.start_time' => ['required', 'date_format:H:i'],
            'items.*.end_time' => ['required', 'date_format:H:i'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'whatsapp_number' => ['nullable', 'string', 'max:30'],
            'identity_category' => ['nullable', 'in:warga_ub,umum'],
            'identity_number' => ['nullable', 'required_if:identity_category,warga_ub', 'string', 'regex:/^[0-9]{6,30}$/'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        $identityCategory = $data['identity_category']
            ?? ($user?->identity_category === 'warga_kampus' ? 'warga_ub' : 'umum');

        $order = DB::transaction(function () use ($data, $user, $identityCategory): BookingOrder {
            $validatedSlots = $this->cartValidator->validate($data['items']);
            $mergedSlots = $this->slotMerger->merge($validatedSlots);
            $pricing = $this->priceCalculator->calculate(
                $mergedSlots,
                $identityCategory,
                $data['identity_number'] ?? $user?->identity_number,
            );

            /** @var BookingOrder $order */
            $order = BookingOrder::create([
                'user_id' => $user?->id,
                'customer_name' => $data['customer_name'] ?? $user?->name ?? 'Guest',
                'whatsapp_number' => $data['whatsapp_number'] ?? $user?->phone_number,
                'identity_category' => $identityCategory,
                'identity_number' => $identityCategory === 'warga_ub'
                    ? ($data['identity_number'] ?? $user?->identity_number)
                    : null,
                'subtotal_amount' => $pricing['subtotal_amount'],
                'transaction_fee' => $pricing['transaction_fee'],
                'discount_amount' => $pricing['discount_amount'],
                'total_amount' => $pricing['total_amount'],
                'status' => 'pending_payment',
                'notes' => $data['notes'] ?? null,
                'expires_at' => now()->addHour(),
            ]);

            foreach ($pricing['slots'] as $slot) {
                $order->bookings()->create([
                    'user_id' => $user?->id,
                    'customer_name' => $order->customer_name,
                    'facility_id' => (int) $slot['facility_id'],
                    'facility_unit_id' => $slot['facility_unit_id'] ?? null,
                    'booking_date' => (string) $slot['booking_date'],
                    'start_time' => (string) $slot['start_time'],
                    'end_time' => (string) $slot['end_time'],
                    'pax' => 1,
                    'subtotal_price' => (int) $slot['subtotal_price'],
                    'status' => 'pending',
                    'notes' => $order->notes,
                ]);
            }

            $order->transaction()->create([
                'user_id' => $user?->id,
                'amount' => $order->total_amount,
                'payment_status' => 'UNPAID',
                'checkout_url' => route('checkout.booking.show', $order),
            ]);

            return $order;
        });

        return redirect()->route('checkout.booking.show', $order);
    }

    public function show(Request $request, BookingOrder $bookingOrder): Response
    {
        $this->authorizeOwner($request, $bookingOrder);

        $bookingOrder->load([
            'bookings.facility',
            'bookings.facilityUnit',
            'transaction',
            'user',
        ]);

        return Inertia::render('Checkout/BookingCheckoutPage', [
            'bookingOrder' => $this->payload($bookingOrder),
            'paymentMethods' => [
                ['id' => 'bca_va', 'label' => 'BCA Virtual Account'],
                ['id' => 'qris', 'label' => 'QRIS'],
                ['id' => 'card', 'label' => 'Credit / Debit Card'],
            ],
            'mockPayment' => (bool) config('services.payment.mock', true),
        ]);
    }

    public function success(Request $request, BookingOrder $bookingOrder): Response
    {
        $this->authorizeOwner($request, $bookingOrder);

        $bookingOrder->load([
            'bookings.facility',
            'bookings.facilityUnit',
            'transaction',
            'user',
        ]);

        return Inertia::render('Checkout/BookingSuccessPage', [
            'bookingOrder' => $this->payload($bookingOrder),
            'invoiceUrl' => route('checkout.booking.invoice', $bookingOrder),
        ]);
    }

    private function authorizeOwner(Request $request, BookingOrder $bookingOrder): void
    {
        abort_unless(
            $request->user() && $bookingOrder->user_id === $request->user()->id,
            403,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(BookingOrder $bookingOrder): array
    {
        return [
            'id' => $bookingOrder->id,
            'customer_name' => $bookingOrder->customer_name,
            'whatsapp_number' => $bookingOrder->whatsapp_number,
            'identity_category' => $bookingOrder->identity_category,
            'identity_number' => $bookingOrder->identity_number,
            'subtotal_amount' => $bookingOrder->subtotal_amount,
            'transaction_fee' => $bookingOrder->transaction_fee,
            'discount_amount' => $bookingOrder->discount_amount,
            'total_amount' => $bookingOrder->total_amount,
            'status' => $bookingOrder->status,
            'notes' => $bookingOrder->notes,
            'expires_at' => $bookingOrder->expires_at?->toDateTimeString(),
            'bookings' => $bookingOrder->bookings->map(fn ($booking) => [
                'id' => $booking->id,
                'facility_name' => $booking->facility?->name,
                'facility_unit_name' => $booking->facilityUnit?->name,
                'booking_date' => $booking->booking_date?->format('Y-m-d'),
                'start_time' => substr((string) $booking->start_time, 0, 5),
                'end_time' => substr((string) $booking->end_time, 0, 5),
                'subtotal_price' => $booking->subtotal_price,
                'status' => $booking->status,
            ])->values()->all(),
            'transaction' => $bookingOrder->transaction ? [
                'id' => $bookingOrder->transaction->id,
                'receipt_number' => $bookingOrder->transaction->receipt_number,
                'amount' => $bookingOrder->transaction->amount,
                'payment_status' => $bookingOrder->transaction->payment_status,
                'xendit_invoice_id' => $bookingOrder->transaction->xendit_invoice_id,
                'checkout_url' => $bookingOrder->transaction->checkout_url,
                'paid_at' => $bookingOrder->transaction->paid_at?->format('Y-m-d H:i'),
            ] : null,
        ];
    }
}
