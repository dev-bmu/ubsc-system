<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class StaffPublicAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_staff_is_redirected_away_from_public_auth_routes(): void
    {
        $admin = $this->staffUser();

        $this->actingAs($admin)
            ->get('/login')
            ->assertRedirect(route('admin.dashboard'));

        $this->actingAs($admin)
            ->get('/register')
            ->assertRedirect(route('admin.dashboard'));
    }

    public function test_authenticated_staff_is_not_rendered_inside_public_pages(): void
    {
        $admin = $this->staffUser();

        foreach (['/', '/about', '/news', '/pricing', '/facilities', '/booking', '/coming-soon'] as $path) {
            $this->actingAs($admin)
                ->get($path)
                ->assertRedirect(route('admin.dashboard'));
        }
    }

    public function test_authenticated_staff_cannot_call_public_user_endpoints_directly(): void
    {
        $admin = $this->staffUser();

        $this->actingAs($admin)
            ->patch('/profile', [
                'name' => 'Changed Staff',
                'email' => $admin->email,
            ])
            ->assertStatus(403);

        $this->actingAs($admin)
            ->delete('/profile', [
                'password' => 'password',
            ])
            ->assertStatus(403);

        $this->actingAs($admin)
            ->get('/user/transactions')
            ->assertRedirect(route('admin.dashboard'));

        $this->actingAs($admin)
            ->post('/reviews', [
                'rating' => 5,
                'text' => 'Staff accounts must never enter the public review flow.',
            ])
            ->assertStatus(403);
    }

    public function test_regular_authenticated_user_can_still_open_public_pages(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/')
            ->assertOk();
    }

    private function staffUser(): User
    {
        Role::firstOrCreate(['name' => 'Administrator', 'guard_name' => 'web']);

        $user = User::factory()->create();
        $user->assignRole('Administrator');

        return $user;
    }
}
