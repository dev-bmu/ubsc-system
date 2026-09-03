<?php

namespace App\Services;

use App\Support\AuthenticationIdentity;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthenticationRateLimiter
{
    /**
     * Count every login request against IP and endpoint-wide ceilings, while
     * checking the independent account-failure buckets before password work.
     */
    public function beginLogin(
        Request $request,
        string $normalizedEmail,
        string $scope = 'public',
    ): void {
        $keys = $this->loginKeys($request, $normalizedEmail, $scope);
        $limits = $this->loginLimits();

        $this->rejectWhenLimited($request, [
            [$keys['account_burst'], $limits['account_burst_attempts']],
            [$keys['account_hour'], $limits['account_hour_attempts']],
            [$keys['ip_minute'], $limits['ip_minute_attempts']],
            [$keys['ip_hour'], $limits['ip_hour_attempts']],
            [$keys['global_minute'], $limits['global_minute_attempts']],
        ], 'email');

        RateLimiter::hit($keys['ip_minute'], 60);
        RateLimiter::hit($keys['ip_hour'], 3600);
        RateLimiter::hit($keys['global_minute'], 60);
    }

    public function loginFailed(
        Request $request,
        string $normalizedEmail,
        string $scope = 'public',
    ): void {
        $keys = $this->loginKeys($request, $normalizedEmail, $scope);
        $limits = $this->loginLimits();

        RateLimiter::hit(
            $keys['account_burst'],
            $limits['account_burst_seconds'],
        );
        RateLimiter::hit($keys['account_hour'], 3600);
    }

    public function loginSucceeded(
        Request $request,
        string $normalizedEmail,
        string $scope = 'public',
    ): void {
        $keys = $this->loginKeys($request, $normalizedEmail, $scope);

        // A credential proof clears only that account's failure debt. IP and
        // global ceilings continue to protect the endpoint from automation.
        RateLimiter::clear($keys['account_burst']);
        RateLimiter::clear($keys['account_hour']);
    }

    public function beginMfa(Request $request, int|string $userId): void
    {
        $keys = $this->mfaKeys($request, $userId);
        $limits = $this->mfaLimits();

        $this->rejectWhenLimited($request, [
            [$keys['account'], $limits['account_attempts']],
            [$keys['ip'], $limits['ip_attempts']],
            [$keys['global'], $limits['global_attempts']],
        ], 'code');

        RateLimiter::hit($keys['ip'], $limits['account_seconds']);
        RateLimiter::hit($keys['global'], 60);
    }

    public function mfaFailed(Request $request, int|string $userId): void
    {
        $keys = $this->mfaKeys($request, $userId);
        $limits = $this->mfaLimits();

        RateLimiter::hit($keys['account'], $limits['account_seconds']);
    }

    public function mfaSucceeded(Request $request, int|string $userId): void
    {
        $keys = $this->mfaKeys($request, $userId);

        RateLimiter::clear($keys['account']);
    }

    /** @return array<string, string> */
    public function loginKeys(
        Request $request,
        string $normalizedEmail,
        string $scope = 'public',
    ): array {
        $scope = $scope === 'admin' ? 'admin' : 'public';
        $account = AuthenticationIdentity::opaque($normalizedEmail, $scope.'-login-account');
        $ip = AuthenticationIdentity::opaque((string) $request->ip(), $scope.'-login-ip');

        return [
            'account_burst' => "ubsc:auth:{$scope}:login:account:burst:{$account}",
            'account_hour' => "ubsc:auth:{$scope}:login:account:hour:{$account}",
            'ip_minute' => "ubsc:auth:{$scope}:login:ip:minute:{$ip}",
            'ip_hour' => "ubsc:auth:{$scope}:login:ip:hour:{$ip}",
            'global_minute' => "ubsc:auth:{$scope}:login:global:minute",
        ];
    }

    /** @return array<string, string> */
    private function mfaKeys(Request $request, int|string $userId): array
    {
        $account = AuthenticationIdentity::opaque((string) $userId, 'admin-mfa-account');
        $ip = AuthenticationIdentity::opaque((string) $request->ip(), 'admin-mfa-ip');

        return [
            'account' => 'ubsc:auth:mfa:account:'.$account,
            'ip' => 'ubsc:auth:mfa:ip:'.$ip,
            'global' => 'ubsc:auth:mfa:global',
        ];
    }

    /**
     * @param  array<int, array{0:string, 1:int}>  $checks
     */
    private function rejectWhenLimited(
        Request $request,
        array $checks,
        string $errorKey,
    ): void {
        foreach ($checks as [$key, $maximum]) {
            if ($maximum > 0 && RateLimiter::tooManyAttempts($key, $maximum)) {
                event(new Lockout($request));

                throw ValidationException::withMessages([
                    $errorKey => __('auth.throttle_generic'),
                ]);
            }
        }
    }

    /** @return array<string, int> */
    private function loginLimits(): array
    {
        $configured = (array) config('security.admin_mfa.login', []);

        return [
            'account_burst_attempts' => max(1, (int) ($configured['account_burst_attempts'] ?? 5)),
            'account_burst_seconds' => max(60, (int) ($configured['account_burst_seconds'] ?? 600)),
            'account_hour_attempts' => max(1, (int) ($configured['account_hour_attempts'] ?? 15)),
            'ip_minute_attempts' => max(1, (int) ($configured['ip_minute_attempts'] ?? 15)),
            'ip_hour_attempts' => max(1, (int) ($configured['ip_hour_attempts'] ?? 100)),
            'global_minute_attempts' => max(1, (int) ($configured['global_minute_attempts'] ?? 120)),
        ];
    }

    /** @return array<string, int> */
    private function mfaLimits(): array
    {
        $configured = (array) config('security.admin_mfa.verification', []);

        return [
            'account_attempts' => max(1, (int) ($configured['account_attempts'] ?? 5)),
            'account_seconds' => max(60, (int) ($configured['account_seconds'] ?? 600)),
            'ip_attempts' => max(1, (int) ($configured['ip_attempts'] ?? 20)),
            'global_attempts' => max(1, (int) ($configured['global_attempts'] ?? 300)),
        ];
    }
}
