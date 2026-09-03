<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\User;
use App\Services\AdminSessionSecurity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use OTPHP\TOTP;
use Spatie\Permission\Models\Role;
use Symfony\Component\Clock\NativeClock;
use Tests\TestCase;

class AdminSessionSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['web', 'auth', 'admin.session'])
            ->get('/_test/admin-session-security', fn () => response()->json(['ok' => true]));
    }

    public function test_staff_login_requires_mfa_then_rotates_into_a_verified_session(): void
    {
        $staff = $this->staffUser();
        $this->get('/ubsc-staff/login');
        $oldId = session()->getId();
        $oldToken = session()->token();

        $response = $this->post('/ubsc-staff/login', [
            'email' => $staff->email,
            'password' => 'password',
            'remember' => true,
        ]);

        $this->assertGuest();
        $this->assertNotSame($oldId, session()->getId());
        $this->assertNotSame($oldToken, session()->token());

        $response->assertRedirect(route('ubsc-staff.mfa'));

        $options = $this->postJson('/ubsc-staff/mfa/totp/options')
            ->assertOk()
            ->json();
        $code = TOTP::createFromSecret($options['secret'], new NativeClock)->now();
        $enrollment = $this->postJson('/ubsc-staff/mfa/totp/enroll', [
            'code' => $code,
        ])->assertOk();
        $this->assertCount(10, $enrollment->json('recovery_codes'));

        $completed = $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $enrollment->json('recovery_codes_version'),
        ]);

        $this->assertAuthenticatedAs($staff);
        $this->assertNotNull(session(AdminSessionSecurity::ISSUED_AT));
        $this->assertNotNull(session(AdminSessionSecurity::LAST_ACTIVITY_AT));
        $this->assertNotNull(session(AdminSessionSecurity::ROTATED_AT));
        $this->assertNotNull(session(AdminSessionSecurity::USER_AGENT_FINGERPRINT));
        $this->assertNotNull(session(AdminSessionSecurity::MFA_VERIFIED_AT));
        $this->assertSame('totp', session(AdminSessionSecurity::MFA_METHOD));
        $completed
            ->assertOk()
            ->assertJsonPath('redirect', route('admin.dashboard'))
            ->assertCookieMissing(auth('web')->getRecallerName());
    }

    public function test_staff_password_step_returns_the_rotated_mfa_session_cookie(): void
    {
        $staff = $this->staffUser();
        $cookieName = (string) config('session.cookie');
        $initial = $this->get('/ubsc-staff/login');
        $initialCookie = $initial->getCookie($cookieName)?->getValue();

        $this->assertIsString($initialCookie);

        $passwordStep = $this
            ->withCookie($cookieName, $initialCookie)
            ->post('/ubsc-staff/login', [
                'email' => $staff->email,
                'password' => 'password',
            ])
            ->assertRedirect(route('ubsc-staff.mfa'))
            ->assertCookieNotExpired($cookieName);

        $mfaCookie = $passwordStep->getCookie($cookieName)?->getValue();

        $this->assertIsString($mfaCookie);
        $this->assertNotSame($initialCookie, $mfaCookie);

        $this
            ->withCookie($cookieName, $mfaCookie)
            ->get('/ubsc-staff/mfa')
            ->assertOk();
    }

    public function test_admin_session_is_revoked_when_browser_fingerprint_changes(): void
    {
        $staff = $this->staffUser();

        $this->be($staff)
            ->withHeader('User-Agent', 'UBSC-Secure-Browser/1')
            ->withSession($this->verifiedSessionState($staff, 'UBSC-Secure-Browser/1'))
            ->get('/_test/admin-session-security')
            ->assertOk();

        $this->withHeader('User-Agent', 'Unexpected-Browser/9')
            ->get('/_test/admin-session-security')
            ->assertRedirect(route('ubsc-staff.login'));

        $this->assertGuest();
    }

    public function test_admin_session_has_an_idle_timeout_independent_of_session_polling(): void
    {
        config([
            'security.admin_session.bind_user_agent' => false,
            'security.admin_session.idle_minutes' => 30,
        ]);
        $staff = $this->staffUser();

        $response = $this->actingAs($staff)
            ->withSession([
                AdminSessionSecurity::ISSUED_AT => now()->subHour()->timestamp,
                AdminSessionSecurity::LAST_ACTIVITY_AT => now()->subMinutes(31)->timestamp,
                AdminSessionSecurity::ROTATED_AT => now()->subMinutes(10)->timestamp,
            ])
            ->get('/_test/admin-session-security');

        $response->assertRedirect(route('ubsc-staff.login'));
        $this->assertGuest();
    }

    public function test_active_admin_responses_are_never_cached(): void
    {
        $response = $this->actingAs($this->staffUser())
            ->get('/_test/admin-session-security')
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertSame('no-cache', $response->headers->get('Pragma'));
    }

    public function test_partial_admin_security_state_fails_closed(): void
    {
        $response = $this->be($this->staffUser())
            ->withSession([
                AdminSessionSecurity::ISSUED_AT => now()->timestamp,
            ])
            ->get('/_test/admin-session-security');

        $response->assertRedirect(route('ubsc-staff.login'));
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertGuest();
    }

    public function test_background_polling_does_not_extend_admin_idle_timeout(): void
    {
        config([
            'security.admin_session.bind_user_agent' => false,
            'security.admin_session.idle_minutes' => 30,
        ]);
        $staff = $this->staffUser();
        $issuedAt = now()->subHour()->timestamp;
        $lastHumanActivity = now()->subMinutes(29)->timestamp;
        $inertiaVersion = app(HandleInertiaRequests::class)->version(request());

        $this->actingAs($staff)
            ->withSession([
                AdminSessionSecurity::ISSUED_AT => $issuedAt,
                AdminSessionSecurity::LAST_ACTIVITY_AT => $lastHumanActivity,
                AdminSessionSecurity::MFA_VERIFIED_AT => $issuedAt,
            ])
            ->withHeaders([
                'X-Inertia' => 'true',
                'X-Inertia-Version' => $inertiaVersion,
                'X-UBSC-Background-Poll' => '1',
            ])
            ->get('/_test/admin-session-security')
            ->assertOk();

        $this->assertSame(
            $lastHumanActivity,
            session(AdminSessionSecurity::LAST_ACTIVITY_AT),
        );

        $this->travel(2)->minutes();
        $this->withHeaders([
            'X-Inertia' => 'true',
            'X-Inertia-Version' => $inertiaVersion,
            'X-UBSC-Background-Poll' => '1',
        ])->get('/_test/admin-session-security')
            ->assertRedirect(route('ubsc-staff.login'));
        $this->assertGuest();
    }

    private function staffUser(): User
    {
        $role = Role::firstOrCreate([
            'name' => 'Administrator',
            'guard_name' => 'web',
        ]);
        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }

    /** @return array<string, int|string> */
    private function verifiedSessionState(User $user, string $userAgent): array
    {
        $setting = $user->adminMfaSetting()->firstOrCreate([], [
            'totp_secret' => 'TESTMFASECRET',
            'totp_confirmed_at' => now(),
            'recovery_codes' => [hash('sha256', 'test-recovery-code')],
            'recovery_codes_acknowledged_at' => now(),
            'enabled_at' => now(),
            'version' => 1,
        ]);
        $request = Request::create('/', 'GET', server: [
            'HTTP_USER_AGENT' => $userAgent,
        ]);
        $now = now()->timestamp;

        return [
            AdminSessionSecurity::ISSUED_AT => $now,
            AdminSessionSecurity::LAST_ACTIVITY_AT => $now,
            AdminSessionSecurity::ROTATED_AT => $now,
            AdminSessionSecurity::USER_AGENT_FINGERPRINT => app(AdminSessionSecurity::class)
                ->fingerprint($request),
            AdminSessionSecurity::MFA_VERIFIED_AT => $now,
            AdminSessionSecurity::MFA_METHOD => 'passkey',
            AdminSessionSecurity::MFA_VERSION => (int) $setting->version,
        ];
    }
}
