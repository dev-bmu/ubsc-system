<?php

namespace App\Support;

final class AuthenticationIdentity
{
    public static function normalizeEmail(mixed $email): string
    {
        return mb_strtolower(trim((string) $email), 'UTF-8');
    }

    public static function opaque(string $value, string $scope): string
    {
        return hash_hmac(
            'sha256',
            $scope.'|'.$value,
            (string) config('app.key'),
        );
    }

    public static function credentialFingerprint(
        mixed $userId,
        string $passwordHash,
    ): string {
        return hash_hmac(
            'sha256',
            (string) $userId.'|'.$passwordHash,
            (string) config('app.key'),
        );
    }
}
