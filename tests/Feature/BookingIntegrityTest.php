<?php

namespace Tests\Feature;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use App\Services\AdminBookingReadModel;
use App\Services\BookingInventoryService;
use App\Services\BookingOrderExpiryService;
use App\Services\Payments\PaymentAttemptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class BookingIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_expired_pending_hold_is_ignored_while_live_hold_still_occupies_inventory(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00']);
        $user = User::factory()->create();

        $expiredOrder = $this->order($user, now()->subMinute());
        $this->booking($expiredOrder, $facility, $date, '08:00', '09:00');

        $liveOrder = $this->order($user, now()->addHour());
        $this->booking($liveOrder, $facility, $date, '09:00', '10:00');

        $this->getJson(route('booking.availability', [
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-07-21.facilities.0.status', 'limited')
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_slot_count', 1)
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_start_times', ['08:00']);

        $slots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->json('slots');

        $this->assertSame('available', $this->slot($slots, '08:00')['status']);
        $this->assertSame('booked', $this->slot($slots, '09:00')['status']);
    }

    public function test_checkout_revalidates_configured_and_occupied_slots_before_creating_hold(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config()->set('services.payment.hold_minutes', 30);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00']);
        $user = User::factory()->create();

        Booking::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);

        $this->actingAs(User::factory()->create())
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '10:00',
                '11:00',
            ))
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal tidak tersedia atau berada di luar jam operasional.',
            ]);

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '08:00',
                '09:00',
            ))
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);

        $this->actingAs(User::factory()->create())
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '09:00',
                '10:00',
            ))
            ->assertRedirect();

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertSame(
            now()->addMinutes(30)->timestamp,
            BookingOrder::query()->firstOrFail()->expires_at?->timestamp,
        );
        $this->assertDatabaseHas('bookings', [
            'facility_id' => $facility->id,
            'start_time' => '09:00',
            'end_time' => '10:00',
            'status' => 'pending',
        ]);

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '09:00',
                '10:00',
            ))
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('booking_orders', 1);
    }

    public function test_checkout_rejects_a_configured_slot_that_has_already_elapsed(): void
    {
        Carbon::setTestNow('2026-07-20 08:30:00');

        $date = Carbon::parse('2026-07-20');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '08:00',
                '09:00',
            ))
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal ini sudah berlalu. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('booking_orders', 0);
    }

    public function test_checkout_hold_uses_the_authenticated_profile_and_requires_contact_at_payment(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.mock' => true]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create([
            'name' => 'Pemilik Akun',
            'phone_number' => '+62 812-3456-7890',
        ]);
        $payload = $this->checkoutPayload(
            $facility,
            $date,
            '08:00',
            '09:00',
        );
        $payload['customer_name'] = 'Nama yang tidak boleh dipercaya';
        $payload['whatsapp_number'] = '628999999999';
        $payload['notes'] = 'Catatan yang belum dikonfirmasi di checkout.';

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $payload)
            ->assertRedirect();

        $order = BookingOrder::query()->sole();
        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'user_id' => $user->id,
            'customer_name' => 'Pemilik Akun',
            'whatsapp_number' => '6281234567890',
            'notes' => null,
            'status' => 'pending_payment',
        ]);
        $this->assertDatabaseHas('bookings', [
            'booking_order_id' => $order->id,
            'user_id' => $user->id,
            'customer_name' => 'Pemilik Akun',
            'customer_phone' => '6281234567890',
            'status' => 'pending',
        ]);

        $this->actingAs($user)
            ->from(route('checkout.booking.show', $order))
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => (string) Str::uuid(),
                'payment_method' => 'qris',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.show', $order))
            ->assertSessionHasErrors(['customer_name', 'whatsapp_number']);

        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('UNPAID', $order->transaction()->sole()->payment_status);
    }

    public function test_expiry_service_releases_pending_bookings_and_expires_transaction_atomically(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->subSecond());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $transaction = $order->transaction;
        $attempt = app(PaymentAttemptService::class)->createOrResume(
            $transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'expiring-booking-attempt'),
        );

        $this->assertSame(1, app(BookingOrderExpiryService::class)->expireDue());
        $this->assertSame(0, app(BookingOrderExpiryService::class)->expireDue());

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'expired',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'payment_status' => 'EXPIRED',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => 'expired',
        ]);
    }

    public function test_expiry_never_discards_a_verified_paid_attempt_in_a_split_state(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->subSecond());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $transaction = $order->transaction;
        $attempts = app(PaymentAttemptService::class);
        $attempt = $attempts->createOrResume(
            $transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'paid-split-booking-attempt'),
        );
        $attempt = $attempts->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );
        $attempt = $attempts->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $transaction->amount,
                currency: 'IDR',
                providerReference: 'split-'.$attempt->public_id,
            ),
        );

        $this->assertSame(0, app(BookingOrderExpiryService::class)->expireDue());
        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'pending_payment',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'payment_status' => 'UNPAID',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => 'paid',
        ]);
    }

    public function test_paid_attempt_keeps_an_expired_split_state_booking_unavailable_to_other_users(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $payingUser = User::factory()->create();
        $order = $this->order($payingUser, now()->subMinute());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $transaction = $order->transaction;
        $attempts = app(PaymentAttemptService::class);
        $attempt = $attempts->createOrResume(
            $transaction,
            $payingUser,
            (string) Str::uuid(),
            hash('sha256', 'paid-attempt-must-keep-booking-occupied'),
        );
        $attempt = $attempts->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );
        $attempts->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $transaction->amount,
                currency: 'IDR',
                providerReference: 'occupied-'.$attempt->public_id,
            ),
        );

        // The expiry worker must preserve the split state for reconciliation,
        // and every inventory reader must keep treating its slot as occupied.
        $this->assertFalse(
            app(BookingOrderExpiryService::class)->expireOrderIfDue($order->id),
        );
        $this->assertTrue(
            Booking::query()
                ->whereKey($booking->id)
                ->occupyingInventory()
                ->exists(),
        );

        $this->getJson(route('booking.availability', [
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('dates.2026-07-21.facilities.0.status', 'full')
            ->assertJsonPath('dates.2026-07-21.facilities.0.available_slot_count', 0);

        $slots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->json('slots');

        $this->assertSame('booked', $this->slot($slots, '08:00')['status']);

        $this->actingAs(User::factory()->create())
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '08:00',
                '09:00',
            ))
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'pending',
        ]);
    }

    public function test_legacy_paid_transaction_also_keeps_an_expired_split_state_booking_occupied(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $payingUser = User::factory()->create();
        $order = $this->order($payingUser, now()->subMinute());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $order->transaction->update([
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);

        $this->assertFalse(
            app(BookingOrderExpiryService::class)->expireOrderIfDue($order->id),
        );
        $this->assertTrue(
            Booking::query()
                ->whereKey($booking->id)
                ->occupyingInventory()
                ->exists(),
        );

        $this->actingAs(User::factory()->create())
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '08:00',
                '09:00',
            ))
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'pending',
        ]);
    }

    public function test_mock_payment_cannot_pay_an_expired_order_and_releases_its_hold(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.mock' => true]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->subSecond());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $transaction = $order->transaction;

        $this->actingAs($user)
            ->from(route('checkout.booking.show', $order))
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => (string) Str::uuid(),
                'payment_method' => 'qris',
                'customer_name' => $user->name,
                'whatsapp_number' => '628123456789',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.show', $order))
            ->assertSessionHasErrors([
                'payment_method' => 'Waktu pembayaran telah berakhir. Pilih kembali jadwal reservasi.',
            ]);

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'expired',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'payment_status' => 'EXPIRED',
        ]);
    }

    public function test_checkout_never_holds_inventory_without_a_callable_payment_channel(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.mock' => false]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();

        $this->actingAs($user)
            ->from(route('booking'))
            ->post(
                route('checkout.booking.store'),
                $this->checkoutPayload($facility, $date, '08:00', '09:00'),
            )
            ->assertRedirect(route('booking'))
            ->assertSessionHasErrors('checkout');

        $this->assertDatabaseCount('booking_orders', 0);
        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_payment_inside_the_safety_window_expires_without_creating_an_attempt(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config([
            'services.payment.mock' => true,
            'services.payment.submission_safety_seconds' => 3,
        ]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->addSeconds(2));
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');

        $this->actingAs($user)
            ->from(route('checkout.booking.show', $order))
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => (string) Str::uuid(),
                'payment_method' => 'qris',
                'customer_name' => $user->name,
                'whatsapp_number' => '628123456789',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.show', $order))
            ->assertSessionHasErrors('payment_method');

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'expired',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseCount('payment_attempts', 0);
    }

    public function test_second_tab_payment_conflict_returns_a_recoverable_error_without_duplicate_attempt(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.mock' => true]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->addHour());
        $this->booking($order, $facility, $date, '08:00', '09:00');

        $order->transaction->paymentAttempts()->create([
            'user_id' => $user->id,
            'attempt_number' => 1,
            'idempotency_key' => (string) Str::uuid(),
            'request_fingerprint' => hash('sha256', 'first-tab-qris-intent'),
            'amount' => (int) $order->transaction->amount,
            'currency' => 'IDR',
            'status' => PaymentAttemptStatus::Pending,
            'expires_at' => $order->expires_at,
            'metadata' => [
                'channel' => 'local_mock',
                'payment_method' => 'qris',
                'subject_kind' => 'booking_order',
            ],
        ]);

        $this->actingAs($user)
            ->from(route('checkout.booking.show', $order))
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => (string) Str::uuid(),
                'payment_method' => 'card',
                'customer_name' => $user->name,
                'whatsapp_number' => '628123456789',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.show', $order))
            ->assertSessionHasErrors('payment_method');

        $this->assertDatabaseCount('payment_attempts', 1);
        $this->assertDatabaseHas('transactions', [
            'id' => $order->transaction->id,
            'payment_status' => 'UNPAID',
        ]);
        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'pending_payment',
        ]);
    }

    public function test_booking_contention_hot_paths_have_dedicated_indexes(): void
    {
        $this->assertTrue(Schema::hasIndex(
            'bookings',
            'bookings_inventory_lock_idx',
        ));
        $this->assertTrue(Schema::hasIndex(
            'booking_orders',
            'booking_orders_user_live_hold_idx',
        ));
        $this->assertTrue(Schema::hasIndex(
            'booking_orders',
            'booking_orders_user_fingerprint_idx',
        ));
    }

    public function test_checkout_prices_each_source_slot_before_merging_across_a_price_boundary(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00']);
        $facility->prices()->create([
            'user_category' => 'umum',
            'label' => 'Tarif khusus pukul sembilan',
            'price' => 200000,
            'duration_minutes' => 60,
            'schedule_type' => 'weekly',
            'applicable_days' => [$date->format('l')],
            'starts_at' => '09:00',
            'ends_at' => '10:00',
            'sort_order' => 1,
        ]);
        $user = User::factory()->create();

        $payload = $this->checkoutPayload($facility, $date, '08:00', '09:00');
        $payload['items'][] = [
            'facility_id' => $facility->id,
            'facility_unit_id' => null,
            'booking_date' => $date->toDateString(),
            'start_time' => '09:00',
            'end_time' => '10:00',
        ];

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $payload)
            ->assertRedirect();

        $order = BookingOrder::query()->with(['bookings', 'transaction'])->firstOrFail();
        $this->assertSame(300000, $order->subtotal_amount);
        $this->assertSame(306000, $order->total_amount);
        $this->assertCount(1, $order->bookings);
        $this->assertSame('08:00', substr((string) $order->bookings[0]->start_time, 0, 5));
        $this->assertSame('10:00', substr((string) $order->bookings[0]->end_time, 0, 5));
        $this->assertSame(300000, (int) $order->bookings[0]->subtotal_price);
        $this->assertSame(300000, (int) data_get($order->transaction->service_snapshot, 'items.0.subtotal'));
        $this->assertCount(2, data_get($order->transaction->service_snapshot, 'items.0.source_pricing'));
    }

    public function test_checkout_fails_closed_when_the_selected_price_is_missing(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $facility->prices()->delete();
        $user = User::factory()->create();

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $this->checkoutPayload(
                $facility,
                $date,
                '08:00',
                '09:00',
            ))
            ->assertSessionHasErrors('items');

        $this->assertDatabaseCount('booking_orders', 0);
        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_mock_payment_rejects_a_broken_booking_order_aggregate(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.mock' => true]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->addHour());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $booking->update(['status' => 'cancelled']);

        $this->actingAs($user)
            ->from(route('checkout.booking.show', $order))
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => (string) Str::uuid(),
                'payment_method' => 'qris',
                'customer_name' => $user->name,
                'whatsapp_number' => '628123456789',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.show', $order))
            ->assertSessionHasErrors('payment_method');

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'pending_payment',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $order->transaction->id,
            'payment_status' => 'UNPAID',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_expiry_repairs_a_confirmed_child_under_an_unpaid_order(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $order = $this->order($user, now()->subSecond());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $booking->update(['status' => 'confirmed']);

        $this->assertTrue(app(BookingOrderExpiryService::class)->expireOrderIfDue($order->id));

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_admin_cannot_confirm_an_unpaid_public_booking_child(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $customer = User::factory()->create();
        $staff = $this->staffUser();
        $order = $this->order($customer, now()->addHour());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');

        $this->actingAs($staff)
            ->patch(route('admin.bookings.update', $booking), [
                'status' => 'confirmed',
                'state_version' => $this->bookingStateVersion($booking),
            ])
            ->assertSessionHasErrors([
                'status' => 'Booking hanya dapat dikonfirmasi setelah pembayaran lunas.',
            ]);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $order->transaction->id,
            'payment_status' => 'UNPAID',
        ]);
    }

    public function test_admin_cancellation_terminalizes_open_booking_payment_attempts(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $customer = User::factory()->create();
        $staff = $this->staffUser();
        $order = $this->order($customer, now()->addHour());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $attempt = app(PaymentAttemptService::class)->createOrResume(
            $order->transaction,
            $customer,
            (string) Str::uuid(),
            hash('sha256', 'booking-admin-cancel-open-attempt'),
        );

        $this->actingAs($staff)
            ->delete(route('admin.bookings.destroy', $booking), [
                'state_version' => $this->bookingStateVersion($booking),
            ])
            ->assertRedirect()
            ->assertSessionDoesntHaveErrors();

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $order->transaction->id,
            'payment_status' => 'FAILED',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => PaymentAttemptStatus::Cancelled->value,
        ]);
    }

    public function test_admin_status_action_rejects_a_stale_operational_state(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $booking = Booking::create([
            'customer_name' => 'Pelanggan Bersamaan',
            'facility_id' => $facility->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);
        $booking->transaction()->create([
            'amount' => 100000,
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);
        $staleStateVersion = $this->bookingStateVersion($booking);

        // Simulate another staff member confirming the booking after this
        // browser opened its detail panel.
        $booking->update(['status' => 'confirmed']);

        $this->actingAs($this->staffUser())
            ->from(route('admin.bookings.index'))
            ->delete(route('admin.bookings.destroy', $booking), [
                'state_version' => $staleStateVersion,
            ])
            ->assertRedirect(route('admin.bookings.index'))
            ->assertSessionHasErrors([
                'state_version' => 'Data booking berubah sejak panel dibuka. Muat ulang detail sebelum melanjutkan.',
            ]);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'confirmed',
        ]);
    }

    public function test_admin_cannot_cancel_booking_during_a_paid_attempt_split_state(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $customer = User::factory()->create();
        $staff = $this->staffUser();
        $order = $this->order($customer, now()->addHour());
        $booking = $this->booking($order, $facility, $date, '08:00', '09:00');
        $attempts = app(PaymentAttemptService::class);
        $attempt = $attempts->createOrResume(
            $order->transaction,
            $customer,
            (string) Str::uuid(),
            hash('sha256', 'booking-admin-cancel-paid-split'),
        );
        $attempt = $attempts->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );
        $attempt = $attempts->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $order->transaction->amount,
                currency: 'IDR',
                providerReference: 'split-'.$attempt->public_id,
            ),
        );

        $this->actingAs($staff)
            ->from(route('admin.bookings.index'))
            ->delete(route('admin.bookings.destroy', $booking), [
                'state_version' => $this->bookingStateVersion($booking),
            ])
            ->assertRedirect(route('admin.bookings.index'))
            ->assertSessionHasErrors('status');

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'pending_payment',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $order->transaction->id,
            'payment_status' => 'UNPAID',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => PaymentAttemptStatus::Paid->value,
        ]);
    }

    public function test_admin_writer_revalidates_a_live_public_hold_inside_its_transaction(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $customer = User::factory()->create();
        $staff = $this->staffUser();
        $order = $this->order($customer, now()->addHour());
        $this->booking($order, $facility, $date, '08:00', '09:00');

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), [
                'customer_name' => 'Walk-in Kedua',
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'pax' => 1,
                'is_free' => false,
            ])
            ->assertSessionHasErrors([
                'start_time' => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('bookings', 1);
    }

    public function test_admin_writer_normalizes_the_walk_in_contact_and_does_not_publish_an_internal_checkout_link(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);

        $this->actingAs($this->staffUser())
            ->post(route('admin.bookings.store'), [
                'customer_name' => '  Pelanggan Walk-in  ',
                'customer_phone' => '+62 812-3456-7890',
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'pax' => 1,
                'is_free' => false,
            ])
            ->assertRedirect(route('admin.bookings.index'));

        $booking = Booking::query()->sole();

        $this->assertSame('Pelanggan Walk-in', $booking->customer_name);
        $this->assertSame('6281234567890', $booking->customer_phone);
        $this->assertNull($booking->transaction?->checkout_url);
        $this->assertSame('UNPAID', $booking->transaction?->payment_status);
    }

    public function test_admin_writer_rejects_a_slot_that_has_already_elapsed_today(): void
    {
        Carbon::setTestNow('2026-07-20 09:00:00');

        $date = Carbon::parse('2026-07-20');
        $facility = $this->facility($date, ['08:00']);

        $this->actingAs($this->staffUser())
            ->post(route('admin.bookings.store'), [
                'customer_name' => 'Pelanggan Terlambat',
                'customer_phone' => '081234567890',
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'pax' => 1,
                'is_free' => false,
            ])
            ->assertSessionHasErrors([
                'start_time' => 'Jadwal ini sudah berlalu. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_admin_price_calculation_splits_an_interval_at_pricing_rule_edges(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00']);
        $facility->prices()->create([
            'user_category' => 'umum',
            'label' => 'Tarif khusus pukul sembilan',
            'price' => 200000,
            'duration_minutes' => 60,
            'schedule_type' => 'weekly',
            'applicable_days' => [$date->format('l')],
            'starts_at' => '09:00',
            'ends_at' => '10:00',
            'sort_order' => 1,
        ]);
        $staff = $this->staffUser();

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), [
                'customer_name' => 'Walk-in Harga Gabungan',
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => '08:00',
                'end_time' => '10:00',
                'pax' => 1,
                'is_free' => false,
            ])
            ->assertRedirect(route('admin.bookings.index'));

        $this->assertDatabaseHas('bookings', [
            'facility_id' => $facility->id,
            'start_time' => '08:00',
            'end_time' => '10:00',
            'subtotal_price' => 300000,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('transactions', [
            'amount' => 300000,
            'payment_status' => 'UNPAID',
        ]);
    }

    public function test_arena_remains_exclusive_even_if_its_generic_capacity_is_greater_than_one(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $facility->update(['capacity' => 20]);
        Booking::create([
            'customer_name' => 'Pemesan Pertama',
            'facility_id' => $facility->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);

        $this->actingAs($this->staffUser())
            ->post(route('admin.bookings.store'), [
                'customer_name' => 'Pemesan Kedua',
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'pax' => 1,
                'is_free' => false,
            ])
            ->assertSessionHasErrors('start_time');

        $this->assertDatabaseCount('bookings', 1);
    }

    public function test_class_inventory_uses_participant_capacity_instead_of_exclusive_arena_rules(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $facility->category()->update(['name' => 'Kelas', 'slug' => 'kelas']);
        $facility->update(['capacity' => 3]);
        Booking::create([
            'customer_name' => 'Dua Peserta',
            'facility_id' => $facility->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 2,
            'subtotal_price' => 200000,
            'status' => 'confirmed',
        ]);
        $staff = $this->staffUser();

        $payload = [
            'customer_name' => 'Peserta Ketiga',
            'facility_id' => $facility->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'is_free' => false,
        ];

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), $payload)
            ->assertRedirect(route('admin.bookings.index'));

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), [
                ...$payload,
                'customer_name' => 'Peserta Keempat',
            ])
            ->assertSessionHasErrors('start_time');

        $this->assertDatabaseCount('bookings', 2);
    }

    public function test_class_capacity_uses_peak_simultaneous_occupancy_instead_of_summing_sequential_rows(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00']);
        $facility->category()->update(['name' => 'Kelas', 'slug' => 'kelas']);
        $facility->update(['capacity' => 2]);

        foreach ([['08:00', '09:00'], ['09:00', '10:00']] as [$start, $end]) {
            Booking::create([
                'customer_name' => 'Peserta Berurutan '.$start,
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => $start,
                'end_time' => $end,
                'pax' => 1,
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
        }

        $this->actingAs($this->staffUser())
            ->post(route('admin.bookings.store'), [
                'customer_name' => 'Peserta Sepanjang Sesi',
                'facility_id' => $facility->id,
                'booking_date' => $date->toDateString(),
                'start_time' => '08:00',
                'end_time' => '10:00',
                'pax' => 1,
                'is_free' => false,
            ])
            ->assertRedirect(route('admin.bookings.index'));

        $this->assertDatabaseCount('bookings', 3);
        $this->assertDatabaseHas('bookings', [
            'customer_name' => 'Peserta Sepanjang Sesi',
            'start_time' => '08:00',
            'end_time' => '10:00',
            'pax' => 1,
        ]);
    }

    public function test_post_write_capacity_invariant_rolls_back_an_oversold_row(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);

        try {
            DB::transaction(function () use ($facility, $date): void {
                $inventory = app(BookingInventoryService::class);
                $locked = $inventory->lockResources([$facility->id]);
                $booking = Booking::create([
                    'customer_name' => 'Invariant Probe',
                    'facility_id' => $facility->id,
                    'booking_date' => $date->toDateString(),
                    'start_time' => '08:00',
                    'end_time' => '09:00',
                    'pax' => 2,
                    'subtotal_price' => 200000,
                    'status' => 'confirmed',
                ]);

                $inventory->assertPersistedBookingsWithinCapacity(
                    collect([$booking]),
                    $locked['facilities'],
                    $locked['units'],
                );
            });

            $this->fail('Invariant pascatulis seharusnya menolak kapasitas berlebih.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('items', $exception->errors());
        }

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_class_unit_keeps_shared_capacity_while_sibling_unit_has_independent_inventory(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $facility->category()->update(['name' => 'Kelas & Kebugaran', 'slug' => 'kelas-kebugaran']);
        $facility->update(['capacity' => 3, 'class_code' => 'Class 001']);
        $unitOne = $facility->units()->create([
            'name' => 'Studio 1',
            'is_active' => true,
        ]);
        $unitTwo = $facility->units()->create([
            'name' => 'Studio 2',
            'is_active' => true,
        ]);

        Booking::create([
            'customer_name' => 'Dua Peserta',
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitOne->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 2,
            'subtotal_price' => 200000,
            'status' => 'confirmed',
        ]);

        $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitOne->id,
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('slots.0.status', 'available')
            ->assertJsonPath('slots.0.capacity', 3)
            ->assertJsonPath('slots.0.shared_capacity', true)
            ->assertJsonPath('slots.0.occupied', 2)
            ->assertJsonPath('slots.0.remaining', 1);

        $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitTwo->id,
            'date' => $date->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonPath('slots.0.status', 'available')
            ->assertJsonPath('slots.0.capacity', 3)
            ->assertJsonPath('slots.0.occupied', 0)
            ->assertJsonPath('slots.0.remaining', 3);

        $staff = $this->staffUser();
        $payload = [
            'customer_name' => 'Peserta Ketiga',
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitOne->id,
            'booking_date' => $date->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'is_free' => false,
        ];

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), $payload)
            ->assertRedirect(route('admin.bookings.index'));

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), [
                ...$payload,
                'customer_name' => 'Peserta Keempat',
            ])
            ->assertSessionHasErrors('start_time');

        $this->assertDatabaseCount('bookings', 2);
    }

    public function test_checkout_retry_with_the_same_key_returns_one_logical_order(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $payload = $this->checkoutPayload($facility, $date, '08:00', '09:00');

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $payload)
            ->assertRedirect();

        $order = BookingOrder::query()->firstOrFail();

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $payload)
            ->assertRedirect(route('checkout.booking.show', $order));

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_same_live_cart_with_a_second_key_resumes_the_existing_order(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $user = User::factory()->create();
        $first = $this->checkoutPayload($facility, $date, '08:00', '09:00');

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $first)
            ->assertRedirect();

        $order = BookingOrder::query()->firstOrFail();
        $second = [
            ...$first,
            'idempotency_key' => (string) Str::uuid(),
        ];

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $second)
            ->assertRedirect(route('checkout.booking.show', $order));

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_an_idempotency_key_cannot_be_reused_for_another_cart_or_user(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00']);
        $firstUser = User::factory()->create();
        $secondUser = User::factory()->create();
        $payload = $this->checkoutPayload($facility, $date, '08:00', '09:00');

        $this->actingAs($firstUser)
            ->post(route('checkout.booking.store'), $payload)
            ->assertRedirect();

        $differentCart = [
            ...$payload,
            'items' => [[
                ...$payload['items'][0],
                'start_time' => '09:00',
                'end_time' => '10:00',
            ]],
        ];

        $this->actingAs($firstUser)
            ->post(route('checkout.booking.store'), $differentCart)
            ->assertSessionHasErrors('idempotency_key');

        $this->actingAs($secondUser)
            ->post(route('checkout.booking.store'), $payload)
            ->assertSessionHasErrors('idempotency_key');

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_two_customers_cannot_hold_the_same_exclusive_slot(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00']);
        $firstUser = User::factory()->create();
        $secondUser = User::factory()->create();

        $this->actingAs($firstUser)
            ->post(
                route('checkout.booking.store'),
                $this->checkoutPayload($facility, $date, '08:00', '09:00'),
            )
            ->assertRedirect();

        $this->actingAs($secondUser)
            ->post(
                route('checkout.booking.store'),
                $this->checkoutPayload($facility, $date, '08:00', '09:00'),
            )
            ->assertSessionHasErrors([
                'items.0.start_time' => 'Jadwal ini baru saja terisi. Pilih waktu lain.',
            ]);

        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_checkout_limits_live_unpaid_orders_per_user(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.booking_max_open_holds' => 2]);

        $date = Carbon::parse('2026-07-21');
        $facility = $this->facility($date, ['08:00', '09:00', '10:00']);
        $user = User::factory()->create();

        foreach ([['08:00', '09:00'], ['09:00', '10:00']] as [$start, $end]) {
            $this->actingAs($user)
                ->post(
                    route('checkout.booking.store'),
                    $this->checkoutPayload($facility, $date, $start, $end),
                )
                ->assertRedirect();
        }

        $this->actingAs($user)
            ->post(
                route('checkout.booking.store'),
                $this->checkoutPayload($facility, $date, '10:00', '11:00'),
            )
            ->assertSessionHasErrors('items');

        $this->assertDatabaseCount('booking_orders', 2);
        $this->assertDatabaseCount('bookings', 2);
        $this->assertDatabaseCount('transactions', 2);
    }

    public function test_checkout_rejects_more_than_the_configured_cart_limit(): void
    {
        Carbon::setTestNow('2026-07-20 05:00:00');
        config(['services.payment.booking_max_items' => 8]);

        $date = Carbon::parse('2026-07-21');
        $starts = collect(range(8, 16))
            ->map(fn (int $hour): string => sprintf('%02d:00', $hour))
            ->all();
        $facility = $this->facility($date, $starts);
        $user = User::factory()->create();
        $payload = $this->checkoutPayload($facility, $date, '08:00', '09:00');
        $payload['items'] = collect($starts)
            ->map(fn (string $start, int $index): array => [
                'facility_id' => $facility->id,
                'facility_unit_id' => null,
                'booking_date' => $date->toDateString(),
                'start_time' => $start,
                'end_time' => sprintf('%02d:00', 9 + $index),
            ])
            ->all();

        $this->actingAs($user)
            ->post(route('checkout.booking.store'), $payload)
            ->assertSessionHasErrors('items');

        $this->assertDatabaseCount('booking_orders', 0);
        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('transactions', 0);
    }

    /**
     * @param  array<int, string>  $starts
     */
    private function facility(Carbon $date, array $starts): Facility
    {
        $category = FacilityCategory::create([
            'name' => 'Lapangan',
            'slug' => 'lapangan',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Tenis',
            'slug' => 'lapangan-tenis',
            'capacity' => 1,
            'active_slots' => [
                $date->format('l') => $starts,
            ],
            'is_active' => true,
        ]);

        $facility->prices()->create([
            'user_category' => 'umum',
            'label' => 'Reguler',
            'price' => 100000,
            'duration_minutes' => 60,
            'schedule_type' => 'regular',
            'sort_order' => 0,
        ]);

        BookingSchedule::create([
            'month' => $date->month,
            'year' => $date->year,
            'is_open' => true,
            'closed_dates' => [],
        ]);

        return $facility;
    }

    private function staffUser(): User
    {
        Permission::firstOrCreate([
            'name' => 'manage-bookings',
            'guard_name' => 'web',
        ]);
        $role = Role::firstOrCreate([
            'name' => 'Staff Central',
            'guard_name' => 'web',
        ]);
        $role->syncPermissions(['manage-bookings']);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }

    private function bookingStateVersion(Booking $booking): string
    {
        return (string) app(AdminBookingReadModel::class)
            ->detail($booking)['state_version'];
    }

    private function order(User $user, Carbon $expiresAt): BookingOrder
    {
        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => $expiresAt,
        ]);

        $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            'checkout_url' => route('checkout.booking.show', $order),
        ]);

        return $order->load('transaction');
    }

    private function booking(
        BookingOrder $order,
        Facility $facility,
        Carbon $date,
        string $start,
        string $end,
    ): Booking {
        return $order->bookings()->create([
            'user_id' => $order->user_id,
            'customer_name' => $order->customer_name,
            'facility_id' => $facility->id,
            'booking_date' => $date->toDateString(),
            'start_time' => $start,
            'end_time' => $end,
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function checkoutPayload(
        Facility $facility,
        Carbon $date,
        string $start,
        string $end,
    ): array {
        return [
            'idempotency_key' => (string) Str::uuid(),
            'items' => [[
                'facility_id' => $facility->id,
                'facility_unit_id' => null,
                'booking_date' => $date->toDateString(),
                'start_time' => $start,
                'end_time' => $end,
            ]],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $slots
     * @return array<string, mixed>
     */
    private function slot(array $slots, string $startTime): array
    {
        $slot = collect($slots)->firstWhere('start_time', $startTime);

        $this->assertIsArray($slot);

        return $slot;
    }
}
