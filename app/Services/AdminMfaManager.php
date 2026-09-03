<?php

namespace App\Services;

use App\Models\AdminMfaSetting;
use App\Models\User;
use BaconQrCode\Renderer\GDLibRenderer;
use BaconQrCode\Writer;
use Illuminate\Support\Facades\DB;
use OTPHP\TOTP;
use Symfony\Component\Clock\NativeClock;

class AdminMfaManager
{
    public function setting(User $user): AdminMfaSetting
    {
        return $user->adminMfaSetting()->firstOrCreate([], [
            'version' => 1,
        ]);
    }

    public function isConfigured(User $user): bool
    {
        $setting = $user->adminMfaSetting()->first();

        if ($setting?->enabled_at === null) {
            return false;
        }

        return $user->hasPasskeysEnabled()
            || $setting->totp_confirmed_at !== null;
    }

    /** @return array{secret:string, provisioning_uri:string, qr_code:string}|null */
    public function beginTotpEnrollment(User $user): ?array
    {
        return DB::transaction(function () use ($user): ?array {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($this->isConfigured($lockedUser)) {
                return null;
            }

            AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first() ?? $this->setting($lockedUser);

            $secret = TOTP::generate(new NativeClock, 20)->getSecret();

            return $this->totpEnrollmentPayload($lockedUser, $secret);
        }, 3);
    }

    /** @return array{codes:array<int, string>, version:int}|null */
    public function confirmTotpEnrollment(
        User $user,
        #[\SensitiveParameter] string $secret,
        string $code,
    ): ?array {
        return DB::transaction(function () use ($user, $secret, $code): ?array {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($this->isConfigured($lockedUser)) {
                return null;
            }

            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();

            if (! $setting || $setting->totp_confirmed_at !== null) {
                return null;
            }

            $step = $this->matchingTotpStep($secret, $code);

            if ($step === null) {
                return null;
            }

            $setting->forceFill([
                'totp_secret' => $secret,
                'totp_confirmed_at' => now(),
                'totp_last_used_step' => $step,
                'enabled_at' => $setting->enabled_at ?? now(),
            ]);

            $bundle = $this->replaceRecoveryCodes($setting);
            $setting->save();

            return $bundle;
        }, 3);
    }

    /** @return array{secret:string, provisioning_uri:string, qr_code:string}|null */
    public function beginSecondaryTotpEnrollment(User $user): ?array
    {
        return DB::transaction(function () use ($user): ?array {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();

            if (! $setting
                || $setting->enabled_at === null
                || $setting->recovery_codes_acknowledged_at !== null
                || $setting->totp_confirmed_at !== null
                || ! $lockedUser->hasPasskeysEnabled()) {
                return null;
            }

            $secret = TOTP::generate(new NativeClock, 20)->getSecret();

            return $this->totpEnrollmentPayload($lockedUser, $secret);
        }, 3);
    }

    public function confirmSecondaryTotpEnrollment(
        User $user,
        #[\SensitiveParameter] string $secret,
        string $code,
    ): bool {
        return DB::transaction(function () use ($user, $secret, $code): bool {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();

            if (! $setting
                || $setting->enabled_at === null
                || $setting->recovery_codes_acknowledged_at !== null
                || $setting->totp_confirmed_at !== null
                || ! $lockedUser->hasPasskeysEnabled()) {
                return false;
            }

            $step = $this->matchingTotpStep($secret, $code);

            if ($step === null) {
                return false;
            }

            $setting->forceFill([
                'totp_secret' => $secret,
                'totp_confirmed_at' => now(),
                'totp_last_used_step' => $step,
            ])->save();

            return true;
        }, 3);
    }

    public function verifyTotp(User $user, string $code): bool
    {
        return DB::transaction(function () use ($user, $code): bool {
            $setting = AdminMfaSetting::query()
                ->where('user_id', $user->getKey())
                ->whereNotNull('totp_confirmed_at')
                ->lockForUpdate()
                ->first();

            if (! $setting || ! is_string($setting->totp_secret)) {
                return false;
            }

            $step = $this->matchingTotpStep($setting->totp_secret, $code);

            if ($step === null || $step <= (int) ($setting->totp_last_used_step ?? -1)) {
                return false;
            }

            $setting->forceFill(['totp_last_used_step' => $step])->save();

            return true;
        }, 3);
    }

    /** @return array{secret:string, provisioning_uri:string, qr_code:string}|null */
    public function beginManagedTotpEnrollment(
        User $user,
        int $expectedMfaVersion,
    ): ?array {
        return DB::transaction(function () use ($expectedMfaVersion, $user): ?array {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();
            $lockedUser->passkeys()->lockForUpdate()->get(['id']);

            if (! $this->hasCompleteConfiguration($lockedUser, $setting)
                || (int) $setting->version !== $expectedMfaVersion) {
                return null;
            }

            $secret = TOTP::generate(new NativeClock, 20)->getSecret();

            return $this->totpEnrollmentPayload($lockedUser, $secret);
        }, 3);
    }

    public function confirmManagedTotpEnrollment(
        User $user,
        #[\SensitiveParameter] string $secret,
        string $code,
        int $expectedMfaVersion,
    ): ?int {
        return DB::transaction(function () use (
            $code,
            $expectedMfaVersion,
            $secret,
            $user,
        ): ?int {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();
            $lockedUser->passkeys()->lockForUpdate()->get(['id']);

            if (! $this->hasCompleteConfiguration($lockedUser, $setting)
                || (int) $setting->version !== $expectedMfaVersion) {
                return null;
            }

            $step = $this->matchingTotpStep($secret, $code);

            if ($step === null) {
                return null;
            }

            $version = max(1, (int) $setting->version) + 1;
            $setting->forceFill([
                'totp_secret' => $secret,
                'totp_confirmed_at' => now(),
                'totp_last_used_step' => $step,
                'version' => $version,
            ])->save();

            return $version;
        }, 3);
    }

    public function removeManagedTotp(User $user, int $expectedMfaVersion): ?int
    {
        return DB::transaction(function () use ($expectedMfaVersion, $user): ?int {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();
            $passkeys = $lockedUser->passkeys()->lockForUpdate()->get(['id']);

            if (! $this->hasCompleteConfiguration($lockedUser, $setting)
                || (int) $setting->version !== $expectedMfaVersion
                || $setting->totp_confirmed_at === null
                || $passkeys->isEmpty()) {
                return null;
            }

            $version = max(1, (int) $setting->version) + 1;
            $setting->forceFill([
                'totp_secret' => null,
                'totp_confirmed_at' => null,
                'totp_last_used_step' => null,
                'version' => $version,
            ])->save();

            return $version;
        }, 3);
    }

    public function removeManagedPasskey(
        User $user,
        int $passkeyId,
        int $expectedMfaVersion,
    ): ?int {
        return DB::transaction(function () use (
            $expectedMfaVersion,
            $passkeyId,
            $user,
        ): ?int {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();
            $passkeys = $lockedUser->passkeys()->lockForUpdate()->get();
            $passkey = $passkeys->firstWhere('id', $passkeyId);

            if (! $passkey
                || ! $this->hasCompleteConfiguration($lockedUser, $setting)
                || (int) $setting->version !== $expectedMfaVersion
                || ($passkeys->count() === 1 && $setting->totp_confirmed_at === null)) {
                return null;
            }

            $passkey->delete();
            $version = max(1, (int) $setting->version) + 1;
            $setting->forceFill(['version' => $version])->save();

            return $version;
        }, 3);
    }

    /** @return array{codes:array<int, string>, recovery_codes_version:int, mfa_version:int}|null */
    public function beginManagedRecoveryCodeRotation(
        User $user,
        int $expectedMfaVersion,
    ): ?array {
        return DB::transaction(function () use ($expectedMfaVersion, $user): ?array {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();
            $lockedUser->passkeys()->lockForUpdate()->get(['id']);

            if (! $this->hasCompleteConfiguration($lockedUser, $setting)
                || (int) $setting->version !== $expectedMfaVersion) {
                return null;
            }

            return [
                'codes' => $this->generateRecoveryCodes(),
                'recovery_codes_version' => max(0, (int) $setting->recovery_codes_version) + 1,
                'mfa_version' => (int) $setting->version,
            ];
        }, 3);
    }

    /** @param array<int, string> $codes */
    public function confirmManagedRecoveryCodeRotation(
        User $user,
        #[\SensitiveParameter] array $codes,
        int $recoveryCodesVersion,
        int $expectedMfaVersion,
    ): ?int {
        return DB::transaction(function () use (
            $codes,
            $expectedMfaVersion,
            $recoveryCodesVersion,
            $user,
        ): ?int {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();
            $lockedUser->passkeys()->lockForUpdate()->get(['id']);

            if (! $this->hasCompleteConfiguration($lockedUser, $setting)
                || (int) $setting->version !== $expectedMfaVersion
                || $recoveryCodesVersion !== (int) $setting->recovery_codes_version + 1
                || count($codes) < 6
                || collect($codes)->contains(fn (mixed $code): bool => ! is_string($code))) {
                return null;
            }

            $version = max(1, (int) $setting->version) + 1;
            $setting->forceFill([
                'recovery_codes' => array_map(
                    fn (string $code): string => $this->hashRecoveryCode($code),
                    $codes,
                ),
                'recovery_codes_generated_at' => now(),
                'recovery_codes_acknowledged_at' => now(),
                'recovery_codes_version' => $recoveryCodesVersion,
                'version' => $version,
            ])->save();

            return $version;
        }, 3);
    }

    /** @return array{codes:array<int, string>, version:int} */
    public function enableAfterPasskeyEnrollment(User $user): array
    {
        return DB::transaction(function () use ($user): array {
            $setting = AdminMfaSetting::query()
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first() ?? $this->setting($user);

            $setting->forceFill([
                'enabled_at' => $setting->enabled_at ?? now(),
            ]);

            // Never promote an unconfirmed secret from an earlier password
            // ceremony into a passkey-backed account. A fallback TOTP secret
            // is generated afresh and held only in the current encrypted
            // pre-authentication session until its first code is verified.
            if ($setting->totp_confirmed_at === null) {
                $setting->forceFill([
                    'totp_secret' => null,
                    'totp_last_used_step' => null,
                ]);
            }
            $bundle = $this->replaceRecoveryCodes($setting);
            $setting->save();

            return $bundle;
        }, 3);
    }

    public function consumeRecoveryCode(User $user, string $code): bool
    {
        $normalized = $this->normalizeRecoveryCode($code);

        if ($normalized === '') {
            return false;
        }

        return DB::transaction(function () use ($user, $normalized): bool {
            $setting = AdminMfaSetting::query()
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first();

            if (! $setting || ! is_array($setting->recovery_codes)) {
                return false;
            }

            $candidate = $this->hashRecoveryCode($normalized);
            $remaining = [];
            $matched = false;

            foreach ($setting->recovery_codes as $hash) {
                if (! $matched && is_string($hash) && hash_equals($hash, $candidate)) {
                    $matched = true;

                    continue;
                }

                if (is_string($hash)) {
                    $remaining[] = $hash;
                }
            }

            if (! $matched) {
                return false;
            }

            $setting->forceFill(['recovery_codes' => $remaining])->save();

            return true;
        }, 3);
    }

    /**
     * Reissue codes only after a primary factor has already been verified.
     * This repairs an interrupted first-time enrollment without ever storing
     * plaintext recovery codes durably.
     *
     * @return array{codes:array<int, string>, version:int}|null Null means acknowledgement is no longer required.
     */
    public function reissueUnacknowledgedRecoveryCodes(User $user): ?array
    {
        return DB::transaction(function () use ($user): ?array {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();

            if (! $setting
                || $setting->enabled_at === null
                || ($setting->totp_confirmed_at === null
                    && ! $lockedUser->hasPasskeysEnabled())
                || $setting->recovery_codes_acknowledged_at !== null) {
                return null;
            }

            $bundle = $this->replaceRecoveryCodes($setting);
            $setting->save();

            return $bundle;
        }, 3);
    }

    public function acknowledgeRecoveryCodes(User $user, int $version): bool
    {
        return DB::transaction(function () use ($user, $version): bool {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $setting = AdminMfaSetting::query()
                ->where('user_id', $lockedUser->getKey())
                ->lockForUpdate()
                ->first();

            if (! $setting
                || $setting->enabled_at === null
                || ($setting->totp_confirmed_at === null
                    && ! $lockedUser->hasPasskeysEnabled())
                || ! is_array($setting->recovery_codes)
                || $setting->recovery_codes === []
                || $version < 1
                || $version !== (int) $setting->recovery_codes_version) {
                return false;
            }

            $setting->forceFill([
                'recovery_codes_acknowledged_at' => now(),
            ])->save();

            return true;
        }, 3);
    }

    /** @return array{codes:array<int, string>, version:int} */
    private function replaceRecoveryCodes(AdminMfaSetting $setting): array
    {
        $plain = $this->generateRecoveryCodes();

        $version = max(0, (int) $setting->recovery_codes_version) + 1;
        $setting->forceFill([
            'recovery_codes' => array_map(
                fn (string $code): string => $this->hashRecoveryCode($code),
                $plain,
            ),
            'recovery_codes_generated_at' => now(),
            'recovery_codes_acknowledged_at' => null,
            'recovery_codes_version' => $version,
        ]);

        return [
            'codes' => $plain,
            'version' => $version,
        ];
    }

    /** @return array<int, string> */
    private function generateRecoveryCodes(): array
    {
        $count = max(6, min(20, (int) config('security.admin_mfa.recovery_code_count', 10)));
        $bytes = max(10, min(32, (int) config('security.admin_mfa.recovery_code_bytes', 16)));
        $plain = [];

        for ($index = 0; $index < $count; $index++) {
            $raw = strtoupper(bin2hex(random_bytes($bytes)));
            $plain[] = implode('-', str_split($raw, 4));
        }

        return $plain;
    }

    private function hasCompleteConfiguration(
        User $user,
        ?AdminMfaSetting $setting,
    ): bool {
        return $setting !== null
            && $setting->enabled_at !== null
            && $setting->recovery_codes_acknowledged_at !== null
            && ($setting->totp_confirmed_at !== null || $user->hasPasskeysEnabled());
    }

    private function matchingTotpStep(string $secret, string $code): ?int
    {
        $normalized = preg_replace('/\D+/', '', $code) ?? '';

        if (strlen($normalized) !== 6) {
            return null;
        }

        $totp = TOTP::createFromSecret($secret, new NativeClock);
        $period = $totp->getPeriod();
        $currentStep = intdiv(now()->getTimestamp(), $period);

        foreach ([-1, 0, 1] as $offset) {
            $step = $currentStep + $offset;

            if ($step >= 0 && hash_equals($totp->at($step * $period), $normalized)) {
                return $step;
            }
        }

        return null;
    }

    /** @return array{secret:string, provisioning_uri:string, qr_code:string} */
    private function totpEnrollmentPayload(User $user, string $secret): array
    {
        $totp = TOTP::createFromSecret($secret, new NativeClock);
        $totp->setIssuer((string) config('security.admin_mfa.totp_issuer', 'UB Sport Center'));
        $totp->setLabel($user->email);
        $uri = $totp->getProvisioningUri();
        $png = (new Writer(new GDLibRenderer(280, 2, 'png', 9)))
            ->writeString($uri);

        return [
            'secret' => $secret,
            'provisioning_uri' => $uri,
            'qr_code' => 'data:image/png;base64,'.base64_encode($png),
        ];
    }

    private function hashRecoveryCode(string $code): string
    {
        return hash_hmac(
            'sha256',
            $this->normalizeRecoveryCode($code),
            (string) config('security.admin_mfa.recovery_pepper'),
        );
    }

    private function normalizeRecoveryCode(string $code): string
    {
        return strtoupper(preg_replace('/[^A-Z0-9]+/i', '', trim($code)) ?? '');
    }
}
