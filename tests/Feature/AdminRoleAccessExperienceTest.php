<?php

namespace Tests\Feature;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AdminRoleAccessExperienceTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_admin_can_view_only_their_own_role_access_matrix(): void
    {
        $finance = $this->staffUser('Finance', ['view-reports']);
        $this->staffUser('Manager', ['view-stats', 'manage-bookings']);

        $this->actingAs($finance)
            ->get(route('admin.settings.roles'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Settings/Roles')
                ->has('roles', 1)
                ->where('roles.0.name', 'Finance')
                ->where('roles.0.permissions.0', 'view-reports'));
    }

    public function test_non_admin_role_access_matrix_reflects_latest_admin_checklist(): void
    {
        $admin = $this->staffUser('Administrator', ['view-reports', 'view-bookings', 'manage-payment-links']);
        $finance = $this->staffUser('Finance', ['view-reports']);
        $role = Role::findByName('Finance', 'web');

        $this->actingAs($admin)
            ->put(route('admin.settings.roles.update', $role), [
                'permissions' => ['view-bookings', 'manage-payment-links'],
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->actingAs($finance)
            ->get(route('admin.settings.roles'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Settings/Roles')
                ->where('roles.0.name', 'Finance')
                ->where('roles.0.permissions', ['manage-payment-links', 'view-bookings'])
                ->where('auth.user.permissions', ['manage-payment-links', 'view-bookings']));
    }

    public function test_view_permission_can_open_read_page_but_not_mutate_it(): void
    {
        $staff = $this->staffUser('Staff Central', ['view-bookings']);

        $this->actingAs($staff)
            ->get(route('admin.bookings.index'))
            ->assertOk();

        $this->actingAs($staff)
            ->post(route('admin.bookings.store'), [])
            ->assertStatus(403)
            ->assertInertia(fn (Assert $page) => $page->component('Errors/Forbidden'));
    }

    public function test_non_admin_can_view_internal_users_but_cannot_manage_them(): void
    {
        $finance = $this->staffUser('Finance', ['view-reports']);
        $finance->forceFill(['avatar' => 'avatars/finance.jpg'])->save();

        $this->actingAs($finance)
            ->get(route('admin.settings.users'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Settings/Users/Index')
                ->where('can_manage_users', false)
                ->where('users.0.email', $finance->email)
                ->where('users.0.avatar', 'avatars/finance.jpg')
                ->where('users.0.avatar_url', asset('storage/avatars/finance.jpg')));

        $this->actingAs($finance)
            ->post(route('admin.settings.users.store'), [
                'name' => 'New Staff',
                'email' => 'staff@example.test',
                'password' => 'password',
                'role' => 'Staff Central',
            ])
            ->assertStatus(403)
            ->assertInertia(fn (Assert $page) => $page->component('Errors/Forbidden'));

        $this->actingAs($finance)
            ->put(route('admin.settings.users.update', $finance), [
                'name' => 'Changed',
                'email' => $finance->email,
                'role' => 'Finance',
            ])
            ->assertStatus(403)
            ->assertInertia(fn (Assert $page) => $page->component('Errors/Forbidden'));

        $this->actingAs($finance)
            ->delete(route('admin.settings.users.destroy', $finance))
            ->assertStatus(403)
            ->assertInertia(fn (Assert $page) => $page->component('Errors/Forbidden'));
    }

    public function test_checked_operational_permissions_unlock_their_admin_features(): void
    {
        $scheduler = $this->staffUser('Staff Central', ['manage-booking-limits']);
        $memberAdmin = $this->staffUser('Manager', ['manage-members']);

        $this->actingAs($scheduler)
            ->get(route('admin.settings.schedules'))
            ->assertOk();

        $this->actingAs($memberAdmin)
            ->get(route('admin.memberships.plans.index'))
            ->assertOk();
    }

    public function test_manage_pricing_permission_unlocks_facility_pricing_without_manage_facilities(): void
    {
        $pricingStaff = $this->staffUser('Staff Central', ['manage-pricing']);
        $category = FacilityCategory::create([
            'name' => 'Court',
            'slug' => 'court',
        ]);
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Court A',
            'slug' => 'court-a',
            'is_active' => true,
        ]);

        $this->actingAs($pricingStaff)
            ->get(route('admin.facilities.index'))
            ->assertOk();

        $this->actingAs($pricingStaff)
            ->get(route('admin.facilities.pricing', $facility))
            ->assertOk();

        $this->actingAs($pricingStaff)
            ->post(route('admin.facilities.pricing.sync', $facility), [
                'prices' => [[
                    'user_category' => 'umum',
                    'label' => 'Regular',
                    'price' => 100000,
                    'duration_minutes' => 60,
                ]],
            ])
            ->assertRedirect();
    }

    public function test_manage_payment_links_permission_unlocks_booking_and_membership_entry_points(): void
    {
        $paymentStaff = $this->staffUser('Finance', ['manage-payment-links']);

        $this->actingAs($paymentStaff)
            ->get(route('admin.bookings.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('auth.user.permissions', ['manage-payment-links']));

        $this->actingAs($paymentStaff)
            ->get(route('admin.memberships.index'))
            ->assertOk();
    }

    /**
     * @param array<int, string> $permissions
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
