<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\EnforceCanonicalHost;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

class GoogleAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_google_login_uses_remote_google_avatar_without_storing_locally(): void
    {
        Storage::fake('public');

        $user = User::factory()->create([
            'email' => 'member@example.test',
            'avatar' => 'avatars/google/old-google-avatar.jpg',
            'google_id' => null,
        ]);

        Storage::disk('public')->put($user->avatar, 'old avatar bytes');

        $googleAvatar = 'https://lh3.googleusercontent.com/a/example=s96-c';
        $this->mockGoogleUser([
            'id' => 'google-user-123',
            'name' => 'Member Google',
            'email' => $user->email,
            'avatar' => $googleAvatar,
            'email_verified' => true,
        ]);
        $this->get('/');
        $sessionIdBeforeLogin = session()->getId();

        $this->get(route('google.callback'))
            ->assertRedirect(config('app.url'))
            ->assertSessionHas('inertia.clear_history', true);

        $this->assertAuthenticatedAs($user->fresh());
        $this->assertNotSame($sessionIdBeforeLogin, session()->getId());

        $user->refresh();

        $this->assertSame('google-user-123', $user->google_id);
        $this->assertSame('https://lh3.googleusercontent.com/a/example=s256-c', $user->avatar);
        $this->assertSame($user->avatar, $user->avatar_url);
        Storage::disk('public')->assertMissing('avatars/google/old-google-avatar.jpg');
    }

    public function test_google_login_creates_user_with_remote_google_avatar(): void
    {
        $googleAvatar = 'https://lh3.googleusercontent.com/a/new-user=s96-c';
        $this->mockGoogleUser([
            'id' => 'google-user-456',
            'name' => 'New Google User',
            'email' => 'new-google@example.test',
            'avatar' => $googleAvatar,
            'email_verified' => true,
        ]);

        $this->get(route('google.callback'))
            ->assertRedirect(config('app.url'))
            ->assertSessionHas('inertia.clear_history', true);

        $this->assertAuthenticated();

        $user = User::where('email', 'new-google@example.test')->firstOrFail();

        $this->assertSame('google-user-456', $user->google_id);
        $this->assertSame('https://lh3.googleusercontent.com/a/new-user=s256-c', $user->avatar);
        $this->assertSame($user->avatar, $user->avatar_url);
    }

    public function test_google_login_fails_closed_without_explicitly_verified_email(): void
    {
        $user = User::factory()->create([
            'email' => 'unverified-provider@example.test',
        ]);

        $this->mockGoogleUser([
            'id' => 'google-unverified-789',
            'name' => 'Unverified Provider User',
            'email' => $user->email,
            'avatar' => 'https://lh3.googleusercontent.com/a/unverified=s96-c',
            'email_verified' => null,
        ]);

        $this->get(route('google.callback'))
            ->assertRedirect('/?auth=login')
            ->assertSessionHasErrors('email');

        $this->assertGuest();
        $this->assertNull($user->fresh()->google_id);
    }

    public function test_google_failure_preserves_the_safe_intended_target(): void
    {
        $user = User::factory()->create([
            'email' => 'failed-google@example.test',
        ]);

        $this->mockGoogleUser([
            'id' => 'google-failed-789',
            'name' => 'Failed Google User',
            'email' => $user->email,
            'avatar' => 'https://lh3.googleusercontent.com/a/failed=s96-c',
            'email_verified' => null,
        ]);

        $this->withSession([
            'url.intended' => '/pricing?plan=3#membership',
        ])->get(route('google.callback'))
            ->assertRedirect(
                '/?auth=login&return_to=%2Fpricing%3Fplan%3D3%23membership',
            )
            ->assertSessionHas('url.intended', '/pricing?plan=3#membership')
            ->assertSessionHasErrors('email');

        $this->assertGuest();
    }

    public function test_google_success_consumes_and_returns_to_the_safe_intended_target(): void
    {
        $this->mockGoogleUser([
            'id' => 'google-return-123',
            'name' => 'Returning Google User',
            'email' => 'google-return@example.test',
            'avatar' => 'https://lh3.googleusercontent.com/a/return=s96-c',
            'email_verified' => true,
        ]);

        $this->withSession([
            'url.intended' => '/pricing?plan=3#membership',
        ])->get(route('google.callback'))
            ->assertRedirect('/pricing?plan=3#membership')
            ->assertSessionMissing('url.intended');

        $this->assertAuthenticated();
    }

    public function test_google_login_preserves_safe_return_path_across_canonical_host_redirect(): void
    {
        config(['app.url' => 'http://localhost']);
        $this->withoutMiddleware(EnforceCanonicalHost::class);

        $this->get('http://127.0.0.1/auth/google?return_to=%2Fpricing%3Fplan%3D3%23membership')
            ->assertRedirect(
                'http://localhost/auth/google?return_to=%2Fpricing%3Fplan%3D3%23membership',
            );
    }

    /**
     * @param  array{id: string, name: string, email: string, avatar: string, email_verified: bool|null}  $attributes
     */
    private function mockGoogleUser(array $attributes): void
    {
        $googleUser = (new SocialiteUser)->map([
            'id' => $attributes['id'],
            'name' => $attributes['name'],
            'email' => $attributes['email'],
            'avatar' => $attributes['avatar'],
        ]);
        $googleUser->user = [
            'email_verified' => $attributes['email_verified'],
            'picture' => $attributes['avatar'],
        ];

        $provider = Mockery::mock();
        $provider->shouldReceive('user')->once()->andReturn($googleUser);

        Socialite::shouldReceive('driver')
            ->once()
            ->with('google')
            ->andReturn($provider);
    }
}
