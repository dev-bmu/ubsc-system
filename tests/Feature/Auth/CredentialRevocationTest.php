<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class CredentialRevocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_mfa_recovery_command_revokes_configured_database_session_table(): void
    {
        Schema::create('security_sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
        });
        config([
            'session.driver' => 'database',
            'session.table' => 'security_sessions',
        ]);

        Role::findOrCreate('Administrator', 'web');
        $admin = User::factory()->create();
        $admin->assignRole('Administrator');
        $setting = $admin->adminMfaSetting()->create([
            'totp_secret' => 'MFASECRET',
            'totp_confirmed_at' => now(),
            'recovery_codes' => [hash('sha256', 'recovery-code')],
            'recovery_codes_acknowledged_at' => now(),
            'enabled_at' => now(),
            'version' => 4,
        ]);
        DB::table('security_sessions')->insert([
            'id' => 'admin-session',
            'user_id' => $admin->getKey(),
        ]);

        $this->artisan('admin:mfa-reset', [
            'email' => $admin->email,
            '--force' => true,
        ])->assertSuccessful();

        $this->assertDatabaseMissing('security_sessions', [
            'id' => 'admin-session',
        ]);
        $this->assertSame(5, (int) $setting->refresh()->version);
        $this->assertNull($setting->enabled_at);
    }
}
