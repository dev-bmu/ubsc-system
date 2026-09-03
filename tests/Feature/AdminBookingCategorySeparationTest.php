<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use App\Services\AdminBookingReadModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AdminBookingCategorySeparationTest extends TestCase
{
    use RefreshDatabase;

    public function test_read_model_separates_category_and_website_coverage_at_query_level(): void
    {
        $fixture = $this->fixture();
        $readModel = app(AdminBookingReadModel::class);

        $website = $readModel->listing([
            'search' => null,
            'status' => null,
            'category_id' => $fixture['arena']->id,
            'coverage' => 'website',
            'per_page' => 20,
            'cursor' => null,
        ]);
        $all = $readModel->listing([
            'search' => null,
            'status' => null,
            'category_id' => $fixture['arena']->id,
            'coverage' => 'all',
            'per_page' => 20,
            'cursor' => null,
        ]);
        $websiteCalendar = $readModel->calendar(
            today()->toDateString(),
            $fixture['arena']->id,
            'website',
        );
        $allCalendar = $readModel->calendar(
            today()->toDateString(),
            $fixture['arena']->id,
            'all',
        );
        $websiteStatistics = $readModel->statistics(
            today()->toDateString(),
            $fixture['arena']->id,
            'website',
        );
        $allStatistics = $readModel->statistics(
            today()->toDateString(),
            $fixture['arena']->id,
            'all',
        );

        $this->assertSame(
            [$fixture['arena_website_booking']->id],
            array_column($website['data'], 'id'),
        );
        $this->assertEqualsCanonicalizing(
            [
                $fixture['arena_website_booking']->id,
                $fixture['arena_whatsapp_booking']->id,
                $fixture['arena_inactive_booking']->id,
            ],
            array_column($all['data'], 'id'),
        );
        $this->assertSame('Lapangan & Arena', $website['data'][0]['facility_category_name']);
        $this->assertSame('admin', $website['data'][0]['booking_source']);
        $this->assertSame(2, $website['data'][0]['pax']);
        $this->assertSame(
            [$fixture['arena_website_booking']->id],
            array_column($websiteCalendar['data'], 'id'),
        );
        $this->assertEqualsCanonicalizing(
            [
                $fixture['arena_website_booking']->id,
                $fixture['arena_whatsapp_booking']->id,
                $fixture['arena_inactive_booking']->id,
            ],
            array_column($allCalendar['data'], 'id'),
        );
        $this->assertSame(1, $websiteStatistics['total']);
        $this->assertSame(3, $allStatistics['total']);
    }

    public function test_category_facility_feeds_preserve_history_without_polluting_the_public_scope(): void
    {
        $fixture = $this->fixture();
        $readModel = app(AdminBookingReadModel::class);

        $categories = $readModel->categories();
        $websiteFacilities = $readModel->facilities(
            $fixture['arena']->id,
            'website',
            today()->toDateString(),
        );
        $allCalendarFacilities = $readModel->facilities(
            $fixture['arena']->id,
            'all',
            today()->toDateString(),
        );
        $manualFacilities = $readModel->facilities();

        $this->assertSame(
            ['Lapangan & Arena', 'Kelas & Kebugaran'],
            array_column($categories, 'name'),
        );
        $this->assertSame(3, $categories[0]['total_facilities']);
        $this->assertSame(2, $categories[0]['active_facilities']);
        $this->assertSame(1, $categories[0]['website_facilities']);
        $this->assertSame(
            [$fixture['arena_website']->id],
            array_column($websiteFacilities, 'id'),
        );
        $this->assertEqualsCanonicalizing(
            [
                $fixture['arena_website']->id,
                $fixture['arena_whatsapp']->id,
                $fixture['arena_inactive']->id,
            ],
            array_column($allCalendarFacilities, 'id'),
        );
        $this->assertEqualsCanonicalizing(
            [
                $fixture['arena_website']->id,
                $fixture['arena_whatsapp']->id,
                $fixture['class_website']->id,
            ],
            array_column($manualFacilities, 'id'),
        );
    }

    public function test_shared_class_capacity_is_exposed_as_one_consistent_operational_snapshot(): void
    {
        $fixture = $this->fixture();
        $fixture['class_website']->update(['capacity' => 12]);
        $second = $this->booking($fixture['class_website'], 'Peserta Kedua', 3);
        $cancelled = $this->booking($fixture['class_website'], 'Peserta Batal', 4);
        $cancelled->update(['status' => 'cancelled']);

        $readModel = app(AdminBookingReadModel::class);
        $calendar = $readModel->calendar(
            today()->toDateString(),
            $fixture['classes']->id,
            'website',
        );
        $facilities = $readModel->facilities(
            $fixture['classes']->id,
            'website',
            today()->toDateString(),
        );

        $this->assertCount(2, $calendar['data']);
        $this->assertEqualsCanonicalizing(
            [$fixture['class_website_booking']->id, $second->id],
            array_column($calendar['data'], 'id'),
        );

        foreach ($calendar['data'] as $booking) {
            $this->assertSame('shared', $booking['inventory']['mode']);
            $this->assertSame(12, $booking['inventory']['capacity']);
            $this->assertSame(4, $booking['inventory']['occupied']);
            $this->assertSame(8, $booking['inventory']['remaining']);
            $this->assertSame(33, $booking['inventory']['utilization_percent']);
            $this->assertSame(2, $booking['inventory']['concurrent_bookings']);
            $this->assertTrue($booking['inventory']['holds_inventory']);
            $this->assertFalse($booking['inventory']['over_capacity']);
            $this->assertSame('available', $booking['inventory']['status']);
        }

        $this->assertSame(12, $facilities[0]['booking_capacity']);
        $this->assertTrue($facilities[0]['has_shared_booking_capacity']);

        $fixture['arena_website']->update(['capacity' => 20]);
        $exclusive = $readModel->detail($fixture['arena_website_booking']);
        $this->assertSame('exclusive', $exclusive['inventory']['mode']);
        $this->assertSame(1, $exclusive['inventory']['capacity']);
    }

    public function test_a_real_website_order_remains_visible_after_its_facility_is_deactivated(): void
    {
        $fixture = $this->fixture();
        $order = BookingOrder::create([
            'customer_name' => 'Pelanggan Historis',
            'whatsapp_number' => '628123450000',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'paid',
            'expires_at' => now()->addHour(),
        ]);
        $historicalBooking = $order->bookings()->create([
            'customer_name' => 'Pelanggan Historis',
            'facility_id' => $fixture['arena_inactive']->id,
            'booking_date' => today(),
            'start_time' => '10:00',
            'end_time' => '11:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
        $legacyUser = User::factory()->create();
        $legacyBooking = Booking::create([
            'user_id' => $legacyUser->id,
            'customer_name' => $legacyUser->name,
            'facility_id' => $fixture['arena_inactive']->id,
            'booking_date' => today(),
            'start_time' => '11:00',
            'end_time' => '12:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
        $readModel = app(AdminBookingReadModel::class);

        $listing = $readModel->listing([
            'search' => null,
            'status' => null,
            'category_id' => $fixture['arena']->id,
            'coverage' => 'website',
            'per_page' => 20,
            'cursor' => null,
        ]);
        $calendar = $readModel->calendar(
            today()->toDateString(),
            $fixture['arena']->id,
            'website',
        );
        $facilities = $readModel->facilities(
            $fixture['arena']->id,
            'website',
            today()->toDateString(),
        );

        $this->assertContains($historicalBooking->id, array_column($listing['data'], 'id'));
        $this->assertContains($legacyBooking->id, array_column($listing['data'], 'id'));
        $this->assertContains($historicalBooking->id, array_column($calendar['data'], 'id'));
        $this->assertContains($legacyBooking->id, array_column($calendar['data'], 'id'));
        $this->assertContains($fixture['arena_inactive']->id, array_column($facilities, 'id'));
    }

    public function test_order_contact_payment_and_actionability_are_projected_without_leaking_them_into_calendar_payloads(): void
    {
        $fixture = $this->fixture();
        $order = BookingOrder::create([
            'customer_name' => 'Pemesan Order',
            'whatsapp_number' => '628999111222',
            'identity_category' => 'warga_ub',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'paid',
            'notes' => 'Catatan order terbaru',
            'expires_at' => now()->addHour(),
        ]);
        $booking = $order->bookings()->create([
            'customer_name' => 'Snapshot Lama',
            'customer_phone' => '628000000000',
            'facility_id' => $fixture['arena_website']->id,
            'booking_date' => today(),
            'start_time' => '10:00',
            'end_time' => '11:00',
            'pax' => 2,
            'subtotal_price' => 100000,
            'status' => 'pending',
            'notes' => 'Catatan privat operasional',
        ]);
        $transaction = $order->transaction()->create([
            'amount' => 106000,
            'payment_status' => 'PAID',
            'checkout_url' => '/checkout/booking/'.$order->id,
            'paid_at' => now(),
        ]);
        $readModel = app(AdminBookingReadModel::class);

        $calendar = $readModel->calendar(
            today()->toDateString(),
            $fixture['arena']->id,
            'website',
        );
        $calendarBooking = collect($calendar['data'])->firstWhere('id', $booking->id);
        $detail = $readModel->detail($booking);
        $referenceSearch = $readModel->listing([
            'search' => 'UBSC-'.str_pad((string) $order->id, 6, '0', STR_PAD_LEFT),
            'status' => null,
            'category_id' => $fixture['arena']->id,
            'coverage' => 'website',
            'per_page' => 20,
            'cursor' => null,
        ]);
        $phoneSearch = $readModel->listing([
            'search' => '08999',
            'status' => null,
            'category_id' => $fixture['arena']->id,
            'coverage' => 'website',
            'per_page' => 20,
            'cursor' => null,
        ]);

        $this->assertIsArray($calendarBooking);
        $this->assertNull($calendarBooking['customer_phone']);
        $this->assertNull($calendarBooking['customer_email']);
        $this->assertNull($calendarBooking['notes']);
        $this->assertNull($calendarBooking['transaction']);
        $this->assertSame('Pemesan Order', $calendarBooking['customer_name']);
        $this->assertSame('Pemesan Order', $detail['customer_name']);
        $this->assertSame('628999111222', $detail['customer_phone']);
        $this->assertSame('Catatan order terbaru', $detail['notes']);
        $this->assertSame('warga_ub', $detail['user_category']);
        $this->assertSame('website', $detail['booking_source']);
        $this->assertSame('paid', $detail['booking_order_status']);
        $this->assertTrue($detail['payment_settled']);
        $this->assertMatchesRegularExpression('/\A[a-f0-9]{64}\z/', $detail['state_version']);
        $this->assertTrue($detail['operational_actions']['can_confirm']);
        $this->assertFalse($detail['operational_actions']['can_simulate_payment']);
        $this->assertSame($transaction->id, $detail['transaction']['id']);
        $this->assertSame('PAID', $detail['transaction']['payment_status']);
        $this->assertSame([$booking->id], array_column($referenceSearch['data'], 'id'));
        $this->assertContains($booking->id, array_column($phoneSearch['data'], 'id'));

        $listedBooking = collect($referenceSearch['data'])->firstWhere('id', $booking->id);
        $this->assertIsArray($listedBooking);
        $this->assertSame('628999111222', $listedBooking['customer_phone']);
        $this->assertNull($listedBooking['customer_email']);
        $this->assertNull($listedBooking['notes']);
        $this->assertNull($listedBooking['state_version']);
        $this->assertNull($listedBooking['transaction']['checkout_url']);
        $this->assertSame('PAID', $listedBooking['transaction']['payment_status']);
    }

    public function test_invalid_cursor_is_safely_treated_as_the_first_page(): void
    {
        $fixture = $this->fixture();
        $listing = app(AdminBookingReadModel::class)->listing([
            'search' => null,
            'status' => null,
            'category_id' => $fixture['arena']->id,
            'coverage' => 'all',
            'per_page' => 10,
            'cursor' => rtrim(strtr(base64_encode(json_encode([
                'unexpected' => 'value',
            ], JSON_THROW_ON_ERROR)), '+/', '-_'), '='),
        ]);

        $this->assertNotEmpty($listing['data']);
        $this->assertFalse($listing['pagination']['has_previous']);
    }

    public function test_selected_calendar_date_also_scopes_statistics(): void
    {
        $fixture = $this->fixture();
        $staff = $this->staff(['view-bookings']);
        $selectedDate = today()->addDays(5)->toDateString();
        $fixture['class_website_booking']->update(['booking_date' => $selectedDate]);

        $this->actingAs($staff)
            ->get(route('admin.bookings.index', [
                'category' => $fixture['classes']->slug,
                'date' => $selectedDate,
            ]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('booking_calendar.date', $selectedDate)
                ->where('booking_stats.date', $selectedDate)
                ->where('booking_stats.total', 1));
    }

    public function test_history_date_range_is_applied_by_the_database_and_preserved_in_page_filters(): void
    {
        $fixture = $this->fixture();
        $staff = $this->staff(['view-bookings']);
        $futureDate = today()->addDays(10)->toDateString();
        $fixture['arena_whatsapp_booking']->update(['booking_date' => $futureDate]);

        $this->actingAs($staff)
            ->get(route('admin.bookings.index', [
                'category' => $fixture['arena']->slug,
                'coverage' => 'all',
                'date_from' => $futureDate,
                'date_to' => $futureDate,
            ]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('booking_list', 1)
                ->where('booking_list.0.id', $fixture['arena_whatsapp_booking']->id)
                ->where('booking_filters.date_from', $futureDate)
                ->where('booking_filters.date_to', $futureDate));
    }

    public function test_history_rejects_an_inverted_date_range(): void
    {
        $this->fixture();
        $staff = $this->staff(['view-bookings']);

        $this->actingAs($staff)
            ->from(route('admin.bookings.index'))
            ->get(route('admin.bookings.index', [
                'date_from' => today()->addDay()->toDateString(),
                'date_to' => today()->toDateString(),
            ]))
            ->assertRedirect(route('admin.bookings.index'))
            ->assertSessionHasErrors([
                'date_to' => 'Tanggal akhir riwayat tidak boleh mendahului tanggal awal.',
            ]);
    }

    public function test_admin_page_returns_one_selected_category_with_a_separate_manual_catalog(): void
    {
        $fixture = $this->fixture();
        $staff = $this->staff(['view-bookings']);

        $this->actingAs($staff)
            ->get(route('admin.bookings.index', [
                'category' => $fixture['classes']->slug,
                'coverage' => 'website',
                'per_page' => 10,
            ]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Bookings/Index')
                ->has('booking_categories', 2)
                ->where('booking_filters.category', $fixture['classes']->slug)
                ->where('booking_filters.coverage', 'website')
                ->has('facilities', 1)
                ->where('facilities.0.id', $fixture['class_website']->id)
                ->has('bookings', 1)
                ->where('bookings.0.id', $fixture['class_website_booking']->id)
                ->has('booking_list', 1)
                ->where('booking_list.0.id', $fixture['class_website_booking']->id)
                ->where('booking_stats.total', 1)
                ->where('can_manage_bookings', false)
                ->where('can_manage_booking_payments', false)
                ->has('manual_facilities', 0));

        $this->actingAs($staff)
            ->getJson(route('admin.bookings.show', $fixture['class_website_booking']))
            ->assertOk()
            ->assertJsonPath('data.id', $fixture['class_website_booking']->id)
            ->assertJsonPath('data.facility_category_name', 'Kelas & Kebugaran');

        $this->actingAs(User::factory()->create())
            ->getJson(route('admin.bookings.show', $fixture['class_website_booking']))
            ->assertForbidden();

        $manager = $this->staff(['manage-bookings']);

        $this->actingAs($manager)
            ->get(route('admin.bookings.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('can_manage_bookings', true)
                ->where('can_manage_booking_payments', true)
                ->has('manual_facilities', 3));

        $this->actingAs($staff)
            ->get(route('admin.bookings.index', ['category' => 'kategori-yang-sudah-tidak-ada']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('booking_filters.category', $fixture['arena']->slug)
                ->where('booking_filters.coverage', 'website'));
    }

    /** @return array<string, mixed> */
    private function fixture(): array
    {
        $arena = FacilityCategory::create([
            'name' => 'Lapangan & Arena',
            'slug' => 'lapangan-arena',
            'sort_order' => 1,
        ]);
        $classes = FacilityCategory::create([
            'name' => 'Kelas & Kebugaran',
            'slug' => 'kelas-kebugaran',
            'sort_order' => 2,
        ]);

        $arenaWebsite = $this->facility($arena, 'Arena Website', 'website', true, 1);
        $arenaWhatsapp = $this->facility($arena, 'Arena WhatsApp', 'whatsapp', true, 2);
        $arenaInactive = $this->facility($arena, 'Arena Nonaktif', 'website', false, 3);
        $classWebsite = $this->facility($classes, 'Kelas Website', 'website', true, 1);

        return [
            'arena' => $arena,
            'classes' => $classes,
            'arena_website' => $arenaWebsite,
            'arena_whatsapp' => $arenaWhatsapp,
            'arena_inactive' => $arenaInactive,
            'class_website' => $classWebsite,
            'arena_website_booking' => $this->booking($arenaWebsite, 'Arena Website', 2),
            'arena_whatsapp_booking' => $this->booking($arenaWhatsapp, 'Arena WhatsApp'),
            'arena_inactive_booking' => $this->booking($arenaInactive, 'Arena Nonaktif'),
            'class_website_booking' => $this->booking($classWebsite, 'Kelas Website'),
        ];
    }

    private function facility(
        FacilityCategory $category,
        string $name,
        string $reservationMethod,
        bool $active,
        int $sortOrder,
    ): Facility {
        return Facility::create([
            'facility_category_id' => $category->id,
            'name' => $name,
            'slug' => str($name)->slug().'-'.str()->random(6),
            'reservation_method' => $reservationMethod,
            'is_active' => $active,
            'sort_order' => $sortOrder,
        ]);
    }

    private function booking(Facility $facility, string $customer, int $pax = 1): Booking
    {
        return Booking::create([
            'customer_name' => $customer,
            'facility_id' => $facility->id,
            'booking_date' => today(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => $pax,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
    }

    /** @param array<int, string> $permissions */
    private function staff(array $permissions): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate([
                'name' => $permission,
                'guard_name' => 'web',
            ]);
        }

        $role = Role::firstOrCreate([
            'name' => 'Staff Central',
            'guard_name' => 'web',
        ]);
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
