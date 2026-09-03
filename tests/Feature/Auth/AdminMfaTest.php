<?php

namespace Tests\Feature\Auth;

use App\Models\AdminMfaSetting;
use App\Models\User;
use App\Services\AdminMfaManager;
use App\Services\AdminMfaPreauthentication;
use App\Services\AdminSessionSecurity;
use App\Services\AuthSessionCoordinator;
use App\Support\VerifiedAdminCredential;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use OTPHP\TOTP;
use Spatie\Permission\Models\Role;
use Symfony\Component\Clock\NativeClock;
use Tests\TestCase;

class AdminMfaTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_unknown_and_non_staff_admin_logins_are_indistinguishable(): void
    {
        $staff = $this->staffUser();
        $member = User::factory()->create([
            'email' => 'member@example.test',
        ]);

        $attempts = [
            ['email' => 'unknown@example.test', 'password' => 'password'],
            ['email' => $staff->email, 'password' => 'wrong-password'],
            ['email' => $member->email, 'password' => 'password'],
        ];
        $messages = [];

        foreach ($attempts as $credentials) {
            $response = $this->from('/ubsc-staff/login')
                ->post('/ubsc-staff/login', $credentials);

            $response
                ->assertRedirect('/ubsc-staff/login')
                ->assertSessionHasErrors('email');
            $messages[] = session('errors')->get('email')[0];
            $this->assertGuest();
        }

        $this->assertSame([
            __('auth.failed'),
            __('auth.failed'),
            __('auth.failed'),
        ], $messages);
    }

    public function test_recovery_codes_are_hashed_and_each_code_is_single_use(): void
    {
        $staff = $this->staffUser();
        [$secret, $codes, $codesVersion] = $this->enrollTotp($staff);

        $setting = $staff->adminMfaSetting()->firstOrFail();
        $this->assertSame($secret, $setting->totp_secret);
        $this->assertCount(10, $setting->recovery_codes);
        $this->assertContainsOnly('string', $setting->recovery_codes);
        $this->assertTrue(collect($setting->recovery_codes)->every(
            fn (string $hash): bool => preg_match('/^[a-f0-9]{64}$/', $hash) === 1,
        ));
        $raw = (string) AdminMfaSetting::query()
            ->whereKey($setting->getKey())
            ->toBase()
            ->value('recovery_codes');
        $rawSecret = (string) AdminMfaSetting::query()
            ->whereKey($setting->getKey())
            ->toBase()
            ->value('totp_secret');
        $this->assertStringNotContainsString($secret, $rawSecret);
        $this->assertStringNotContainsString(str_replace('-', '', $codes[0]), $raw);

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $codesVersion,
        ])->assertOk();
        $this->assertAuthenticatedAs($staff);
        $this->post('/ubsc-staff/logout')->assertRedirect('/ubsc-staff/login');

        $this->beginAdminLogin($staff);
        $this->postJson('/ubsc-staff/mfa/recovery', [
            'code' => strtolower($codes[0]),
        ])->assertOk();
        $this->assertAuthenticatedAs($staff);
        $this->post('/ubsc-staff/logout');

        $this->beginAdminLogin($staff);
        $this->postJson('/ubsc-staff/mfa/recovery', [
            'code' => $codes[0],
        ])->assertUnprocessable();
        $this->assertGuest();
    }

    public function test_totp_codes_cannot_be_replayed_within_the_same_time_step(): void
    {
        $staff = $this->staffUser();
        [$secret, , $codesVersion] = $this->enrollTotp($staff);
        $initialCode = TOTP::createFromSecret($secret, new NativeClock)
            ->at(now()->timestamp);

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $codesVersion,
        ])->assertOk();
        $this->post('/ubsc-staff/logout');

        $this->beginAdminLogin($staff);
        $this->postJson('/ubsc-staff/mfa/totp/verify', [
            'code' => $initialCode,
        ])->assertUnprocessable();
        $this->assertGuest();

        $this->travel(31)->seconds();
        $nextCode = TOTP::createFromSecret($secret, new NativeClock)
            ->at(now()->timestamp);
        $this->postJson('/ubsc-staff/mfa/totp/verify', [
            'code' => $nextCode,
        ])->assertOk();
        $this->assertAuthenticatedAs($staff);
    }

    public function test_passkey_enrollment_can_add_totp_before_recovery_codes_are_acknowledged(): void
    {
        $staff = $this->staffUser();
        $this->beginAdminLogin($staff);
        $abandonedSecret = $this->postJson('/ubsc-staff/mfa/totp/options')
            ->assertOk()
            ->json('secret');
        $staff->passkeys()->create([
            'name' => 'Test security key',
            'credential_id' => 'test-credential-id',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);
        $bundle = app(AdminMfaManager::class)->enableAfterPasskeyEnrollment($staff);

        $this->withSession([
            AdminMfaPreauthentication::ENROLLMENT_METHOD => 'passkey',
            AdminMfaPreauthentication::RECOVERY_CODES => $bundle['codes'],
            AdminMfaPreauthentication::RECOVERY_CODES_VERSION => $bundle['version'],
        ]);

        $options = $this->postJson('/ubsc-staff/mfa/totp/options')
            ->assertOk()
            ->json();
        $this->assertNotSame($abandonedSecret, $options['secret']);
        $code = TOTP::createFromSecret($options['secret'], new NativeClock)
            ->at(now()->timestamp);

        $response = $this->postJson('/ubsc-staff/mfa/totp/enroll', [
            'code' => $code,
        ])->assertOk();

        $response
            ->assertJsonPath('secondary_totp_enabled', true)
            ->assertJsonPath('recovery_codes', $bundle['codes'])
            ->assertJsonPath('recovery_codes_version', $bundle['version']);
        $this->assertGuest();
        $this->assertNotNull(
            $staff->adminMfaSetting()->firstOrFail()->totp_confirmed_at,
        );

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $bundle['version'],
        ])->assertOk();
        $this->assertAuthenticatedAs($staff);
    }

    public function test_package_passwordless_routes_are_not_exposed(): void
    {
        $this->get('/passkeys/login/options')->assertNotFound();
        $this->postJson('/passkeys/login', [])->assertNotFound();
    }

    public function test_interrupted_enrollment_reissues_recovery_codes_after_primary_factor(): void
    {
        $staff = $this->staffUser();
        [$secret, $initialCodes] = $this->enrollTotp($staff);

        $this->postJson('/ubsc-staff/mfa/cancel')->assertOk();
        $this->assertGuest();
        $this->travel(31)->seconds();
        $this->beginAdminLogin($staff);
        $nextCode = TOTP::createFromSecret($secret, new NativeClock)
            ->at(now()->timestamp);

        $replacementResponse = $this->postJson('/ubsc-staff/mfa/totp/verify', [
            'code' => $nextCode,
        ])->assertOk();
        $replacement = $replacementResponse->json('recovery_codes');
        $replacementVersion = $replacementResponse->json('recovery_codes_version');

        $this->assertGuest();
        $this->assertCount(10, $replacement);
        $this->assertNotSame($initialCodes, $replacement);

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $replacementVersion,
        ])->assertOk();
        $this->assertAuthenticatedAs($staff);
    }

    public function test_recovery_proof_can_repair_an_interrupted_acknowledgement(): void
    {
        $staff = $this->staffUser();
        [, $initialCodes] = $this->enrollTotp($staff);

        $this->postJson('/ubsc-staff/mfa/cancel')->assertOk();
        $this->beginAdminLogin($staff);

        $replacementResponse = $this->postJson('/ubsc-staff/mfa/recovery', [
            'code' => $initialCodes[0],
        ])->assertOk();
        $replacement = $replacementResponse->json('recovery_codes');
        $replacementVersion = $replacementResponse->json('recovery_codes_version');

        $this->assertGuest();
        $this->assertCount(10, $replacement);
        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $replacementVersion,
        ])->assertOk();
        $this->assertAuthenticatedAs($staff);
    }

    public function test_stale_recovery_code_display_cannot_be_acknowledged(): void
    {
        $staff = $this->staffUser();
        [, , $displayedVersion] = $this->enrollTotp($staff);

        $bundle = app(AdminMfaManager::class)
            ->reissueUnacknowledgedRecoveryCodes($staff);
        $this->assertNotNull($bundle);

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $displayedVersion,
        ])->assertStatus(409)
            ->assertJsonPath('redirect', route('ubsc-staff.login'));
        $this->assertGuest();
        $this->assertNull(
            $staff->adminMfaSetting()->firstOrFail()->recovery_codes_acknowledged_at,
        );
    }

    public function test_older_tab_cannot_acknowledge_a_newer_recovery_code_bundle(): void
    {
        $staff = $this->staffUser();
        [, , $olderTabVersion] = $this->enrollTotp($staff);

        $newerBundle = app(AdminMfaManager::class)
            ->reissueUnacknowledgedRecoveryCodes($staff);
        $this->assertNotNull($newerBundle);
        $this->assertGreaterThan($olderTabVersion, $newerBundle['version']);

        $this->withSession([
            AdminMfaPreauthentication::ENROLLMENT_METHOD => 'totp',
            AdminMfaPreauthentication::RECOVERY_CODES => $newerBundle['codes'],
            AdminMfaPreauthentication::RECOVERY_CODES_VERSION => $newerBundle['version'],
        ]);

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $olderTabVersion,
        ])->assertStatus(409)
            ->assertJsonPath('redirect', route('ubsc-staff.login'));

        $this->assertGuest();
        $this->assertNull(
            $staff->adminMfaSetting()->firstOrFail()->recovery_codes_acknowledged_at,
        );
    }

    public function test_password_change_invalidates_pending_admin_preauthentication(): void
    {
        $staff = $this->staffUser();
        $this->beginAdminLogin($staff);

        $staff->forceFill(['password' => Hash::make('new-secure-password')])->save();

        $this->get('/ubsc-staff/mfa')
            ->assertRedirect(route('ubsc-staff.login'));
        $this->assertGuest();
    }

    public function test_password_change_between_verification_and_preauthentication_is_rejected(): void
    {
        $staff = $this->staffUser();
        $preauthentication = new class(app(AuthSessionCoordinator::class), app(AdminSessionSecurity::class)) extends AdminMfaPreauthentication
        {
            public function start(
                Request $request,
                VerifiedAdminCredential $verifiedCredential,
            ): void {
                User::query()
                    ->whereKey($verifiedCredential->userId)
                    ->update(['password' => Hash::make('rotated-between-phases')]);

                parent::start($request, $verifiedCredential);
            }
        };
        $this->app->instance(AdminMfaPreauthentication::class, $preauthentication);

        $this->from('/ubsc-staff/login')
            ->post('/ubsc-staff/login', [
                'email' => $staff->email,
                'password' => 'password',
            ])
            ->assertRedirect('/ubsc-staff/login')
            ->assertSessionHasErrors([
                'email' => __('auth.failed'),
            ]);

        $this->assertGuest();
        $this->assertFalse(session()->has(AdminMfaPreauthentication::USER_ID));
        $this->assertFalse(session()->has(AdminMfaPreauthentication::CREDENTIAL_FINGERPRINT));
        $this->assertTrue(Hash::check(
            'rotated-between-phases',
            $staff->fresh()->getAuthPassword(),
        ));
    }

    public function test_credential_change_during_mfa_finalization_cannot_create_an_admin_session(): void
    {
        $staff = $this->staffUser();
        [$secret, , $codesVersion] = $this->enrollTotp($staff);

        $this->postJson('/ubsc-staff/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $codesVersion,
        ])->assertOk();
        $this->post('/ubsc-staff/logout')->assertRedirect('/ubsc-staff/login');

        $this->travel(31)->seconds();
        $this->beginAdminLogin($staff);

        $preauthentication = new class(app(AuthSessionCoordinator::class), app(AdminSessionSecurity::class)) extends AdminMfaPreauthentication
        {
            private int $pendingUserCalls = 0;

            public function pendingUser(Request $request): ?User
            {
                $user = parent::pendingUser($request);
                $this->pendingUserCalls++;

                // The first call is the route middleware. Mutate the
                // credential after complete() performs its initial check but
                // before it obtains the final user/MFA row locks.
                if ($this->pendingUserCalls === 2 && $user !== null) {
                    app(\App\Services\CredentialSecurity::class)
                        ->replacePassword($user, 'rotated-during-finalization');
                }

                return $user;
            }
        };
        $this->app->instance(AdminMfaPreauthentication::class, $preauthentication);

        $code = TOTP::createFromSecret($secret, new NativeClock)
            ->at(now()->timestamp);

        $this->postJson('/ubsc-staff/mfa/totp/verify', [
            'code' => $code,
        ])->assertUnauthorized();

        $this->assertGuest();
        $this->assertFalse(session()->has(AdminMfaPreauthentication::USER_ID));
        $this->assertFalse(session()->has(AdminMfaPreauthentication::MFA_VERSION));
        $this->assertTrue(Hash::check(
            'rotated-during-finalization',
            $staff->fresh()->getAuthPassword(),
        ));
    }

    public function test_malformed_mfa_submissions_are_limited_before_validation(): void
    {
        $staff = $this->staffUser();
        $this->beginAdminLogin($staff);

        for ($attempt = 1; $attempt <= 30; $attempt++) {
            $this->postJson('/ubsc-staff/mfa/totp/verify', [])
                ->assertUnprocessable();
        }

        $this->postJson('/ubsc-staff/mfa/totp/verify', [])
            ->assertStatus(429)
            ->assertJsonPath('message', __('auth.throttle_generic'));
    }

    public function test_oversized_mfa_payload_is_rejected_before_credential_parsing(): void
    {
        $staff = $this->staffUser();
        $this->beginAdminLogin($staff);

        $this->postJson('/ubsc-staff/mfa/recovery', [
            'code' => str_repeat('A', 1_048_577),
        ])->assertStatus(413)
            ->assertJsonPath('message', __('auth.mfa_invalid'));
    }

    public function test_admin_session_without_mfa_proof_fails_closed(): void
    {
        $staff = $this->staffUser();
        $staff->adminMfaSetting()->create([
            'enabled_at' => now(),
            'version' => 1,
        ]);

        $this->be($staff)
            ->withSession([
                AdminSessionSecurity::ISSUED_AT => now()->timestamp,
                AdminSessionSecurity::LAST_ACTIVITY_AT => now()->timestamp,
                AdminSessionSecurity::ROTATED_AT => now()->timestamp,
                AdminSessionSecurity::USER_AGENT_FINGERPRINT => 'missing-mfa-proof',
            ])
            ->get('/ubsc-staff')
            ->assertRedirect(route('ubsc-staff.login'));

        $this->assertGuest();
    }

    /** @return array{0:string, 1:array<int, string>, 2:int} */
    private function enrollTotp(User $staff): array
    {
        $this->beginAdminLogin($staff);
        $options = $this->postJson('/ubsc-staff/mfa/totp/options')
            ->assertOk()
            ->json();
        $secret = $options['secret'];
        $code = TOTP::createFromSecret($secret, new NativeClock)
            ->at(now()->timestamp);
        $response = $this->postJson('/ubsc-staff/mfa/totp/enroll', [
            'code' => $code,
        ])->assertOk();
        $codes = $response->json('recovery_codes');
        $codesVersion = (int) $response->json('recovery_codes_version');

        return [$secret, $codes, $codesVersion];
    }

    private function beginAdminLogin(User $staff): void
    {
        $this->post('/ubsc-staff/login', [
            'email' => '  '.strtoupper($staff->email).'  ',
            'password' => 'password',
        ])->assertRedirect(route('ubsc-staff.mfa'));

        $this->assertGuest();
    }

    private function staffUser(): User
    {
        $role = Role::firstOrCreate([
            'name' => 'Administrator',
            'guard_name' => 'web',
        ]);
        $user = User::factory()->create([
            'email' => 'admin@example.test',
        ]);
        $user->assignRole($role);

        return $user;
    }
}
