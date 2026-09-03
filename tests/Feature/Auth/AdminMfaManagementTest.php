<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AdminSessionSecurity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use OTPHP\TOTP;
use Spatie\Permission\Models\Role;
use Symfony\Component\Clock\NativeClock;
use Tests\TestCase;

class AdminMfaManagementTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'JBSWY3DPEHPK3PXP';

    public function test_security_status_exposes_factor_metadata_without_secrets(): void
    {
        $staff = $this->staff();
        $staff->passkeys()->create([
            'name' => 'MacBook Touch ID',
            'credential_id' => 'status-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);

        $response = $this->getJson('/ubsc-staff/account/security')
            ->assertOk()
            ->assertJsonPath('mfa.enabled', true)
            ->assertJsonPath('mfa.required', true)
            ->assertJsonPath('mfa.passkeys.0.name', 'MacBook Touch ID')
            ->assertJsonPath('mfa.totp.enabled', true)
            ->assertJsonPath('mfa.recovery_codes.remaining', 2)
            ->assertJsonPath('mfa.recovery_codes.total', 10)
            ->assertJsonPath('step_up.verified', false)
            ->assertJsonPath('step_up.password_verified', false)
            ->assertJsonPath('step_up.mfa_verified', false)
            ->assertJsonPath('step_up.methods.0', 'passkey')
            ->assertJsonPath('step_up.methods.1', 'totp')
            ->assertJsonPath('step_up.methods.2', 'recovery');

        $payload = $response->json();
        $this->assertArrayNotHasKey('totp_secret', $payload['mfa']);
        $this->assertArrayNotHasKey('recovery_codes', $payload['mfa']['recovery_codes']);
    }

    public function test_a_factor_mutation_requires_a_fresh_purpose_bound_step_up(): void
    {
        $staff = $this->staff();
        $passkey = $staff->passkeys()->create([
            'name' => 'Original name',
            'credential_id' => 'purpose-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);

        $this->deleteJson("/ubsc-staff/account/security/mfa/passkeys/{$passkey->id}")
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');

        $this->stepUp('remove_totp');

        // A valid grant for a different operation is rejected and burned.
        $this->deleteJson("/ubsc-staff/account/security/mfa/passkeys/{$passkey->id}")
            ->assertStatus(428);
        $this->deleteJson('/ubsc-staff/account/security/mfa/totp')
            ->assertStatus(428);

        $this->assertSame('Original name', $passkey->fresh()->name);
    }

    public function test_a_step_up_grant_is_single_use_and_current_session_survives_version_bump(): void
    {
        $staff = $this->staff();
        $passkey = $staff->passkeys()->create([
            'name' => 'Device to remove',
            'credential_id' => 'single-use-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);
        $replayTarget = $staff->passkeys()->create([
            'name' => 'Replay target',
            'credential_id' => 'single-use-replay-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);
        $version = (int) $staff->adminMfaSetting()->firstOrFail()->version;

        $this->stepUp('remove_passkey');
        $this->deleteJson("/ubsc-staff/account/security/mfa/passkeys/{$passkey->id}")
            ->assertOk()
            ->assertJsonStructure(['csrf_token']);

        $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
        $this->assertSame(
            $version + 1,
            (int) $staff->adminMfaSetting()->firstOrFail()->version,
        );
        $this->assertSame(
            $version + 1,
            (int) session(AdminSessionSecurity::MFA_VERSION),
        );
        $this->assertSame('totp', session(AdminSessionSecurity::MFA_METHOD));
        $this->assertGreaterThan(
            0,
            (int) session(AdminSessionSecurity::MFA_VERIFIED_AT),
        );
        $this->getJson('/ubsc-staff/account/security')->assertOk();

        $this->deleteJson("/ubsc-staff/account/security/mfa/passkeys/{$replayTarget->id}")
            ->assertStatus(428);
        $this->assertDatabaseHas('passkeys', ['id' => $replayTarget->id]);
    }

    public function test_the_last_primary_factor_cannot_be_removed(): void
    {
        $staff = $this->staff();
        $passkey = $staff->passkeys()->create([
            'name' => 'Only factor',
            'credential_id' => 'only-factor-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);

        $this->stepUp('remove_passkey');
        $staff->adminMfaSetting()->update([
            'totp_secret' => null,
            'totp_confirmed_at' => null,
            'totp_last_used_step' => null,
        ]);

        $this->deleteJson("/ubsc-staff/account/security/mfa/passkeys/{$passkey->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('passkey');
        $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
    }

    public function test_totp_cannot_be_removed_until_a_passkey_exists(): void
    {
        $staff = $this->staff();
        $this->stepUp('remove_totp');

        $this->deleteJson('/ubsc-staff/account/security/mfa/totp')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('totp');
        $this->assertNotNull(
            $staff->adminMfaSetting()->firstOrFail()->totp_confirmed_at,
        );
    }

    public function test_totp_replacement_is_confirmed_before_the_old_secret_is_replaced(): void
    {
        $staff = $this->staff();
        $oldSecret = $staff->adminMfaSetting()->firstOrFail()->totp_secret;
        $this->stepUp('replace_totp');

        $options = $this->postJson('/ubsc-staff/account/security/mfa/totp/options')
            ->assertOk()
            ->json();
        $this->getJson('/ubsc-staff/account/security')
            ->assertOk()
            ->assertJsonPath('step_up.verified', false);
        $this->assertSame($oldSecret, $staff->adminMfaSetting()->firstOrFail()->totp_secret);

        // TOTP setup intentionally survives beyond the shorter WebAuthn
        // challenge window so an admin has time to scan and save the seed.
        $this->travel(2)->minutes();
        $newCode = TOTP::createFromSecret($options['secret'], new NativeClock)
            ->at(now()->timestamp);
        $this->putJson('/ubsc-staff/account/security/mfa/totp', [
            'code' => $newCode,
        ])->assertOk();

        // The ceremony is consumed even if the same payload is replayed.
        $this->putJson('/ubsc-staff/account/security/mfa/totp', [
            'code' => $newCode,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credential');

        $this->assertSame(
            $options['secret'],
            $staff->adminMfaSetting()->firstOrFail()->totp_secret,
        );
        $this->getJson('/ubsc-staff/account/security')->assertOk();
    }

    public function test_passkey_registration_begin_consumes_the_step_up_grant(): void
    {
        $this->staff();
        $this->stepUp('add_passkey');

        $this->getJson('/ubsc-staff/account/security/mfa/passkeys/options')
            ->assertOk()
            ->assertJsonStructure(['options']);
        $this->getJson('/ubsc-staff/account/security')
            ->assertOk()
            ->assertJsonPath('step_up.verified', false);

        // Beginning the same ceremony again requires another fresh factor.
        $this->getJson('/ubsc-staff/account/security/mfa/passkeys/options')
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');
    }

    public function test_recovery_rotation_keeps_old_codes_active_until_acknowledged(): void
    {
        $staff = $this->staff();
        $before = $staff->adminMfaSetting()->firstOrFail();
        $oldHashes = $before->recovery_codes;
        $oldRecoveryVersion = (int) $before->recovery_codes_version;
        $oldMfaVersion = (int) $before->version;
        $this->stepUp('rotate_recovery_codes');

        $bundle = $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes')
            ->assertOk()
            ->json();

        $pending = $staff->adminMfaSetting()->firstOrFail();
        $this->assertSame($oldHashes, $pending->recovery_codes);
        $this->assertSame($oldRecoveryVersion, (int) $pending->recovery_codes_version);
        $this->assertNotNull($pending->recovery_codes_acknowledged_at);

        // Saving recovery codes is allowed beyond the 90-second WebAuthn
        // window, while remaining strictly bounded by its own ceremony TTL.
        $this->travel(2)->minutes();
        $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $bundle['recovery_codes_version'],
        ])->assertOk();

        $rotated = $staff->adminMfaSetting()->firstOrFail();
        $this->assertNotSame($oldHashes, $rotated->recovery_codes);
        $this->assertSame($oldRecoveryVersion + 1, (int) $rotated->recovery_codes_version);
        $this->assertSame($oldMfaVersion + 1, (int) $rotated->version);
        $this->assertNotNull($rotated->recovery_codes_acknowledged_at);
        $this->getJson('/ubsc-staff/account/security')->assertOk();

        $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $bundle['recovery_codes_version'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credential');
    }

    public function test_expired_totp_ceremony_is_rejected_and_burned(): void
    {
        $staff = $this->staff();
        $oldSecret = $staff->adminMfaSetting()->firstOrFail()->totp_secret;
        $this->stepUp('replace_totp');
        $options = $this->postJson('/ubsc-staff/account/security/mfa/totp/options')
            ->assertOk()
            ->json();

        $this->travel(10)->minutes();
        $newCode = TOTP::createFromSecret($options['secret'], new NativeClock)
            ->at(now()->timestamp);

        foreach ([1, 2] as $attempt) {
            $this->putJson('/ubsc-staff/account/security/mfa/totp', [
                'code' => $newCode,
            ])->assertUnprocessable()
                ->assertJsonValidationErrors('credential');
        }

        $this->assertSame($oldSecret, $staff->adminMfaSetting()->firstOrFail()->totp_secret);
    }

    public function test_expired_recovery_ceremony_preserves_the_old_codes(): void
    {
        $staff = $this->staff();
        $before = $staff->adminMfaSetting()->firstOrFail();
        $oldHashes = $before->recovery_codes;
        $oldVersion = (int) $before->recovery_codes_version;
        $this->stepUp('rotate_recovery_codes');
        $bundle = $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes')
            ->assertOk()
            ->json();

        $this->travel(10)->minutes();
        $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $bundle['recovery_codes_version'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credential');

        $after = $staff->adminMfaSetting()->firstOrFail();
        $this->assertSame($oldHashes, $after->recovery_codes);
        $this->assertSame($oldVersion, (int) $after->recovery_codes_version);
    }

    public function test_recovery_rotation_can_be_cancelled_without_revoking_old_codes(): void
    {
        $staff = $this->staff();
        $before = $staff->adminMfaSetting()->firstOrFail();
        $oldHashes = $before->recovery_codes;
        $oldVersion = (int) $before->recovery_codes_version;
        $this->stepUp('rotate_recovery_codes');
        $bundle = $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes')
            ->assertOk()
            ->json();

        $this->deleteJson('/ubsc-staff/account/security/mfa/recovery-codes/pending')
            ->assertOk()
            ->assertJsonStructure(['message', 'csrf_token']);

        $this->postJson('/ubsc-staff/account/security/mfa/recovery-codes/acknowledge', [
            'acknowledged' => true,
            'recovery_codes_version' => $bundle['recovery_codes_version'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('credential');

        $after = $staff->adminMfaSetting()->firstOrFail();
        $this->assertSame($oldHashes, $after->recovery_codes);
        $this->assertSame($oldVersion, (int) $after->recovery_codes_version);
    }

    public function test_passkey_mutations_are_scoped_to_the_authenticated_owner(): void
    {
        $this->staff();
        $other = User::factory()->create();
        $foreignPasskey = $other->passkeys()->create([
            'name' => 'Foreign device',
            'credential_id' => 'foreign-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);
        $this->patchJson("/ubsc-staff/account/security/mfa/passkeys/{$foreignPasskey->id}", [
            'name' => 'Stolen device',
        ])->assertNotFound();
        $this->assertSame('Foreign device', $foreignPasskey->fresh()->name);
    }

    public function test_passkey_label_changes_are_metadata_only_and_do_not_require_step_up(): void
    {
        $staff = $this->staff();
        $passkey = $staff->passkeys()->create([
            'name' => 'Kunci lama',
            'credential_id' => 'metadata-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);
        $version = (int) $staff->adminMfaSetting()->firstOrFail()->version;

        $this->patchJson("/ubsc-staff/account/security/mfa/passkeys/{$passkey->id}", [
            'name' => 'Kunci kantor',
        ])->assertOk()
            ->assertJsonStructure(['csrf_token']);

        $this->assertSame('Kunci kantor', $passkey->fresh()->name);
        $this->assertSame(
            $version,
            (int) $staff->adminMfaSetting()->firstOrFail()->version,
        );
    }

    public function test_expired_step_up_grant_is_rejected(): void
    {
        $staff = $this->staff();
        $passkey = $staff->passkeys()->create([
            'name' => 'Expiry test',
            'credential_id' => 'expiry-passkey',
            'credential' => ['aaguid' => '00000000-0000-0000-0000-000000000000'],
        ]);
        $this->stepUp('remove_passkey');
        $this->travel(5)->minutes();

        $this->deleteJson("/ubsc-staff/account/security/mfa/passkeys/{$passkey->id}")
            ->assertStatus(428);
        $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
    }

    public function test_staff_profile_can_be_updated_through_the_protected_account_route(): void
    {
        $staff = $this->staff();

        $this->post('/ubsc-staff/account/profile', [
            '_method' => 'patch',
            'name' => 'Admin Keamanan',
            'email' => $staff->email,
        ])->assertRedirect();

        $this->assertSame('Admin Keamanan', $staff->fresh()->name);
        $this->assertAuthenticatedAs($staff);
    }

    public function test_staff_password_can_be_updated_through_the_protected_account_route(): void
    {
        $staff = $this->staff();

        $this->put('/ubsc-staff/account/password', [
            'current_password' => 'password',
            'password' => 'new-secure-password',
            'password_confirmation' => 'new-secure-password',
        ])->assertRedirect(route('ubsc-staff.login'));

        $this->assertTrue(Hash::check('new-secure-password', $staff->fresh()->password));
        $this->assertGuest();
    }

    private function stepUp(string $purpose): void
    {
        $code = TOTP::createFromSecret(self::SECRET, new NativeClock)
            ->at(now()->timestamp);

        $this->postJson('/ubsc-staff/account/security/mfa/step-up/totp', [
            'code' => $code,
            'purpose' => $purpose,
        ])->assertOk()
            ->assertJsonPath('step_up.verified', true)
            ->assertJsonPath('step_up.purpose', $purpose);

    }

    private function staff(): User
    {
        Role::findOrCreate('Administrator', 'web');
        $staff = User::factory()->create();
        $staff->assignRole('Administrator');
        $this->actingAs($staff);
        $staff->adminMfaSetting()->firstOrFail()->forceFill([
            'totp_secret' => self::SECRET,
            'totp_confirmed_at' => now(),
            'totp_last_used_step' => null,
            'recovery_codes' => [
                $this->recoveryHash('RECOVERY-ONE'),
                $this->recoveryHash('RECOVERY-TWO'),
            ],
            'recovery_codes_generated_at' => now(),
            'recovery_codes_acknowledged_at' => now(),
            'recovery_codes_version' => 1,
            'enabled_at' => now(),
        ])->save();

        return $staff;
    }

    private function recoveryHash(string $code): string
    {
        return hash_hmac(
            'sha256',
            strtoupper(preg_replace('/[^A-Z0-9]+/i', '', trim($code)) ?? ''),
            (string) config('security.admin_mfa.recovery_pepper'),
        );
    }
}
