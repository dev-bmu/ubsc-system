<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\Membership;
use App\Models\MembershipHistory;
use App\Models\User;
use App\Services\AdminBookingReadModel;
use App\Services\AdminMembershipReadModel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AdminServiceDataScalabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_membership_read_model_includes_a_pending_membership_in_its_effective_period(): void
    {
        $user = User::factory()->create();
        $membership = Membership::create([
            'user_id' => $user->id,
            'customer_name' => 'Pending Member',
            'start_date' => today(),
            'end_date' => today()->addMonths(3),
            'status' => 'pending_payment',
            'created_via' => 'public',
            'registration_email' => 'pending@example.test',
            'registration_expires_at' => now()->addDay(),
        ]);
        $membership->transaction()->create([
            'user_id' => $user->id,
            'amount' => 100000,
            'payment_status' => 'UNPAID',
        ]);

        $result = app(AdminMembershipReadModel::class)->listing([
            'date' => today()->toDateString(),
            'search' => null,
            'status' => null,
            'per_page' => 20,
            'cursor' => null,
        ]);

        $this->assertSame(
            1,
            Membership::query()
                ->where('start_date', '<', today()->addDay()->startOfDay())
                ->where('end_date', '>=', today()->toDateString())
                ->count(),
            json_encode($membership->fresh()->getRawOriginal(), JSON_THROW_ON_ERROR),
        );
        $this->assertSame([$membership->id], array_column($result['data'], 'id'));
        $this->assertFalse($result['pagination']['has_next']);
    }

    public function test_booking_history_uses_stable_cursor_pages_without_duplicates(): void
    {
        $facility = $this->facility();

        foreach (range(1, 25) as $index) {
            Booking::create([
                'customer_name' => sprintf('Member %02d', $index),
                'facility_id' => $facility->id,
                'booking_date' => today(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
        }

        $readModel = app(AdminBookingReadModel::class);
        $first = $readModel->listing([
            'search' => null,
            'status' => null,
            'per_page' => 10,
            'cursor' => null,
        ]);
        $second = $readModel->listing([
            'search' => null,
            'status' => null,
            'per_page' => 10,
            'cursor' => $first['pagination']['next_cursor'],
        ]);

        $firstIds = array_column($first['data'], 'id');
        $secondIds = array_column($second['data'], 'id');

        $this->assertCount(10, $firstIds);
        $this->assertCount(10, $secondIds);
        $this->assertTrue($first['pagination']['has_next']);
        $this->assertNotNull($first['pagination']['next_cursor']);
        $this->assertSame([], array_values(array_intersect($firstIds, $secondIds)));
        $this->assertTrue($second['pagination']['has_previous']);
    }

    public function test_booking_calendar_is_scoped_to_one_day_and_omits_cancelled_inventory(): void
    {
        $facility = $this->facility();
        $visible = Booking::create([
            'customer_name' => 'Visible Booking',
            'facility_id' => $facility->id,
            'booking_date' => today(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);
        Booking::create([
            'customer_name' => 'Cancelled Booking',
            'facility_id' => $facility->id,
            'booking_date' => today(),
            'start_time' => '09:00',
            'end_time' => '10:00',
            'subtotal_price' => 100000,
            'status' => 'cancelled',
        ]);
        Booking::create([
            'customer_name' => 'Tomorrow Booking',
            'facility_id' => $facility->id,
            'booking_date' => today()->addDay(),
            'start_time' => '08:00',
            'end_time' => '09:00',
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);

        $calendar = app(AdminBookingReadModel::class)
            ->calendar(today()->toDateString());

        $this->assertSame([$visible->id], array_column($calendar['data'], 'id'));
        $this->assertFalse($calendar['meta']['is_capped']);
    }

    public function test_membership_history_is_loaded_only_for_detail_and_is_safely_bounded(): void
    {
        $membership = Membership::create([
            'customer_name' => 'Long History Member',
            'start_date' => today(),
            'end_date' => today()->addYear(),
            'status' => 'active',
            'created_via' => 'admin',
        ]);

        foreach (range(1, 101) as $index) {
            MembershipHistory::create([
                'membership_id' => $membership->id,
                'actor_type' => 'system',
                'action' => 'status_changed',
                'start_date' => today(),
                'end_date' => today()->addYear(),
                'metadata' => ['sequence' => $index],
            ]);
        }

        $readModel = app(AdminMembershipReadModel::class);
        $listing = $readModel->listing([
            'date' => today()->toDateString(),
            'search' => null,
            'status' => null,
            'per_page' => 20,
            'cursor' => null,
        ]);
        $detail = $readModel->detail($membership);

        $this->assertArrayNotHasKey('histories', $listing['data'][0]);
        $this->assertCount(100, $detail['data']['histories']);
        $this->assertTrue($detail['meta']['histories_has_more']);
        $this->assertSame(100, $detail['meta']['histories_limit']);
    }

    public function test_membership_listing_query_count_stays_constant_as_the_page_fills(): void
    {
        foreach (range(1, 50) as $index) {
            Membership::create([
                'customer_name' => sprintf('Scalable Member %02d', $index),
                'start_date' => today(),
                'end_date' => today()->addMonth(),
                'status' => 'active',
                'created_via' => 'admin',
            ]);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        $result = app(AdminMembershipReadModel::class)->listing([
            'date' => today()->toDateString(),
            'search' => null,
            'status' => null,
            'per_page' => 50,
            'cursor' => null,
        ]);

        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount(50, $result['data']);
        $this->assertLessThanOrEqual(8, $queryCount, "Listing executed {$queryCount} queries.");
    }

    public function test_booking_listing_query_count_stays_constant_as_the_page_fills(): void
    {
        $facility = $this->facility();
        $user = User::factory()->create();

        foreach (range(1, 50) as $index) {
            $booking = Booking::create([
                'user_id' => $user->id,
                'customer_name' => sprintf('Scalable Booking %02d', $index),
                'facility_id' => $facility->id,
                'booking_date' => today(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
            $booking->transaction()->create([
                'user_id' => $user->id,
                'amount' => 100000,
                'payment_status' => 'PAID',
            ]);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        $result = app(AdminBookingReadModel::class)->listing([
            'search' => null,
            'status' => null,
            'per_page' => 50,
            'cursor' => null,
        ]);

        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount(50, $result['data']);
        $this->assertLessThanOrEqual(9, $queryCount, "Listing executed {$queryCount} queries.");
    }

    public function test_admin_pages_expose_bounded_server_pages_instead_of_entire_tables(): void
    {
        $facility = $this->facility();

        foreach (range(1, 25) as $index) {
            Booking::create([
                'customer_name' => sprintf('Paged Booking %02d', $index),
                'facility_id' => $facility->id,
                'booking_date' => today(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
            Membership::create([
                'customer_name' => sprintf('Paged Member %02d', $index),
                'start_date' => today(),
                'end_date' => today()->addMonth(),
                'status' => 'active',
                'created_via' => 'admin',
            ]);
        }

        $staff = $this->staff(['view-bookings', 'view-members']);

        $this->actingAs($staff)
            ->get(route('admin.bookings.index', ['per_page' => 10]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Bookings/Index')
                ->has('bookings', 25)
                ->has('booking_list', 10)
                ->where('booking_pagination.has_next', true)
                ->where('booking_stats.total', 25));

        $this->actingAs($staff)
            ->get(route('admin.memberships.index', ['per_page' => 10]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Memberships/Index')
                ->has('memberships', 10)
                ->missing('memberships.0.histories')
                ->where('membership_pagination.has_next', true)
                ->where('membership_stats.total', 25));
    }

    public function test_member_account_lookup_is_bounded_and_requires_mutation_permission(): void
    {
        foreach (range(1, 25) as $index) {
            User::factory()->create([
                'name' => sprintf('Lookup Member %02d', $index),
                'email' => sprintf('lookup%02d@example.test', $index),
            ]);
        }

        $viewer = $this->staff(['view-members'], 'Finance');
        $manager = $this->staff(['manage-members'], 'Manager');

        $this->actingAs($viewer)
            ->getJson(route('admin.memberships.users.search', ['search' => 'Lookup']))
            ->assertForbidden();

        $response = $this->actingAs($manager)
            ->getJson(route('admin.memberships.users.search', ['search' => 'Lookup']))
            ->assertOk()
            ->assertJsonCount(20, 'data');

        $this->assertCount(20, array_unique(array_column($response->json('data'), 'id')));
    }

    private function facility(): Facility
    {
        $category = FacilityCategory::create([
            'name' => 'Lapangan',
            'slug' => 'lapangan-'.str()->random(8),
        ]);

        return Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Uji',
            'slug' => 'lapangan-uji-'.str()->random(8),
            'is_active' => true,
        ]);
    }

    /** @param array<int, string> $permissions */
    private function staff(array $permissions, string $roleName = 'Staff Central'): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate([
                'name' => $permission,
                'guard_name' => 'web',
            ]);
        }

        $role = Role::firstOrCreate([
            'name' => $roleName,
            'guard_name' => 'web',
        ]);
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
