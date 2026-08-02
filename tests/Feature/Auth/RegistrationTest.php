<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_route_opens_public_auth_modal(): void
    {
        $response = $this->get('/register');

        $response->assertRedirect('/?auth=register');
    }

    public function test_registration_route_preserves_a_safe_return_target(): void
    {
        $returnTo = '/pricing?plan=4#membership';

        $this->get('/register?'.http_build_query(['return_to' => $returnTo]))
            ->assertRedirect(
                '/?auth=register&return_to=%2Fpricing%3Fplan%3D4%23membership',
            )
            ->assertSessionHas('url.intended', $returnTo);
    }

    public function test_new_users_can_register(): void
    {
        $this->get('/auth/session-state');
        $sessionIdBeforeRegistration = session()->getId();

        $response = $this->post('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('verification.notice', absolute: false));
        $response->assertSessionHas('inertia.clear_history', true);
        $this->assertNotSame(
            $sessionIdBeforeRegistration,
            session()->getId(),
            'Registration must rotate the session ID to prevent session fixation.'
        );
    }

    public function test_modal_registration_preserves_a_safe_return_path_until_verification(): void
    {
        $response = $this->post('/register', [
            'name' => 'Membership Return User',
            'email' => 'membership-return@example.test',
            'password' => 'password',
            'password_confirmation' => 'password',
            'return_to' => '/pricing?plan=4#membership',
        ]);

        $response
            ->assertRedirect(route('verification.notice', absolute: false))
            ->assertSessionHas('url.intended', '/pricing?plan=4#membership');
    }
}
