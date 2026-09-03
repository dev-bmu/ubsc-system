<?php

namespace App\Console\Commands;

use App\Models\AdminMfaSetting;
use App\Models\User;
use App\Services\CredentialSecurity;
use App\Support\AdminAccess;
use App\Support\AuthenticationIdentity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ResetAdminMfa extends Command
{
    protected $signature = 'admin:mfa-reset
        {email : Email akun staf}
        {--force : Lewati konfirmasi interaktif}';

    protected $description = 'Reset faktor MFA admin dan cabut seluruh sesi aktifnya';

    public function handle(CredentialSecurity $credentials): int
    {
        $email = AuthenticationIdentity::normalizeEmail($this->argument('email'));
        $user = User::query()->where('email', $email)->first();

        if (! AdminAccess::allows($user)) {
            $this->error('Akun staf tidak ditemukan.');

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm(
            'Reset semua passkey, TOTP, recovery code, dan sesi aktif akun ini?',
        )) {
            $this->warn('Tidak ada perubahan.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($user): void {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $lockedUser->passkeys()->delete();

            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first() ?? $lockedUser->adminMfaSetting()->create(['version' => 1]);

            $setting->forceFill([
                'totp_secret' => null,
                'totp_confirmed_at' => null,
                'totp_last_used_step' => null,
                'recovery_codes' => null,
                'recovery_codes_generated_at' => null,
                'recovery_codes_acknowledged_at' => null,
                'recovery_codes_version' => 0,
                'enabled_at' => null,
                'last_verified_at' => null,
                'last_verified_method' => null,
                'version' => max(1, (int) $setting->version + 1),
            ])->save();

        }, 3);

        // The MFA version above is the backend-independent revocation signal.
        // Remove active database-backed sessions eagerly when that driver is
        // configured; Redis sessions fail closed on their next request.
        $credentials->purgePersistedSessions($user->getAuthIdentifier(), null);

        Log::warning('Admin MFA was reset using the server-side recovery command.', [
            'user_id' => $user->getKey(),
        ]);

        $this->info('MFA direset dan seluruh sesi akun telah dicabut. Login berikutnya wajib enrollment ulang.');

        return self::SUCCESS;
    }
}
