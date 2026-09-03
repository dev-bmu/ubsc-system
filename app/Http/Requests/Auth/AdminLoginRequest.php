<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use App\Services\AuthenticationRateLimiter;
use App\Support\AdminAccess;
use App\Support\AuthenticationIdentity;
use App\Support\VerifiedAdminCredential;
use Illuminate\Auth\Events\Failed;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Timebox;
use Illuminate\Validation\ValidationException;

class AdminLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:4096'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => AuthenticationIdentity::normalizeEmail($this->input('email')),
        ]);
    }

    /**
     * Verify password and staff entitlement without creating an authenticated
     * session. Unknown users, wrong passwords, and non-staff accounts all take
     * the same timed path and produce the same public response.
     */
    public function verifyStaffCredentials(
        AuthenticationRateLimiter $limiter,
    ): VerifiedAdminCredential {
        $email = AuthenticationIdentity::normalizeEmail($this->input('email'));
        $credentials = [
            'email' => $email,
            'password' => (string) $this->input('password'),
        ];

        $limiter->beginLogin($this, $email, 'admin');

        $guard = Auth::guard('web');
        /** @var UserProvider $provider */
        $provider = $guard->getProvider();
        $verifiedCredential = (new Timebox)->call(function () use (
            $credentials,
            $provider,
        ): ?VerifiedAdminCredential {
            $retrieved = $provider->retrieveByCredentials($credentials);
            $candidate = $retrieved instanceof User ? $retrieved : null;

            if ($candidate === null) {
                return null;
            }

            return DB::transaction(function () use (
                $candidate,
                $credentials,
                $provider,
            ): ?VerifiedAdminCredential {
                $lockedUser = User::query()
                    ->whereKey($candidate->getKey())
                    ->lockForUpdate()
                    ->first();
                $passwordIsValid = $lockedUser !== null
                    && $provider->validateCredentials($lockedUser, $credentials);

                if (! $passwordIsValid || ! AdminAccess::allows($lockedUser)) {
                    return null;
                }

                if (method_exists($provider, 'rehashPasswordIfRequired')) {
                    $provider->rehashPasswordIfRequired($lockedUser, $credentials);
                    $lockedUser->refresh();
                }

                return new VerifiedAdminCredential(
                    userId: (int) $lockedUser->getKey(),
                    fingerprint: AuthenticationIdentity::credentialFingerprint(
                        $lockedUser->getKey(),
                        $lockedUser->getAuthPassword(),
                    ),
                );
            }, 3);
        }, $this->loginTimeboxMicroseconds());

        if (! $verifiedCredential instanceof VerifiedAdminCredential) {
            $limiter->loginFailed($this, $email, 'admin');
            // Do not propagate the submitted password to event listeners or
            // third-party observability integrations.
            event(new Failed('web', null, [
                'identity' => AuthenticationIdentity::opaque($email, 'failed-admin-login'),
            ]));

            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        $limiter->loginSucceeded($this, $email, 'admin');

        return $verifiedCredential;
    }

    private function loginTimeboxMicroseconds(): int
    {
        return max(
            300,
            min(3000, (int) config('security.admin_mfa.login.timebox_ms', 1000)),
        ) * 1000;
    }
}
