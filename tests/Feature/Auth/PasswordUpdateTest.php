<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\CredentialSecurity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PasswordUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_password_can_be_updated(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $oldSessionId = session()->getId();

        $response = $this
            ->from('/profile')
            ->put('/password', [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect('/profile');

        $this->assertTrue(Hash::check('new-password', $user->refresh()->password));
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->remember_token);
        $this->assertNotSame($oldSessionId, session()->getId());
        $this->get('/profile')->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_correct_password_must_be_provided_to_update_password(): void
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->from('/profile')
            ->put('/password', [
                'current_password' => 'wrong-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasErrors('current_password')
            ->assertRedirect('/profile');
    }

    public function test_staff_password_update_revokes_the_current_session_and_mfa_proof(): void
    {
        Role::findOrCreate('Manager', 'web');
        $user = User::factory()->create([
            'remember_token' => 'previous-remember-token',
        ]);
        $user->assignRole('Manager');

        $this->actingAs($user);
        $version = (int) $user->adminMfaSetting()->firstOrFail()->version;

        $response = $this
            ->from('/profile')
            ->put('/password', [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('ubsc-staff.login'))
            ->assertSessionHas('status');

        $this->assertGuest();
        $this->assertTrue(Hash::check('new-password', $user->refresh()->password));
        $this->assertNotSame('previous-remember-token', $user->remember_token);
        $this->assertSame(
            $version + 1,
            (int) $user->adminMfaSetting()->firstOrFail()->version,
        );
    }

    public function test_auth_state_probe_rejects_a_session_bound_to_an_old_password(): void
    {
        $user = User::factory()->create();
        $oldPasswordHash = $user->password;
        $sessionPasswordHash = auth()->guard()->hashPasswordForCookie($oldPasswordHash);

        $this->actingAs($user)->withSession([
            'password_hash_web' => $sessionPasswordHash,
        ]);

        app(CredentialSecurity::class)->replacePassword(
            $user,
            'new-password',
        );

        $this->getJson('/auth/session-state')->assertUnauthorized();
        $this->assertGuest();
    }
}
