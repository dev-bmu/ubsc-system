<?php

namespace Tests\Feature\Auth;

use App\Models\AdminMfaSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use OTPHP\TOTP;
use Spatie\Permission\Models\Role;
use Symfony\Component\Clock\NativeClock;
use Tests\TestCase;

class AdminStaffAccountSecurityTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'JBSWY3DPEHPK3PXP';

    protected function setUp(): void
    {
        parent::setUp();
        config(['session.driver' => 'database']);

        foreach (['Administrator', 'Manager', 'Finance', 'Staff Central', 'Staff Front Office'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    public function test_every_staff_mutation_requires_a_fresh_purpose_bound_mfa_grant(): void
    {
        $this->administrator();
        $target = $this->staff('Manager');

        $this->postJson(route('admin.settings.users.store'), $this->createPayload())
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');

        $this->putJson(route('admin.settings.users.update', $target), $this->updatePayload($target))
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');

        $this->deleteJson(route('admin.settings.users.destroy', $target))
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');

        $this->stepUp('remove_totp');

        // A real proof for another operation cannot authorize staff-account
        // administration and is burned on the failed use.
        $this->putJson(route('admin.settings.users.update', $target), $this->updatePayload($target))
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');

        $this->getJson('/ubsc-staff/account/security')
            ->assertOk()
            ->assertJsonPath('step_up.verified', false);

        $this->assertDatabaseHas('users', [
            'id' => $target->getKey(),
            'name' => $target->name,
        ]);
    }

    public function test_a_correct_grant_creates_one_staff_account_and_cannot_be_replayed(): void
    {
        $this->administrator();
        $this->persistPasswordResetToken('new.staff@example.test');
        $this->stepUp('manage_staff_accounts');

        $this->post(route('admin.settings.users.store'), $this->createPayload())
            ->assertRedirect()
            ->assertSessionHas('success');

        $created = User::query()->where('email', 'new.staff@example.test')->firstOrFail();
        $this->assertTrue($created->hasRole('Staff Central'));
        $this->assertNotNull($created->email_verified_at);
        $this->assertTrue(Hash::check('Strong-password-2026!', $created->password));
        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => 'new.staff@example.test',
        ]);

        $this->postJson(route('admin.settings.users.store'), [
            ...$this->createPayload(),
            'name' => 'Replay Account',
            'email' => 'replay@example.test',
        ])->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');

        $this->assertDatabaseMissing('users', ['email' => 'replay@example.test']);
    }

    public function test_non_administrator_mutations_remain_forbidden_before_the_mfa_challenge(): void
    {
        $actor = $this->staff('Finance');
        $target = $this->staff('Manager');
        $this->actingAs($actor);

        $this->postJson(route('admin.settings.users.store'), $this->createPayload())
            ->assertForbidden();
        $this->putJson(route('admin.settings.users.update', $target), $this->updatePayload($target))
            ->assertForbidden();
        $this->deleteJson(route('admin.settings.users.destroy', $target))
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $target->getKey()]);
        $this->assertDatabaseMissing('users', ['email' => 'new.staff@example.test']);
    }

    public function test_inertia_mutation_without_a_grant_returns_to_the_page_with_a_step_up_error(): void
    {
        $this->administrator();
        $target = $this->staff('Manager');

        $this->from(route('admin.settings.users'))
            ->withHeader('X-Inertia', 'true')
            ->put(route('admin.settings.users.update', $target), $this->updatePayload($target))
            ->assertRedirect(route('admin.settings.users'))
            ->assertSessionHasErrors('mfa_step_up');

        $this->assertDatabaseHas('users', [
            'id' => $target->getKey(),
            'name' => $target->name,
        ]);
    }

    public function test_email_change_resets_identity_proof_and_revokes_target_credentials(): void
    {
        $this->administrator();
        $target = $this->staff('Manager');
        $target->forceFill([
            'email_verified_at' => now(),
            'google_id' => 'google-subject-bound-to-old-email',
            'remember_token' => 'email-change-remember-token',
        ])->save();
        $setting = $this->targetMfa($target, 4);
        $this->persistTargetSession($target, 'email-change-session');
        $oldEmail = $target->email;
        $this->persistPasswordResetToken($oldEmail);
        $this->persistPasswordResetToken('replacement.email@example.test');
        $this->stepUp('manage_staff_accounts');

        $this->put(route('admin.settings.users.update', $target), [
            ...$this->updatePayload($target),
            'email' => 'Replacement.Email@Example.Test',
        ])->assertRedirect()
            ->assertSessionHas('success');

        $target->refresh();
        $this->assertSame('replacement.email@example.test', $target->email);
        $this->assertNull($target->email_verified_at);
        $this->assertNull($target->google_id);
        $this->assertNotSame('email-change-remember-token', $target->remember_token);
        $this->assertSame(5, (int) $setting->refresh()->version);
        $this->assertDatabaseMissing('sessions', ['id' => 'email-change-session']);
        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => 'replacement.email@example.test',
        ]);
        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => $oldEmail,
        ]);
    }

    public function test_role_change_revokes_target_credentials(): void
    {
        $this->administrator();
        $target = $this->staff('Manager');
        $target->forceFill(['remember_token' => 'role-change-remember-token'])->save();
        $setting = $this->targetMfa($target, 8);
        $this->persistTargetSession($target, 'role-change-session');
        $this->stepUp('manage_staff_accounts');

        $this->put(route('admin.settings.users.update', $target), [
            ...$this->updatePayload($target),
            'role' => 'Finance',
        ])->assertRedirect()
            ->assertSessionHas('success');

        $target->refresh();
        $this->assertTrue($target->hasRole('Finance'));
        $this->assertFalse($target->hasRole('Manager'));
        $this->assertNotSame('role-change-remember-token', $target->remember_token);
        $this->assertSame(9, (int) $setting->refresh()->version);
        $this->assertDatabaseMissing('sessions', ['id' => 'role-change-session']);
    }

    public function test_password_change_revokes_target_credentials_without_canonicalizing_the_password(): void
    {
        $this->administrator();
        $target = $this->staff('Manager');
        $target->forceFill(['remember_token' => 'password-change-remember-token'])->save();
        $setting = $this->targetMfa($target, 11);
        $this->persistTargetSession($target, 'password-change-session');
        $this->persistPasswordResetToken($target->email);
        $this->stepUp('manage_staff_accounts');
        $newPassword = '  Strong password with intentional spaces!  ';

        $this->put(route('admin.settings.users.update', $target), [
            ...$this->updatePayload($target),
            'password' => $newPassword,
        ])->assertRedirect()
            ->assertSessionHas('success');

        $target->refresh();
        $this->assertTrue(Hash::check($newPassword, $target->password));
        $this->assertFalse(Hash::check(trim($newPassword), $target->password));
        $this->assertNotSame('password-change-remember-token', $target->remember_token);
        $this->assertSame(12, (int) $setting->refresh()->version);
        $this->assertDatabaseMissing('sessions', ['id' => 'password-change-session']);
        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => $target->email,
        ]);
    }

    public function test_name_only_change_preserves_target_credentials_and_sessions(): void
    {
        $this->administrator();
        $target = $this->staff('Manager');
        $target->forceFill(['remember_token' => 'metadata-only-remember-token'])->save();
        $setting = $this->targetMfa($target, 6);
        $this->persistTargetSession($target, 'metadata-only-session');
        $this->stepUp('manage_staff_accounts');

        $this->put(route('admin.settings.users.update', $target), [
            ...$this->updatePayload($target),
            'name' => 'Updated Display Name',
        ])->assertRedirect()
            ->assertSessionHas('success');

        $target->refresh();
        $this->assertSame('Updated Display Name', $target->name);
        $this->assertSame('metadata-only-remember-token', $target->remember_token);
        $this->assertSame(6, (int) $setting->refresh()->version);
        $this->assertDatabaseHas('sessions', ['id' => 'metadata-only-session']);
    }

    public function test_deletion_requires_and_consumes_fresh_mfa_then_removes_target_and_session(): void
    {
        $this->administrator();
        $target = $this->staff('Staff Front Office');
        $this->targetMfa($target, 3);
        $this->persistTargetSession($target, 'deleted-staff-session');
        $this->persistPasswordResetToken($target->email);
        $targetEmail = $target->email;
        $this->stepUp('manage_staff_accounts');

        $this->delete(route('admin.settings.users.destroy', $target))
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseMissing('users', ['id' => $target->getKey()]);
        $this->assertDatabaseMissing('sessions', ['id' => 'deleted-staff-session']);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $targetEmail]);

        $nextTarget = $this->staff('Manager');
        $this->deleteJson(route('admin.settings.users.destroy', $nextTarget))
            ->assertStatus(428)
            ->assertJsonPath('code', 'mfa_step_up_required');
        $this->assertDatabaseHas('users', ['id' => $nextTarget->getKey()]);
    }

    private function administrator(): User
    {
        $admin = $this->staff('Administrator');
        $this->actingAs($admin);
        $admin->adminMfaSetting()->firstOrFail()->forceFill([
            'totp_secret' => self::SECRET,
            'totp_confirmed_at' => now(),
            'totp_last_used_step' => null,
            'recovery_codes' => [hash('sha256', 'admin-recovery-code')],
            'recovery_codes_acknowledged_at' => now(),
            'enabled_at' => now(),
        ])->save();

        return $admin;
    }

    private function staff(string $role): User
    {
        Role::findOrCreate($role, 'web');
        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
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

    private function targetMfa(User $target, int $version): AdminMfaSetting
    {
        return $target->adminMfaSetting()->create([
            'totp_secret' => 'TARGETMFASECRET',
            'totp_confirmed_at' => now(),
            'recovery_codes' => [hash('sha256', 'target-recovery-code')],
            'recovery_codes_acknowledged_at' => now(),
            'enabled_at' => now(),
            'version' => $version,
        ]);
    }

    private function persistTargetSession(User $target, string $id): void
    {
        DB::table((string) config('session.table', 'sessions'))->insert([
            'id' => $id,
            'user_id' => $target->getKey(),
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Target staff browser',
            'payload' => base64_encode('target-session'),
            'last_activity' => now()->timestamp,
        ]);
    }

    private function persistPasswordResetToken(string $email): void
    {
        DB::table('password_reset_tokens')->insert([
            'email' => strtolower($email),
            'token' => Hash::make('stale-reset-token'),
            'created_at' => now(),
        ]);
    }

    /** @return array{name:string,email:string,password:string,role:string} */
    private function createPayload(): array
    {
        return [
            'name' => 'New Staff',
            'email' => 'New.Staff@Example.Test',
            'password' => 'Strong-password-2026!',
            'role' => 'Staff Central',
        ];
    }

    /** @return array{name:string,email:string,role:string} */
    private function updatePayload(User $target): array
    {
        return [
            'name' => $target->name,
            'email' => $target->email,
            'role' => $target->getRoleNames()->firstOrFail(),
        ];
    }
}
