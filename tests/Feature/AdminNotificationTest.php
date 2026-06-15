<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AdminNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_read_operational_notifications(): void
    {
        $admin = $this->adminUser();
        User::factory()->create(['identity_status' => 'pending']);

        $response = $this->actingAs($admin)->get(route('admin.notifications.index'));

        $response
            ->assertOk()
            ->assertJsonPath('unread_count', 1)
            ->assertJsonFragment([
                'title' => 'Identity review waiting',
                'source' => 'Identity',
                'important' => true,
                'read' => false,
            ]);
    }

    public function test_admin_can_mark_notifications_as_read_and_clear_them(): void
    {
        $admin = $this->adminUser();
        User::factory()->create(['identity_status' => 'pending']);

        $this->actingAs($admin)
            ->postJson(route('admin.notifications.read'))
            ->assertOk()
            ->assertJsonPath('unread_count', 0)
            ->assertJsonPath('items.0.read', true);

        $this->actingAs($admin)
            ->postJson(route('admin.notifications.clear-read'))
            ->assertOk()
            ->assertJsonPath('items', [])
            ->assertJsonPath('unread_count', 0);
    }

    public function test_public_user_cannot_access_admin_notifications(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson(route('admin.notifications.index'))
            ->assertForbidden();
    }

    public function test_notifications_are_filtered_by_staff_permissions(): void
    {
        $frontOffice = $this->staffUser('Staff Front Office', ['view-bookings', 'verify-identity']);
        $finance = $this->staffUser('Finance', ['view-reports', 'manage-payment-links']);

        User::factory()->create(['identity_status' => 'pending']);

        $this->actingAs($frontOffice)
            ->getJson(route('admin.notifications.index'))
            ->assertOk()
            ->assertJsonFragment(['id' => 'identity.pending'])
            ->assertJsonMissing(['source' => 'Finance']);

        $this->actingAs($finance)
            ->getJson(route('admin.notifications.index'))
            ->assertOk()
            ->assertJsonMissing(['id' => 'identity.pending']);
    }

    public function test_read_state_is_stable_for_the_same_notification_condition(): void
    {
        $admin = $this->adminUser();
        User::factory()->create(['identity_status' => 'pending']);

        $this->actingAs($admin)
            ->postJson(route('admin.notifications.read'), ['ids' => ['identity.pending']])
            ->assertOk()
            ->assertJsonPath('unread_count', 0);

        $this->actingAs($admin)
            ->getJson(route('admin.notifications.index'))
            ->assertOk()
            ->assertJsonPath('unread_count', 0)
            ->assertJsonPath('items.0.read', true);
    }

    private function adminUser(): User
    {
        Role::firstOrCreate(['name' => 'Administrator', 'guard_name' => 'web']);

        $user = User::factory()->create();
        $user->assignRole('Administrator');

        return $user;
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

        $user = User::factory()->create();
        $user->assignRole($roleName);

        return $user;
    }
}
