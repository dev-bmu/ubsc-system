<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use GuzzleHttp\Client;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GoogleAuthController extends Controller
{
    private const STAFF_ROLES = [
        'Administrator',
        'Manager',
        'Finance',
        'Staff Central',
        'Staff Front Office',
    ];

    public function redirectToGoogle(Request $request): RedirectResponse
    {
        if ($this->shouldUseCanonicalGoogleHost($request)) {
            return redirect()->away($this->canonicalGoogleLoginUrl());
        }

        return $this->googleProvider()->redirect();
    }

    public function handleGoogleCallback(): RedirectResponse
    {
        try {
            $googleUser = $this->googleProvider()->user();
            $googleId = $googleUser->getId();
            $email = Str::lower((string) $googleUser->getEmail());
            $isVerifiedEmail = $googleUser->user['email_verified'] ?? null;
            $avatarUrl = $this->googleAvatarUrl($googleUser);

            if ($email === '' || $isVerifiedEmail === false) {
                return $this->failedRedirect();
            }

            $user = User::where('google_id', $googleId)->first();

            if (! $user) {
                $user = User::where('email', $email)->first();
            }

            if ($user && $user->hasAnyRole(self::STAFF_ROLES)) {
                return $this->failedRedirect();
            }

            if ($user) {
                $user->forceFill([
                    'google_id' => $user->google_id ?: $googleId,
                    'avatar' => $this->resolveGoogleAvatar($user, $avatarUrl),
                    'email_verified_at' => $user->email_verified_at ?? now(),
                ])->save();
            } else {
                $user = User::create([
                    'name' => $googleUser->getName() ?: Str::before($email, '@') ?: 'Pengguna Google',
                    'email' => $email,
                    'google_id' => $googleId,
                    'avatar' => $avatarUrl,
                    'password' => Hash::make(Str::random(32)),
                ]);

                $user->forceFill([
                    'email_verified_at' => now(),
                ])->save();
            }

            Auth::login($user, true);
            request()->session()->regenerate();

            request()->session()->forget('url.intended');

            return redirect()->to(config('app.url', '/'));
        } catch (Throwable $exception) {
            Log::error('Google login failed.', [
                'message' => $exception->getMessage(),
                'code' => $exception->getCode(),
            ]);

            return $this->failedRedirect();
        }
    }

    private function failedRedirect(): RedirectResponse
    {
        return redirect('/?auth=login')->withErrors([
            'email' => 'Login Google gagal. Silakan coba lagi atau gunakan email dan password.',
        ]);
    }

    private function googleProvider()
    {
        $provider = Socialite::driver('google');
        $verify = config('services.google.http_verify', true);

        if ($verify !== true && method_exists($provider, 'setHttpClient')) {
            $provider->setHttpClient(new Client([
                'verify' => $verify,
            ]));
        }

        return $provider;
    }

    private function resolveGoogleAvatar(User $user, ?string $avatarUrl): ?string
    {
        if ($user->avatar && ! Str::startsWith($user->avatar, ['http://', 'https://', '/'])) {
            Storage::disk('public')->delete($user->avatar);
        }

        if ($avatarUrl) {
            return $avatarUrl;
        }

        if ($user->avatar && Str::startsWith($user->avatar, ['http://', 'https://', '/'])) {
            return $user->avatar;
        }

        return null;
    }

    private function googleAvatarUrl($googleUser): ?string
    {
        $avatar = $googleUser->getAvatar()
            ?: ($googleUser->user['picture'] ?? null)
            ?: ($googleUser->user['avatar'] ?? null);

        if (! is_string($avatar) || trim($avatar) === '') {
            return null;
        }

        return $this->normalizeGoogleAvatarSize($avatar);
    }

    private function normalizeGoogleAvatarSize(string $avatar): string
    {
        if (! Str::contains($avatar, 'googleusercontent.com')) {
            return $avatar;
        }

        return (string) preg_replace('/=s\d+(-c)?$/', '=s256-c', $avatar);
    }

    private function shouldUseCanonicalGoogleHost(Request $request): bool
    {
        $appUrl = config('app.url');
        $canonicalHost = parse_url((string) $appUrl, PHP_URL_HOST);

        return is_string($canonicalHost)
            && $canonicalHost !== ''
            && $request->getHost() !== $canonicalHost;
    }

    private function canonicalGoogleLoginUrl(): string
    {
        return rtrim((string) config('app.url'), '/') . '/auth/google';
    }
}
