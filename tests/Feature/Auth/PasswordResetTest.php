<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\Auth\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_password_link_screen_can_be_rendered(): void
    {
        $response = $this->get('/forgot-password');

        $response->assertRedirect('/?auth=forgot');
    }

    public function test_forgot_password_entry_preserves_a_safe_return_target(): void
    {
        $returnTo = '/pricing?plan=3#membership';

        $this->get('/forgot-password?'.http_build_query([
            'return_to' => $returnTo,
        ]))
            ->assertRedirect(
                '/?auth=forgot&return_to=%2Fpricing%3Fplan%3D3%23membership',
            )
            ->assertSessionHas('url.intended', $returnTo);
    }

    public function test_reset_password_link_can_be_requested(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member@example.test',
        ]);

        $this->post('/forgot-password', ['email' => $user->email])
            ->assertSessionHas('status', __(Password::RESET_LINK_SENT))
            ->assertSessionHasNoErrors();

        Notification::assertSentTo($user, ResetPasswordNotification::class);
    }

    public function test_reset_link_preserves_the_safe_page_that_started_recovery(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member@example.test',
        ]);
        $returnTo = '/booking?date=2026-08-02#booking-content';

        $this->post('/forgot-password', [
            'email' => $user->email,
            'return_to' => $returnTo,
        ]);

        Notification::assertSentTo(
            $user,
            ResetPasswordNotification::class,
            function (ResetPasswordNotification $notification) use ($user, $returnTo) {
                $mail = $notification->toMail($user);
                $query = parse_url((string) $mail->actionUrl, PHP_URL_QUERY);
                parse_str((string) $query, $parameters);

                return ($parameters['email'] ?? null) === $user->email
                    && ($parameters['return_to'] ?? null) === $returnTo;
            },
        );
    }

    public function test_unknown_email_receives_the_same_forgot_password_response(): void
    {
        Notification::fake();

        $this->post('/forgot-password', [
            'email' => 'unknown@example.test',
        ])
            ->assertSessionHas('status', __(Password::RESET_LINK_SENT))
            ->assertSessionHasNoErrors();

        Notification::assertNothingSent();
    }

    public function test_reset_password_screen_can_be_rendered(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member@example.test',
        ]);

        $this->post('/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $returnTo = '/pricing?plan=3#membership';
            $response = $this->get(
                '/reset-password/'.$notification->token.'?'.http_build_query([
                    'email' => $user->email,
                    'return_to' => $returnTo,
                ]),
            );

            $response->assertRedirect(
                '/?auth=reset&return_to=%2Fpricing%3Fplan%3D3%23membership'
                .'#token='.$notification->token.'&email=member%40example.test',
            );

            return true;
        });
    }

    public function test_password_can_be_reset_with_valid_token(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member@example.test',
        ]);

        $this->post('/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $response = $this->post('/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'password',
                'password_confirmation' => 'password',
                'return_to' => '/pricing?plan=3#membership',
            ]);

            $response
                ->assertSessionHasNoErrors()
                ->assertRedirect(
                    '/pricing?plan=3&auth=login&password_reset=1#membership',
                )
                ->assertSessionMissing('url.intended')
                ->assertSessionHas('status', __(Password::PASSWORD_RESET));

            return true;
        });
    }

    public function test_password_reset_rejects_an_external_return_target(): void
    {
        Notification::fake();
        $user = User::factory()->create();

        $this->post('/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $this->post('/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'password',
                'password_confirmation' => 'password',
                'return_to' => 'https://example.com/phishing',
            ])
                ->assertSessionHasNoErrors()
                ->assertRedirect('/?auth=login&password_reset=1');

            return true;
        });
    }
}
