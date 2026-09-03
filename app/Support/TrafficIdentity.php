<?php

namespace App\Support;

use Illuminate\Http\Request;

final class TrafficIdentity
{
    public static function client(Request $request, string $scope): string
    {
        return AuthenticationIdentity::opaque(
            self::normalizedIp($request),
            'traffic:'.$scope.':client',
        );
    }

    public static function network(Request $request, string $scope): string
    {
        return AuthenticationIdentity::opaque(
            self::networkPrefix(self::normalizedIp($request)),
            'traffic:'.$scope.':network',
        );
    }

    public static function actor(Request $request, string $scope): string
    {
        $identifier = $request->user()?->getAuthIdentifier();

        return is_int($identifier) || is_string($identifier)
            ? AuthenticationIdentity::opaque((string) $identifier, 'traffic:'.$scope.':actor')
            : self::client($request, $scope);
    }

    private static function normalizedIp(Request $request): string
    {
        $ip = trim((string) $request->ip());

        return filter_var($ip, FILTER_VALIDATE_IP) !== false
            ? strtolower($ip)
            : 'invalid-client';
    }

    private static function networkPrefix(string $ip): string
    {
        $packed = @inet_pton($ip);

        if ($packed === false) {
            return 'invalid-network';
        }

        if (strlen($packed) === 4) {
            return 'v4:'.bin2hex(substr($packed, 0, 3)).'/24';
        }

        if (strlen($packed) === 16) {
            return 'v6:'.bin2hex(substr($packed, 0, 8)).'/64';
        }

        return 'invalid-network';
    }
}
