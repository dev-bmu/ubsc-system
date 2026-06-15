<?php

namespace Tests\Feature\Auth;

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

        $this->get(route('google.callback'))
            ->assertRedirect(config('app.url'));

        $this->assertAuthenticatedAs($user->fresh());

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
            ->assertRedirect(config('app.url'));

        $this->assertAuthenticated();

        $user = User::where('email', 'new-google@example.test')->firstOrFail();

        $this->assertSame('google-user-456', $user->google_id);
        $this->assertSame('https://lh3.googleusercontent.com/a/new-user=s256-c', $user->avatar);
        $this->assertSame($user->avatar, $user->avatar_url);
    }

    /**
     * @param array{id: string, name: string, email: string, avatar: string, email_verified: bool} $attributes
     */
    private function mockGoogleUser(array $attributes): void
    {
        $googleUser = (new SocialiteUser())->map([
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
