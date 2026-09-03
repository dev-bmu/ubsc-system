<?php

namespace App\Services;

use App\Models\AdminMfaSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

final class AdminStaffAccountManager
{
    public function __construct(
        private readonly CredentialSecurity $credentials,
    ) {}

    /** @param array{name:string,email:string,password:string,role:string} $data */
    public function create(
        User $actor,
        #[\SensitiveParameter] array $data,
    ): User {
        // Password hashing is deliberately outside the transaction so its
        // adaptive work factor never holds identity or role locks.
        $passwordHash = Hash::make($data['password']);

        $user = DB::transaction(function () use ($data, $passwordHash): User {
            // A previously deleted account may have left an unexpired reset
            // token for the same address. It must never become valid for the
            // newly provisioned identity.
            $this->forgetPasswordResetTokens([$data['email']]);

            $user = new User;
            $user->forceFill([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $passwordHash,
                // Accounts provisioned by an authenticated Administrator are
                // trusted at creation. A later email change resets this proof.
                'email_verified_at' => now(),
                'remember_token' => Str::random(60),
            ])->save();
            $user->assignRole($data['role']);

            return $user;
        }, 3);

        $this->audit('Internal staff account created.', [
            'actor_user_id' => $actor->getKey(),
            'target_user_id' => $user->getKey(),
            'event' => 'staff_account_created',
        ]);

        return $user;
    }

    /**
     * @param  array{name:string,email:string,password?:string|null,role:string}  $data
     * @return array{user:User,email_changed:bool,role_changed:bool,password_changed:bool,sessions_revoked:bool}
     */
    public function update(
        User $actor,
        User $target,
        #[\SensitiveParameter] array $data,
    ): array {
        // Passwords are opaque credentials. Never trim or otherwise
        // canonicalize them: leading/trailing spaces may be intentional.
        $password = is_string($data['password'] ?? null)
            ? (string) $data['password']
            : '';
        $passwordHash = $password !== '' ? Hash::make($password) : null;

        $result = DB::transaction(function () use (
            $data,
            $passwordHash,
            $target,
        ): array {
            $lockedUser = User::query()
                ->whereKey($target->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $currentRole = $lockedUser->getRoleNames()->first() ?? '';
            $previousEmail = (string) $lockedUser->email;

            if ($currentRole === 'Administrator') {
                throw ValidationException::withMessages([
                    'user' => 'Akun Administrator tidak dapat diubah dari halaman staff.',
                ]);
            }

            $emailChanged = ! hash_equals(
                strtolower((string) $lockedUser->email),
                strtolower($data['email']),
            );
            $roleChanged = $currentRole !== $data['role'];
            $passwordChanged = $passwordHash !== null;
            $revokeSessions = $emailChanged || $roleChanged || $passwordChanged;
            $attributes = [
                'name' => $data['name'],
                'email' => $data['email'],
            ];

            if ($emailChanged) {
                $attributes['email_verified_at'] = null;
                // A Google subject is bound to the old login identity. It must
                // never silently survive an Administrator email replacement.
                $attributes['google_id'] = null;
            }

            if ($passwordHash !== null) {
                $attributes['password'] = $passwordHash;
            }

            if ($revokeSessions) {
                $attributes['remember_token'] = Str::random(60);
            }

            $lockedUser->forceFill($attributes)->save();
            $lockedUser->syncRoles([$data['role']]);

            if ($emailChanged || $passwordChanged) {
                $this->forgetPasswordResetTokens([
                    $previousEmail,
                    (string) $lockedUser->email,
                ]);
            }

            if ($revokeSessions) {
                $setting = AdminMfaSetting::query()
                    ->where('user_id', $lockedUser->getKey())
                    ->lockForUpdate()
                    ->first();

                if ($setting !== null) {
                    $setting->forceFill([
                        'version' => max(1, (int) $setting->version) + 1,
                    ])->save();
                }
            }

            return [
                'user' => $lockedUser,
                'email_changed' => $emailChanged,
                'role_changed' => $roleChanged,
                'password_changed' => $passwordChanged,
                'sessions_revoked' => $revokeSessions,
            ];
        }, 3);

        /** @var User $updatedUser */
        $updatedUser = $result['user'];
        $updatedUser->refresh();

        if ($result['sessions_revoked']) {
            $this->credentials->purgePersistedSessions($updatedUser->getKey());
        }

        $this->audit('Internal staff account updated.', [
            'actor_user_id' => $actor->getKey(),
            'target_user_id' => $updatedUser->getKey(),
            'event' => 'staff_account_updated',
            'email_changed' => (int) $result['email_changed'],
            'role_changed' => (int) $result['role_changed'],
            'password_changed' => (int) $result['password_changed'],
            'sessions_revoked' => (int) $result['sessions_revoked'],
        ]);

        return [
            ...$result,
            'user' => $updatedUser,
        ];
    }

    public function delete(User $actor, User $target): string
    {
        $deleted = DB::transaction(function () use ($actor, $target): array {
            $lockedUser = User::query()
                ->whereKey($target->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $currentRole = $lockedUser->getRoleNames()->first() ?? '';

            if ((string) $lockedUser->getKey() === (string) $actor->getKey()) {
                throw ValidationException::withMessages([
                    'user' => 'Tidak dapat menghapus akun sendiri.',
                ]);
            }

            if ($currentRole === 'Administrator') {
                throw ValidationException::withMessages([
                    'user' => 'Akun Administrator tidak dapat dihapus dari halaman staff.',
                ]);
            }

            $result = [
                'id' => $lockedUser->getKey(),
                'name' => $lockedUser->name,
            ];
            $this->forgetPasswordResetTokens([(string) $lockedUser->email]);
            $lockedUser->delete();

            return $result;
        }, 3);

        $this->credentials->purgePersistedSessions($deleted['id']);
        $this->audit('Internal staff account deleted.', [
            'actor_user_id' => $actor->getKey(),
            'target_user_id' => $deleted['id'],
            'event' => 'staff_account_deleted',
        ]);

        return (string) $deleted['name'];
    }

    /** @param array<string, int|string> $context */
    private function audit(string $message, array $context): void
    {
        try {
            Log::notice($message, $context);
        } catch (Throwable) {
            // An observability outage must not turn a committed credential
            // boundary into a misleading failed response.
        }
    }

    /** @param list<string> $emails */
    private function forgetPasswordResetTokens(array $emails): void
    {
        $canonicalEmails = array_values(array_unique(array_filter(
            array_map(
                static fn (string $email): string => strtolower(trim($email)),
                $emails,
            ),
            static fn (string $email): bool => $email !== '',
        )));

        if ($canonicalEmails === []) {
            return;
        }

        DB::table((string) config('auth.passwords.users.table', 'password_reset_tokens'))
            ->whereIn('email', $canonicalEmails)
            ->delete();
    }
}
