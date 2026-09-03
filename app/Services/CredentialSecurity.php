<?php

namespace App\Services;

use App\Models\AdminMfaSetting;
use App\Models\User;
use App\Support\AdminAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class CredentialSecurity
{
    /**
     * Replace a password and revoke every other credential-bound session.
     *
     * The password hash and MFA version are the authoritative revocation
     * signals across every supported session backend. When database sessions
     * are active, their rows are also removed eagerly rather than waiting for
     * the next request to reject them.
     */
    public function replacePassword(
        User $user,
        #[\SensitiveParameter] string $password,
        ?string $preserveSessionId = null,
    ): bool {
        // Password hashing is deliberately outside the transaction: bcrypt or
        // Argon work must not hold the user row lock and delay other security
        // operations for the same account.
        $passwordHash = Hash::make($password);

        $isStaff = DB::transaction(function () use ($user, $passwordHash): bool {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $isStaff = AdminAccess::allows($lockedUser);

            $lockedUser->forceFill([
                'password' => $passwordHash,
                'remember_token' => Str::random(60),
            ])->save();

            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();

            // Also revoke an existing MFA state after a role was removed;
            // otherwise a concurrently running former-staff session could
            // retain proof issued before its credential changed.
            if ($isStaff || $setting !== null) {
                if ($setting === null) {
                    $setting = new AdminMfaSetting([
                        'version' => 1,
                    ]);
                    $setting->user()->associate($lockedUser);
                }

                $setting->forceFill([
                    'version' => max(1, (int) $setting->version) + 1,
                ])->save();
            }

            return $isStaff;
        }, 3);

        // Keep the in-request model synchronized so Laravel's auth.session
        // middleware records the new password fingerprint for a preserved
        // current session after the controller response is produced.
        $user->refresh();

        $this->purgePersistedSessions(
            $user->getAuthIdentifier(),
            $preserveSessionId,
        );

        return $isStaff;
    }

    public function purgePersistedSessions(
        mixed $userId,
        ?string $preserveSessionId = null,
    ): void {
        if (config('session.driver') !== 'database') {
            return;
        }

        try {
            $connection = config('session.connection');
            $table = (string) config('session.table', 'sessions');
            $query = DB::connection(is_string($connection) ? $connection : null)
                ->table($table)
                ->where('user_id', $userId);

            if (is_string($preserveSessionId) && $preserveSessionId !== '') {
                $query->where('id', '!=', $preserveSessionId);
            }

            $query->delete();
        } catch (Throwable $exception) {
            // Password hashes (and staff MFA versions) remain authoritative,
            // so a cleanup outage cannot leave an old session usable.
            try {
                Log::warning('Unable to eagerly purge credential-bound sessions.', [
                    'exception' => $exception::class,
                ]);
            } catch (Throwable) {
                // Credential replacement must not be rolled back by telemetry.
            }
        }
    }
}
