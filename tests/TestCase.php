<?php

namespace Tests;

use App\Models\User;
use App\Services\AdminSessionSecurity;
use App\Support\AdminAccess;
use Illuminate\Contracts\Auth\Authenticatable as UserContract;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\Request;
use Tests\Support\TestingDatabaseGuard;

abstract class TestCase extends BaseTestCase
{
    /**
     * Boot the application, then fail closed before any database-reset trait
     * can run when the resolved connection is not an isolated test database.
     */
    public function createApplication()
    {
        $app = parent::createApplication();
        $connectionName = (string) $app['config']->get('database.default');
        $connection = $app['db']->connection($connectionName);

        TestingDatabaseGuard::assertSafe(
            (string) $app->environment(),
            (string) $connection->getDriverName(),
            (string) $connection->getDatabaseName(),
        );

        return $app;
    }

    /**
     * Feature tests that directly impersonate staff are explicitly simulating
     * a session that has already completed MFA. Production code never receives
     * this shortcut; browser login tests exercise the real pre-auth ceremony.
     */
    public function actingAs(UserContract $user, $guard = null)
    {
        parent::actingAs($user, $guard);

        if ($user instanceof User && AdminAccess::allows($user)) {
            $setting = $user->adminMfaSetting()->firstOrCreate([], [
                'totp_secret' => 'TESTMFASECRET',
                'totp_confirmed_at' => now(),
                'recovery_codes' => [hash('sha256', 'test-recovery-code')],
                'recovery_codes_acknowledged_at' => now(),
                'enabled_at' => now(),
                'version' => 1,
            ]);

            if ($setting->enabled_at === null
                || $setting->totp_confirmed_at === null
                || $setting->recovery_codes_acknowledged_at === null) {
                $setting->forceFill([
                    'totp_secret' => $setting->totp_secret ?: 'TESTMFASECRET',
                    'totp_confirmed_at' => $setting->totp_confirmed_at ?? now(),
                    'recovery_codes' => $setting->recovery_codes ?: [hash('sha256', 'test-recovery-code')],
                    'recovery_codes_acknowledged_at' => $setting->recovery_codes_acknowledged_at ?? now(),
                    'enabled_at' => $setting->enabled_at ?? now(),
                ])->save();
            }

            $agent = 'UBSC-Test-Client/1.0';
            $request = Request::create('/', 'GET', server: [
                'HTTP_USER_AGENT' => $agent,
            ]);
            $now = now()->getTimestamp();

            $this->withHeader('User-Agent', $agent)->withSession([
                AdminSessionSecurity::ISSUED_AT => $now,
                AdminSessionSecurity::LAST_ACTIVITY_AT => $now,
                AdminSessionSecurity::ROTATED_AT => $now,
                AdminSessionSecurity::USER_AGENT_FINGERPRINT => app(AdminSessionSecurity::class)
                    ->fingerprint($request),
                AdminSessionSecurity::MFA_VERIFIED_AT => $now,
                AdminSessionSecurity::MFA_METHOD => 'passkey',
                AdminSessionSecurity::MFA_VERSION => (int) $setting->version,
            ]);
        }

        return $this;
    }
}
