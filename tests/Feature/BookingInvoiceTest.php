<?php

namespace Tests\Feature;

use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use App\Services\BookingInvoiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingInvoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_paid_owner_receives_a_real_private_pdf(): void
    {
        [$user, $order] = $this->paidOrder();

        $response = $this->actingAs($user)
            ->get(route('checkout.booking.invoice', $order));

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $this->assertStringContainsString(
            'inline',
            (string) $response->headers->get('Content-Disposition'),
        );
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertStringStartsWith('%PDF-', $response->getContent());

        $download = $this->actingAs($user)
            ->get(route('checkout.booking.invoice', [
                'bookingOrder' => $order,
                'download' => 1,
            ]));

        $download->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString(
            'attachment',
            (string) $download->headers->get('Content-Disposition'),
        );
    }

    public function test_invoice_rejects_non_owner_and_unpaid_orders(): void
    {
        [$owner, $paidOrder] = $this->paidOrder();
        $otherUser = User::factory()->create();

        $this->actingAs($otherUser)
            ->get(route('checkout.booking.invoice', $paidOrder))
            ->assertForbidden();

        [$unpaidOwner, $unpaidOrder] = $this->paidOrder(false);

        $this->actingAs($unpaidOwner)
            ->get(route('checkout.booking.invoice', $unpaidOrder))
            ->assertStatus(409);
    }

    public function test_invoice_document_prefers_snapshot_and_balances_discount(): void
    {
        [$user, $order] = $this->paidOrder(
            paid: true,
            subtotal: 80000,
            discount: 20000,
            fee: 6000,
        );

        $order->transaction->update([
            'payment_method' => 'qris',
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'items' => [[
                    'booking_id' => $order->bookings->first()->id,
                    'facility_id' => $order->bookings->first()->facility_id,
                    'facility_name' => 'Nama Saat Transaksi',
                    'facility_unit_name' => 'Unit Historis',
                    'category_name' => 'Arena',
                    'location' => 'Gedung Utama',
                    'booking_date' => '2026-08-01',
                    'start_time' => '10:00',
                    'end_time' => '12:00',
                    'starts_at' => '2026-08-01T10:00:00+07:00',
                    'ends_at' => '2026-08-01T12:00:00+07:00',
                    'duration_minutes' => 120,
                    'subtotal' => 80000,
                ]],
            ],
        ]);
        $order->bookings->first()->facility->update([
            'name' => 'Nama Baru Yang Tidak Boleh Mengubah Invoice',
        ]);

        $order->refresh()->load([
            'bookings.facility.category',
            'bookings.facilityUnit',
            'transaction',
        ]);

        $document = app(BookingInvoiceService::class)->document($order);

        $this->assertSame('Nama Saat Transaksi', $document['items'][0]['facility_name']);
        $this->assertSame('Unit Historis', $document['items'][0]['unit_name']);
        $this->assertSame('2026-08-01', $document['items'][0]['booking_date']);
        $this->assertSame(120, $document['items'][0]['duration_minutes']);
        $this->assertSame(100000, $document['pricing']['regular_subtotal']);
        $this->assertSame(20000, $document['pricing']['discount']);
        $this->assertSame(80000, $document['pricing']['subtotal']);
        $this->assertSame(86000, $document['pricing']['total']);
        $this->assertSame(0, $document['pricing']['balance_due']);
        $this->assertTrue($document['pricing']['matches']);
        $this->assertSame('QRIS', $document['payment_method']);
        $this->assertSame('***********1001', $document['customer']['identity']);
        $this->assertStringStartsWith(
            'data:image/png;base64,',
            $document['qr_data_uri'],
        );
        $this->assertNotEmpty($document['fonts']['regular']);
        $this->assertNotEmpty($document['fonts']['bold']);
        $this->assertSame($user->id, $order->user_id);
    }

    public function test_signed_verification_is_public_but_never_exposes_customer_data(): void
    {
        [, $order] = $this->paidOrder();
        $document = app(BookingInvoiceService::class)->document($order);

        $response = $this->get($document['verification_url']);

        $response
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
            ->assertSee($document['receipt'])
            ->assertSee('Invoice terverifikasi')
            ->assertDontSee($document['customer']['name'])
            ->assertDontSee($order->whatsapp_number);

        $tamperedUrl = preg_replace(
            '/code=[^&]+/',
            'code=TAMPERED',
            $document['verification_url'],
        );

        $this->get($tamperedUrl)->assertForbidden();
    }

    /**
     * @return array{0: User, 1: BookingOrder}
     */
    private function paidOrder(
        bool $paid = true,
        int $subtotal = 100000,
        int $discount = 0,
        int $fee = 6000,
    ): array {
        $user = User::factory()->create();
        $category = FacilityCategory::create([
            'name' => 'Arena',
            'slug' => 'arena-'.uniqid(),
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Badminton',
            'slug' => 'badminton-'.uniqid(),
            'capacity' => 1,
            'location' => 'Veteran',
            'is_active' => true,
        ]);
        $total = $subtotal + $fee;
        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => 'Ilham Romadhon',
            'whatsapp_number' => '+628123456789',
            'identity_category' => 'warga_ub',
            'identity_number' => '225150700111001',
            'subtotal_amount' => $subtotal,
            'transaction_fee' => $fee,
            'discount_amount' => $discount,
            'total_amount' => $total,
            'status' => $paid ? 'paid' : 'pending_payment',
            'expires_at' => now()->addMinutes(30),
        ]);
        $booking = $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => $order->customer_name,
            'facility_id' => $facility->id,
            'booking_date' => '2026-08-01',
            'start_time' => '19:00',
            'end_time' => '20:00',
            'pax' => 1,
            'subtotal_price' => $subtotal,
            'status' => $paid ? 'confirmed' : 'pending',
        ]);
        $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => $total,
            'payment_status' => $paid ? 'PAID' : 'UNPAID',
            'payment_method' => $paid ? 'qris' : null,
            'paid_at' => $paid ? now() : null,
            'checkout_url' => route('checkout.booking.show', $order),
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'items' => [[
                    'booking_id' => $booking->id,
                    'facility_id' => $facility->id,
                    'facility_name' => $facility->name,
                    'facility_unit_name' => null,
                    'category_name' => $category->name,
                    'location' => $facility->location,
                    'booking_date' => '2026-08-01',
                    'start_time' => '19:00',
                    'end_time' => '20:00',
                    'starts_at' => '2026-08-01T19:00:00+07:00',
                    'ends_at' => '2026-08-01T20:00:00+07:00',
                    'duration_minutes' => 60,
                    'subtotal' => $subtotal,
                ]],
            ],
        ]);

        return [$user, $order->load([
            'bookings.facility.category',
            'bookings.facilityUnit',
            'transaction',
        ])];
    }
}
