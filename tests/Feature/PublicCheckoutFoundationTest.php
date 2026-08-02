<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\FacilityPrice;
use App\Models\FacilityUnit;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PublicCheckoutFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_order_groups_bookings_and_owns_transaction(): void
    {
        $user = User::factory()->create();
        $facility = $this->facility();

        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => 'Fahri UBSC',
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);

        $booking = $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => 'Fahri UBSC',
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00',
            'end_time' => '10:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);

        $transaction = $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            'checkout_url' => route('checkout.booking.show', $order),
        ]);

        $this->assertTrue($order->bookings->contains($booking));
        $this->assertTrue($booking->bookingOrder->is($order));
        $this->assertTrue($order->transaction->is($transaction));
        $this->assertSame('UBSC-'.str_pad((string) $transaction->id, 6, '0', STR_PAD_LEFT), $transaction->receipt_number);
    }

    public function test_mock_payment_marks_order_transaction_and_bookings_paid(): void
    {
        config(['services.payment.mock' => true]);

        $user = User::factory()->create();
        $facility = $this->facility();

        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => 'Fahri UBSC',
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);

        $booking = Booking::create([
            'booking_order_id' => $order->id,
            'user_id' => $user->id,
            'customer_name' => 'Fahri UBSC',
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00',
            'end_time' => '10:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);

        $transaction = Transaction::create([
            'user_id' => $user->id,
            'transactionable_id' => $order->id,
            'transactionable_type' => BookingOrder::class,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            'checkout_url' => route('checkout.booking.show', $order),
        ]);
        $paymentKey = (string) Str::uuid();

        $this->actingAs($user)
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => $paymentKey,
                'payment_method' => 'qris',
                'customer_name' => 'Fahri UBSC',
                'whatsapp_number' => '628123456789',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.success', $order));

        $this->actingAs($user)
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => $paymentKey,
                'payment_method' => 'qris',
                'customer_name' => 'Fahri UBSC',
                'whatsapp_number' => '628123456789',
                'identity_category' => 'umum',
            ])
            ->assertRedirect(route('checkout.booking.success', $order));

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'status' => 'paid',
        ]);

        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'payment_status' => 'PAID',
        ]);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'confirmed',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'transaction_id' => $transaction->id,
            'idempotency_key' => $paymentKey,
            'amount' => 106000,
            'currency' => 'IDR',
            'status' => 'paid',
        ]);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_mock_booking_payment_is_unavailable_in_production(): void
    {
        config(['services.payment.mock' => true]);

        $user = User::factory()->create();
        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => 'Production Guard',
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);

        $this->withoutMiddleware(\App\Http\Middleware\EnforceCanonicalHost::class);
        $this->app->detectEnvironment(fn () => 'production');

        $this->actingAs($user)
            ->withSession(['_token' => 'production-mock-guard'])
            ->withHeader('X-CSRF-TOKEN', 'production-mock-guard')
            ->post(route('checkout.booking.mock-pay', $order))
            ->assertNotFound();

        $this->assertSame('pending_payment', $order->fresh()->status);
    }

    public function test_mock_payment_persists_final_customer_checkout_data(): void
    {
        config(['services.payment.mock' => true]);

        $user = User::factory()->create();
        $facility = $this->facility();

        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => 'Draft Name',
            'whatsapp_number' => '620000000',
            'identity_category' => 'warga_ub',
            'identity_number' => '225150700111001',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);

        $booking = Booking::create([
            'booking_order_id' => $order->id,
            'user_id' => $user->id,
            'customer_name' => 'Draft Name',
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00',
            'end_time' => '10:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);

        $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            'checkout_url' => route('checkout.booking.show', $order),
        ]);

        $this->actingAs($user)
            ->post(route('checkout.booking.mock-pay', $order), [
                'idempotency_key' => (string) Str::uuid(),
                'payment_method' => 'bca_va',
                'customer_name' => 'Fahri Checkout',
                'whatsapp_number' => '+628123456789',
                'identity_category' => 'warga_ub',
                'identity_number' => '225150700111001',
                'notes' => 'Datang 10 menit lebih awal.',
            ])
            ->assertRedirect(route('checkout.booking.success', $order));

        $this->assertDatabaseHas('booking_orders', [
            'id' => $order->id,
            'customer_name' => 'Fahri Checkout',
            'whatsapp_number' => '+628123456789',
            'identity_category' => 'warga_ub',
            'identity_number' => '225150700111001',
            'notes' => 'Datang 10 menit lebih awal.',
            'status' => 'paid',
        ]);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'customer_name' => 'Fahri Checkout',
            'notes' => 'Datang 10 menit lebih awal.',
            'status' => 'confirmed',
        ]);
    }

    public function test_checkout_summary_uses_the_best_available_facility_image(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        $category = FacilityCategory::create([
            'name' => 'Arena checkout',
            'slug' => 'arena-checkout',
        ]);

        $makeFacility = fn (string $name, string $slug) => Facility::create([
            'facility_category_id' => $category->id,
            'name' => $name,
            'slug' => $slug,
            'capacity' => 1,
            'is_active' => true,
        ]);

        $unitFacility = $makeFacility('Arena Unit', 'arena-unit');
        $unitFacility
            ->addMedia(UploadedFile::fake()->create('facility-hero.jpg', 4, 'image/jpeg'))
            ->toMediaCollection('hero', 'public');
        $unit = FacilityUnit::create([
            'facility_id' => $unitFacility->id,
            'name' => 'Unit Bergambar',
            'is_active' => true,
        ]);
        $unit
            ->addMedia(UploadedFile::fake()->create('unit-image.jpg', 4, 'image/jpeg'))
            ->toMediaCollection('unit_image', 'public');

        $heroFacility = $makeFacility('Arena Hero', 'arena-hero');
        $heroFacility
            ->addMedia(UploadedFile::fake()->create('hero-fallback.jpg', 4, 'image/jpeg'))
            ->toMediaCollection('hero', 'public');

        $galleryFacility = $makeFacility('Arena Galeri', 'arena-galeri');
        $galleryFacility
            ->addMedia(UploadedFile::fake()->create('gallery-fallback.jpg', 4, 'image/jpeg'))
            ->toMediaCollection('gallery', 'public');

        $emptyFacility = $makeFacility('Arena Tanpa Gambar', 'arena-tanpa-gambar');

        $order = BookingOrder::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 400000,
            'transaction_fee' => 0,
            'discount_amount' => 0,
            'total_amount' => 400000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);

        collect([
            [$unitFacility, $unit],
            [$heroFacility, null],
            [$galleryFacility, null],
            [$emptyFacility, null],
        ])->each(function (array $item, int $index) use ($order, $user): void {
            [$facility, $unit] = $item;

            $order->bookings()->create([
                'user_id' => $user->id,
                'customer_name' => $user->name,
                'facility_id' => $facility->id,
                'facility_unit_id' => $unit?->id,
                'booking_date' => now()->addDays($index + 1)->toDateString(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'pax' => 1,
                'subtotal_price' => 100000,
                'status' => 'pending',
            ]);
        });

        $this->actingAs($user)
            ->get(route('checkout.booking.show', $order))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Checkout/BookingCheckoutPage')
                ->where(
                    'serverNow',
                    fn ($value) => is_string($value) && strtotime($value) !== false,
                )
                ->where(
                    'bookingOrder.bookings.0.image_url',
                    fn ($url) => is_string($url) && str_contains($url, 'unit-image.jpg'),
                )
                ->where(
                    'bookingOrder.bookings.1.image_url',
                    fn ($url) => is_string($url) && str_contains($url, 'hero-fallback.jpg'),
                )
                ->where(
                    'bookingOrder.bookings.2.image_url',
                    fn ($url) => is_string($url) && str_contains($url, 'gallery-fallback.jpg'),
                )
                ->where('bookingOrder.bookings.3.image_url', null)
            );
    }

    private function facility(): Facility
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
            'is_active' => true,
        ]);

        FacilityPrice::create([
            'facility_id' => $facility->id,
            'user_category' => 'umum',
            'label' => 'Reguler',
            'price' => 100000,
            'duration_minutes' => 60,
            'schedule_type' => 'regular',
        ]);

        return $facility;
    }
}
