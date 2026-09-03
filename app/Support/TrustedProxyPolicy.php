<?php

namespace App\Support;

final class TrustedProxyPolicy
{
    private const IPV4_MINIMUM_PREFIX = 24;

    private const IPV6_MINIMUM_PREFIX = 64;

    public static function allows(string $proxy): bool
    {
        $proxy = trim($proxy);
        $normalized = strtoupper($proxy);

        if ($proxy === ''
            || in_array($normalized, ['*', '**', 'REMOTE_ADDR', '0.0.0.0/0', '::/0'], true)) {
            return false;
        }

        if (! str_contains($proxy, '/')) {
            return filter_var($proxy, FILTER_VALIDATE_IP) !== false;
        }

        [$address, $prefix] = array_pad(explode('/', $proxy, 2), 2, null);
        if (! is_string($prefix) || ! ctype_digit($prefix)) {
            return false;
        }

        $packed = @inet_pton($address);
        if ($packed === false) {
            return false;
        }

        $maximum = strlen($packed) === 4 ? 32 : (strlen($packed) === 16 ? 128 : 0);
        $minimum = $maximum === 32
            ? self::IPV4_MINIMUM_PREFIX
            : ($maximum === 128 ? self::IPV6_MINIMUM_PREFIX : PHP_INT_MAX);
        $bits = (int) $prefix;

        return $bits >= $minimum
            && $bits <= $maximum
            && self::isCanonicalNetwork($packed, $bits);
    }

    private static function isCanonicalNetwork(string $packed, int $prefix): bool
    {
        $completeBytes = intdiv($prefix, 8);
        $remainingBits = $prefix % 8;
        $hostStart = $completeBytes;

        if ($remainingBits > 0) {
            $hostMask = (1 << (8 - $remainingBits)) - 1;
            if ((ord($packed[$completeBytes]) & $hostMask) !== 0) {
                return false;
            }

            $hostStart++;
        }

        for ($index = $hostStart, $length = strlen($packed); $index < $length; $index++) {
            if (ord($packed[$index]) !== 0) {
                return false;
            }
        }

        return true;
    }
}
