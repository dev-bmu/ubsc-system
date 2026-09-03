<?php

namespace App\Support;

class SafePublicUrl
{
    /** @var array<int, string> */
    private const GOOGLE_MAP_HOSTS = [
        'google.com',
        'maps.google.com',
        'maps.app.goo.gl',
    ];

    public static function googleMaps(mixed $value): ?string
    {
        return self::https($value, self::GOOGLE_MAP_HOSTS);
    }

    /**
     * @param  array<int, string>|null  $allowedHosts
     */
    public static function https(
        mixed $value,
        ?array $allowedHosts = null,
    ): ?string {
        if (! is_string($value)) {
            return null;
        }

        $url = trim($value);

        if ($url === ''
            || preg_match('/[\x00-\x1F\x7F\\\\]/', $url)
            || preg_match('/%(?:00|0a|0d)/i', $url)
            || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($url);

        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || ! isset($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || (isset($parts['port']) && (int) $parts['port'] !== 443)) {
            return null;
        }

        if ($allowedHosts === null) {
            return $url;
        }

        $host = strtolower(rtrim((string) $parts['host'], '.'));

        foreach ($allowedHosts as $allowedHost) {
            $allowedHost = strtolower($allowedHost);

            if ($host === $allowedHost || str_ends_with($host, '.'.$allowedHost)) {
                return $url;
            }
        }

        return null;
    }
}
