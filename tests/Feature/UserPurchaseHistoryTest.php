<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\FacilityUnit;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class UserPurchaseHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_paid_multi_slot_order_exposes_immutable_facility_class_unit_and_schedule_details(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-07-26 10:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $arenaCategory = $this->category('Fasilitas Indoor', 'fasilitas-indoor');
        $classCategory = $this->category('Kelas Kebugaran', 'kelas-kebugaran');
        $tennis = $this->facility($arenaCategory, 'Lapangan Tenis', 'lapangan-tenis');
        $yoga = $this->facility($classCategory, 'Yoga', 'yoga', 'Class 001');
        $unit = FacilityUnit::create([
            'facility_id' => $tennis->id,
            'name' => 'Lapangan Tennis 1',
            'is_active' => true,
        ]);

        $order = $this->paidOrder($user, 206000);
        $tennisBooking = $this->booking(
            $order,
            $user,
            $tennis,
            '2026-07-26',
            '12:00',
            '13:00',
            100000,
            $unit,
        );
        $yogaBooking = $this->booking(
            $order,
            $user,
            $yoga,
            '2026-07-26',
            '09:30',
            '10:30',
            100000,
        );

        $transaction = $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => 206000,
            'payment_status' => 'PAID',
            'payment_method' => 'qris',
            'paid_at' => now()->subMinutes(5),
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'items' => [
                    $this->snapshot($tennisBooking, 'facility', 'Lapangan Tenis', 'Lapangan Tennis 1'),
                    $this->snapshot($yogaBooking, 'class', 'Yoga'),
                ],
            ],
        ]);

        // A paid receipt must retain the purchased names after master data edits.
        $tennis->update(['name' => 'Nama Baru yang Tidak Boleh Mengubah Riwayat']);
        $unit->update(['name' => 'Unit Baru']);

        $otherOrder = $this->paidOrder($otherUser, 50000);
        $otherOrder->transaction()->create([
            'user_id' => $otherUser->id,
            'amount' => 50000,
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);

        $response = $this->actingAs($user)
            ->getJson(route('user.transactions'))
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('meta.paid_total', 206000)
            ->assertJsonPath('data.0.id', $transaction->id)
            ->assertJsonPath('data.0.receipt_number', $transaction->receipt_number)
            ->assertJsonPath('data.0.service_kind', 'mixed')
            ->assertJsonPath('data.0.service_status', 'ongoing')
            ->assertJsonPath('data.0.items_count', 2)
            ->assertJsonPath('data.0.items.0.facility_name', 'Yoga')
            ->assertJsonPath(
                'data.0.items.0.image_url',
                '/storage/facilities/history-ticket.jpg',
            )
            ->assertJsonPath('data.0.items.0.kind', 'class')
            ->assertJsonPath('data.0.items.0.status', 'ongoing')
            ->assertJsonPath('data.0.items.1.facility_name', 'Lapangan Tenis')
            ->assertJsonPath('data.0.items.1.facility_unit_name', 'Lapangan Tennis 1')
            ->assertJsonPath('data.0.items.1.start_time', '12:00')
            ->assertJsonPath('data.0.items.1.end_time', '13:00');

        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertStringContainsString(
            'private',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertCount(1, $response->json('data'));
    }

    public function test_request_time_reconciliation_completes_ended_booking_but_keeps_payment_paid(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-07-26 10:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $facility = $this->facility(
            $this->category('Fasilitas Indoor', 'fasilitas-indoor'),
            'Lapangan Tenis',
            'lapangan-tenis',
        );
        $booking = Booking::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'booking_date' => '2026-07-26',
            'start_time' => '09:00',
            'end_time' => '10:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
        $transaction = $booking->transaction()->create([
            'user_id' => $user->id,
            'amount' => 100000,
            'payment_status' => 'PAID',
            'paid_at' => now()->subDay(),
        ]);

        $this->actingAs($user)
            ->getJson(route('user.transactions'))
            ->assertOk()
            ->assertJsonPath('data.0.service_status', 'completed')
            ->assertJsonPath('data.0.items.0.status', 'completed')
            ->assertJsonPath('data.0.payment_status', 'PAID');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'completed',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'payment_status' => 'PAID',
        ]);
    }

    public function test_cursor_history_has_no_twenty_transaction_cutoff_and_never_leaks_another_user(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        foreach (range(1, 25) as $index) {
            Transaction::create([
                'user_id' => $user->id,
                'transactionable_type' => Booking::class,
                'transactionable_id' => 1000 + $index,
                'amount' => $index * 1000,
                'payment_status' => 'PAID',
                'paid_at' => now(),
                'service_snapshot' => [
                    'version' => 1,
                    'kind' => 'booking',
                    'items' => [[
                        'booking_id' => 1000 + $index,
                        'kind' => 'facility',
                        'facility_name' => "Reservasi {$index}",
                        'booking_date' => '2026-08-01',
                        'start_time' => '08:00',
                        'end_time' => '09:00',
                        'subtotal' => $index * 1000,
                    ]],
                ],
            ]);
        }

        Transaction::create([
            'user_id' => $otherUser->id,
            'transactionable_type' => Booking::class,
            'transactionable_id' => 99999,
            'amount' => 999999,
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);

        $first = $this->actingAs($user)
            ->getJson(route('user.transactions', ['per_page' => 12]))
            ->assertOk()
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.has_more', true);

        $this->assertCount(12, $first->json('data'));
        $cursor = $first->json('meta.next_cursor');
        $this->assertIsString($cursor);

        $second = $this->actingAs($user)
            ->getJson(route('user.transactions', [
                'per_page' => 12,
                'cursor' => $cursor,
            ]))
            ->assertOk();

        $this->assertCount(12, $second->json('data'));
        $this->assertNotContains(
            999999,
            collect($first->json('data'))
                ->merge($second->json('data'))
                ->pluck('amount')
                ->all(),
        );
    }

    private function category(string $name, string $slug): FacilityCategory
    {
        return FacilityCategory::create([
            'name' => $name,
            'slug' => $slug,
        ]);
    }

    private function facility(
        FacilityCategory $category,
        string $name,
        string $slug,
        ?string $classCode = null,
    ): Facility {
        return Facility::create([
            'facility_category_id' => $category->id,
            'name' => $name,
            'slug' => $slug,
            'class_code' => $classCode,
            'location' => 'Veteran',
            'capacity' => 10,
            'is_active' => true,
        ]);
    }

    private function paidOrder(User $user, int $total): BookingOrder
    {
        return BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'identity_category' => 'umum',
            'subtotal_amount' => max(0, $total - 6000),
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => $total,
            'status' => 'paid',
            'expires_at' => now()->subMinute(),
        ]);
    }

    private function booking(
        BookingOrder $order,
        User $user,
        Facility $facility,
        string $date,
        string $start,
        string $end,
        int $subtotal,
        ?FacilityUnit $unit = null,
    ): Booking {
        return $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'facility_unit_id' => $unit?->id,
            'booking_date' => $date,
            'start_time' => $start,
            'end_time' => $end,
            'pax' => 1,
            'subtotal_price' => $subtotal,
            'status' => 'confirmed',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshot(
        Booking $booking,
        string $kind,
        string $facilityName,
        ?string $unitName = null,
    ): array {
        return [
            'booking_id' => $booking->id,
            'kind' => $kind,
            'facility_id' => $booking->facility_id,
            'facility_name' => $facilityName,
            'image_url' => '/storage/facilities/history-ticket.jpg',
            'facility_unit_id' => $booking->facility_unit_id,
            'facility_unit_name' => $unitName,
            'category_name' => $kind === 'class' ? 'Kelas Kebugaran' : 'Fasilitas Indoor',
            'location' => 'Veteran',
            'booking_date' => $booking->booking_date->toDateString(),
            'start_time' => substr((string) $booking->start_time, 0, 5),
            'end_time' => substr((string) $booking->end_time, 0, 5),
            'subtotal' => $booking->subtotal_price,
        ];
    }
}
