<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AdminProfileSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_cannot_change_their_login_email_through_the_profile_endpoint(): void
    {
        $staff = $this->staff();
        $verifiedAt = $staff->email_verified_at;

        $this->from('/ubsc-staff/dashboard')
            ->patch('/ubsc-staff/account/profile', [
                'name' => 'Nama yang tidak ikut tersimpan',
                'email' => 'attacker-controlled@example.test',
            ])
            ->assertRedirect('/ubsc-staff/dashboard')
            ->assertSessionHasErrors('email');

        $staff->refresh();

        $this->assertSame('staff@example.test', $staff->email);
        $this->assertSame('Staff Aman', $staff->name);
        $this->assertTrue($verifiedAt?->equalTo($staff->email_verified_at) ?? false);
        $this->assertAuthenticatedAs($staff);
    }

    public function test_staff_can_update_non_identity_profile_fields_without_submitting_email(): void
    {
        $staff = $this->staff();

        $this->patch('/ubsc-staff/account/profile', [
            'name' => 'Staff Profil Baru',
        ])->assertRedirect();

        $staff->refresh();

        $this->assertSame('Staff Profil Baru', $staff->name);
        $this->assertSame('staff@example.test', $staff->email);
        $this->assertNotNull($staff->email_verified_at);
        $this->assertAuthenticatedAs($staff);
    }

    private function staff(): User
    {
        Role::findOrCreate('Administrator', 'web');

        $staff = User::factory()->create([
            'name' => 'Staff Aman',
            'email' => 'staff@example.test',
            'email_verified_at' => now(),
        ]);
        $staff->assignRole('Administrator');

        $this->actingAs($staff);

        return $staff;
    }
}
