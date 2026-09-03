<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use App\Services\AuthenticationRateLimiter;
use App\Support\AuthenticationIdentity;
use Illuminate\Auth\Events\Failed;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Timebox;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:4096'],
            'return_to' => ['nullable', 'string', 'max:2048'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => AuthenticationIdentity::normalizeEmail($this->input('email')),
        ]);
    }

    /**
     * Attempt to authenticate the request's credentials.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function authenticate(
        bool $allowRemember = true,
        ?callable $authorize = null,
    ): void {
        $limiter = app(AuthenticationRateLimiter::class);
        $email = AuthenticationIdentity::normalizeEmail($this->input('email'));
        $limiter->beginLogin($this, $email);

        $credentials = [
            'email' => $email,
            'password' => (string) $this->input('password'),
        ];
        $guard = Auth::guard('web');
        /** @var UserProvider $provider */
        $provider = $guard->getProvider();
        $user = (new Timebox)->call(function () use (
            $authorize,
            $credentials,
            $provider,
        ): ?User {
            $candidate = $provider->retrieveByCredentials($credentials);
            $candidate = $candidate instanceof User ? $candidate : null;
            $valid = $candidate !== null
                && $provider->validateCredentials($candidate, $credentials)
                && ($authorize === null || (bool) $authorize($candidate));

            if (! $valid) {
                return null;
            }

            if (method_exists($provider, 'rehashPasswordIfRequired')) {
                $provider->rehashPasswordIfRequired($candidate, $credentials);
            }

            return $candidate;
        }, $this->loginTimeboxMicroseconds());

        if (! $user instanceof User) {
            $limiter->loginFailed($this, $email);
            event(new Failed('web', null, [
                'identity' => AuthenticationIdentity::opaque($email, 'failed-public-login'),
            ]));

            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        $guard->login(
            $user,
            $allowRemember && $this->boolean('remember'),
        );
        $limiter->loginSucceeded($this, $email);
    }

    /**
     * Ensure the login request is not rate limited.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function ensureIsNotRateLimited(): void
    {
        app(AuthenticationRateLimiter::class)->beginLogin(
            $this,
            AuthenticationIdentity::normalizeEmail($this->input('email')),
        );
    }

    /**
     * Get the rate limiting throttle key for the request.
     */
    public function throttleKey(): string
    {
        return app(AuthenticationRateLimiter::class)->loginKeys(
            $this,
            AuthenticationIdentity::normalizeEmail($this->input('email')),
        )['account_burst'];
    }

    private function loginTimeboxMicroseconds(): int
    {
        return max(
            300,
            min(3000, (int) config('security.admin_mfa.login.timebox_ms', 1000)),
        ) * 1000;
    }
}
