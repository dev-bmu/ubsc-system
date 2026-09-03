<?php

namespace Tests\Feature\Auth;

use App\Http\Requests\Auth\AdminLoginRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use App\Services\AuthenticationRateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class LayeredAuthenticationRateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RateLimiter::clear('ubsc:auth:public:login:global:minute');
        RateLimiter::clear('public-login-edge:global');
        config([
            'security.admin_mfa.login.account_burst_attempts' => 2,
            'security.admin_mfa.login.account_burst_seconds' => 60,
            'security.admin_mfa.login.account_hour_attempts' => 100,
            'security.admin_mfa.login.ip_minute_attempts' => 100,
            'security.admin_mfa.login.ip_hour_attempts' => 1000,
            'security.admin_mfa.login.global_minute_attempts' => 1000,
        ]);
    }

    public function test_account_limit_follows_normalized_identity_across_ips_and_expires(): void
    {
        $user = User::factory()->create(['email' => 'member@example.test']);

        foreach (['10.0.0.1', '10.0.0.2'] as $ip) {
            $this->withServerVariables(['REMOTE_ADDR' => $ip])
                ->post('/login', [
                    'email' => ' MEMBER@EXAMPLE.TEST ',
                    'password' => 'wrong-password',
                ]);
        }

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.3'])
            ->post('/login', [
                'email' => $user->email,
                'password' => 'password',
            ])
            ->assertSessionHasErrors([
                'email' => __('auth.throttle_generic'),
            ]);
        $this->assertGuest();

        $this->travel(61)->seconds();
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.3'])
            ->post('/login', [
                'email' => $user->email,
                'password' => 'password',
            ])
            ->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_ip_limit_blocks_password_spraying_across_accounts(): void
    {
        config(['security.admin_mfa.login.ip_minute_attempts' => 2]);
        $target = User::factory()->create(['email' => 'target@example.test']);

        foreach (['first@example.test', 'second@example.test'] as $email) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.1.1'])
                ->post('/login', [
                    'email' => $email,
                    'password' => 'wrong-password',
                ]);
        }

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.1.1'])
            ->post('/login', [
                'email' => $target->email,
                'password' => 'password',
            ])
            ->assertSessionHasErrors([
                'email' => __('auth.throttle_generic'),
            ]);
        $this->assertGuest();
    }

    public function test_global_limit_blocks_distributed_login_floods(): void
    {
        config(['security.admin_mfa.login.global_minute_attempts' => 2]);
        $target = User::factory()->create(['email' => 'target@example.test']);

        foreach ([1, 2] as $index) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.2.'.$index])
                ->post('/login', [
                    'email' => "unknown{$index}@example.test",
                    'password' => 'wrong-password',
                ]);
        }

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.2.3'])
            ->post('/login', [
                'email' => $target->email,
                'password' => 'password',
            ])
            ->assertSessionHasErrors([
                'email' => __('auth.throttle_generic'),
            ]);
        $this->assertGuest();
    }

    public function test_limiter_keys_are_stable_and_never_contain_email_or_ip(): void
    {
        $request = Request::create('/login', 'POST', server: [
            'REMOTE_ADDR' => '203.0.113.44',
        ]);
        $limiter = app(AuthenticationRateLimiter::class);
        $first = $limiter->loginKeys($request, 'member@example.test');
        $second = $limiter->loginKeys($request, 'member@example.test');

        $this->assertSame($first, $second);

        foreach ($first as $key) {
            $this->assertStringNotContainsString('member@example.test', $key);
            $this->assertStringNotContainsString('203.0.113.44', $key);
        }
    }

    public function test_both_login_portals_share_the_configured_timing_envelope(): void
    {
        config(['security.admin_mfa.login.timebox_ms' => 1000]);

        foreach ([new LoginRequest, new AdminLoginRequest] as $request) {
            $method = new \ReflectionMethod($request, 'loginTimeboxMicroseconds');

            $this->assertSame(1_000_000, $method->invoke($request));
        }
    }

    public function test_email_identity_is_canonicalized_on_every_user_write(): void
    {
        $user = User::factory()->create([
            'email' => '  Mixed.Case@Example.Test  ',
        ]);

        $this->assertSame('mixed.case@example.test', $user->email);
        $this->assertDatabaseHas('users', [
            'id' => $user->getKey(),
            'email' => 'mixed.case@example.test',
        ]);
    }
}
