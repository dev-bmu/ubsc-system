<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PaymentFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_order_stores_gateway_neutral_payment_metadata(): void
    {
        $key = (string) Str::uuid();

        $order = $this->bookingOrder(User::factory()->create(), [
            'idempotency_key' => $key,
            'request_fingerprint' => hash('sha256', 'stable checkout payload'),
            'terms_version' => 'booking-terms-2026-08',
        ])->refresh();

        $this->assertSame($key, $order->idempotency_key);
        $this->assertSame(hash('sha256', 'stable checkout payload'), $order->request_fingerprint);
        $this->assertSame('IDR', $order->currency);
        $this->assertSame('booking-terms-2026-08', $order->terms_version);
    }

    public function test_booking_order_idempotency_key_is_unique_at_the_database_boundary(): void
    {
        $key = (string) Str::uuid();

        $this->bookingOrder(User::factory()->create(), ['idempotency_key' => $key]);

        $this->expectException(QueryException::class);

        $this->bookingOrder(User::factory()->create(), ['idempotency_key' => $key]);
    }

    public function test_only_one_logical_transaction_can_belong_to_a_subject(): void
    {
        $user = User::factory()->create();
        $order = $this->bookingOrder($user);

        $this->transaction($order, $user);

        $this->expectException(QueryException::class);

        $this->transaction($order, $user);
    }

    public function test_transaction_history_survives_user_deletion(): void
    {
        $user = User::factory()->create();
        $order = $this->bookingOrder($user);
        $transaction = $this->transaction($order, $user);

        $user->delete();

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'user_id' => null,
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'user_id' => null,
            'amount' => 106000,
        ]);
    }

    public function test_booking_mutation_routes_use_named_rate_limiters(): void
    {
        $checkoutRoute = Route::getRoutes()->getByName('checkout.booking.store');
        $paymentRoute = Route::getRoutes()->getByName('checkout.booking.mock-pay');

        $this->assertNotNull($checkoutRoute);
        $this->assertNotNull($paymentRoute);
        $this->assertIsCallable(RateLimiter::limiter('booking-checkout'));
        $this->assertIsCallable(RateLimiter::limiter('booking-payment'));
        $this->assertContains('throttle:booking-checkout', $checkoutRoute->gatherMiddleware());
        $this->assertContains('throttle:booking-payment', $paymentRoute->gatherMiddleware());
    }

    public function test_admin_simulation_fails_closed_for_a_booking_order(): void
    {
        $staff = $this->staffUser('Finance', ['manage-payment-links']);
        $customer = User::factory()->create();
        $order = $this->bookingOrder($customer);
        $transaction = $this->transaction($order, $customer);

        $this->actingAs($staff)
            ->post(route('admin.transactions.simulate-pay', $transaction))
            ->assertStatus(409);

        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertNull($transaction->fresh()->paid_at);
    }

    public function test_finance_report_classifies_booking_orders_as_booking_revenue(): void
    {
        $staff = $this->staffUser('Finance', ['view-reports']);
        $customer = User::factory()->create();
        $order = $this->bookingOrder($customer, ['status' => 'paid']);
        $category = FacilityCategory::create([
            'name' => 'Arena',
            'slug' => 'arena-payment-foundation',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Arena Laporan',
            'slug' => 'arena-laporan',
            'capacity' => 1,
            'is_active' => true,
        ]);
        $order->bookings()->create([
            'user_id' => $customer->id,
            'customer_name' => $customer->name,
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
        $this->transaction($order, $customer, [
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);

        $this->actingAs($staff)
            ->get(route('admin.finance.index', [
                'month' => now()->month,
                'year' => now()->year,
            ]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Finance/Index')
                ->where('stats.totalRevenue', 106000)
                ->where('stats.bookingRevenue', 106000)
                ->where('stats.membershipRevenue', 0)
                ->where('typeBreakdown.0.type', 'booking')
                ->where('typeBreakdown.0.revenue', 106000)
                ->where('facilityRevenue.0.name', 'Arena Laporan')
                ->where('facilityRevenue.0.revenue', 106000)
                ->where('ledger.0.type', 'booking')
                ->where('recentTransactions.0.type', 'booking'));
    }

    public function test_admin_confirmation_of_a_direct_booking_is_atomic_and_inventory_safe(): void
    {
        $staff = $this->staffUser('Finance', ['manage-payment-links']);
        $category = FacilityCategory::create([
            'name' => 'Arena',
            'slug' => 'arena-direct-confirmation',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Arena Konfirmasi',
            'slug' => 'arena-konfirmasi',
            'capacity' => 1,
            'is_active' => true,
        ]);
        $booking = Booking::create([
            'customer_name' => 'Walk-in Aman',
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);
        $transaction = Transaction::create([
            'transactionable_type' => Booking::class,
            'transactionable_id' => $booking->id,
            'amount' => 100000,
            'payment_status' => 'UNPAID',
        ]);

        $this->actingAs($staff)
            ->post(route('admin.transactions.simulate-pay', $transaction))
            ->assertRedirect();

        $this->assertSame('confirmed', $booking->fresh()->status);
        $this->assertSame('PAID', $transaction->fresh()->payment_status);
        $this->assertNotNull($transaction->fresh()->paid_at);
    }

    public function test_admin_confirmation_fails_closed_if_legacy_inventory_is_conflicted(): void
    {
        $staff = $this->staffUser('Finance', ['manage-payment-links']);
        $category = FacilityCategory::create([
            'name' => 'Arena',
            'slug' => 'arena-conflict-confirmation',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Arena Konflik',
            'slug' => 'arena-konflik',
            'capacity' => 1,
            'is_active' => true,
        ]);
        $attributes = [
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
        ];
        Booking::create([
            ...$attributes,
            'customer_name' => 'Pemilik Slot',
            'status' => 'confirmed',
        ]);
        $pending = Booking::create([
            ...$attributes,
            'customer_name' => 'Data Legacy Bertabrakan',
            'status' => 'pending',
        ]);
        $transaction = Transaction::create([
            'transactionable_type' => Booking::class,
            'transactionable_id' => $pending->id,
            'amount' => 100000,
            'payment_status' => 'UNPAID',
        ]);

        $this->actingAs($staff)
            ->post(route('admin.transactions.simulate-pay', $transaction))
            ->assertSessionHasErrors('payment_status');

        $this->assertSame('pending', $pending->fresh()->status);
        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertNull($transaction->fresh()->paid_at);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function bookingOrder(User $user, array $overrides = []): BookingOrder
    {
        return BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function transaction(
        BookingOrder $order,
        User $user,
        array $overrides = [],
    ): Transaction {
        return Transaction::create([
            'user_id' => $user->id,
            'transactionable_type' => BookingOrder::class,
            'transactionable_id' => $order->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            ...$overrides,
        ]);
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function staffUser(string $roleName, array $permissions): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
        $role->syncPermissions($permissions);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($roleName);

        return $user;
    }
}
