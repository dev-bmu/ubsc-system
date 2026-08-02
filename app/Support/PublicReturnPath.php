<?php

namespace App\Support;

use Illuminate\Http\Request;

final class PublicReturnPath
{
    /**
     * Accept only a same-origin path. Absolute, protocol-relative, malformed,
     * and header-breaking values are ignored instead of being redirected to.
     */
    public static function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        if ($value === ''
            || mb_strlen($value) > 2048
            || preg_match('/[\x00-\x1F\x7F\\\\]/u', $value) === 1
            || preg_match('/%(?:0a|0d|5c)/i', $value) === 1
            || preg_match('/^\/%2f/i', $value) === 1) {
            return null;
        }

        $parts = parse_url($value);

        if ($parts === false
            || isset($parts['scheme'])
            || isset($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['port'])) {
            return null;
        }

        $path = $parts['path'] ?? '/';

        if (! str_starts_with($path, '/') || str_starts_with($path, '//')) {
            return null;
        }

        return $path
            .(isset($parts['query']) ? '?'.$parts['query'] : '')
            .(isset($parts['fragment']) ? '#'.$parts['fragment'] : '');
    }

    /**
     * Normalize either a relative public path or an absolute URL on the
     * configured application origin. Laravel's auth middleware stores its
     * intended URL as an absolute URL, so it must be reduced to a relative
     * path before it is ever echoed into the public auth flow.
     */
    public static function normalizeSameOrigin(
        mixed $value,
        ?string $origin = null,
    ): ?string {
        if ($normalized = self::normalize($value)) {
            return $normalized;
        }

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);
        $origin = rtrim($origin ?? (string) config('app.url'), '/');

        if ($value === ''
            || $origin === ''
            || mb_strlen($value) > 2048
            || preg_match('/[\x00-\x1F\x7F\\\\]/u', $value) === 1
            || preg_match('/%(?:0a|0d|5c)/i', $value) === 1) {
            return null;
        }

        $parts = parse_url($value);
        $originParts = parse_url($origin);

        if ($parts === false
            || $originParts === false
            || isset($parts['user'])
            || isset($parts['pass'])
            || ! isset($parts['scheme'], $parts['host'])
            || ! isset($originParts['scheme'], $originParts['host'])
            || ! hash_equals(
                strtolower((string) $originParts['scheme']),
                strtolower((string) $parts['scheme']),
            )
            || ! hash_equals(
                strtolower((string) $originParts['host']),
                strtolower((string) $parts['host']),
            )
            || self::effectivePort($parts) !== self::effectivePort($originParts)) {
            return null;
        }

        $path = $parts['path'] ?? '/';

        return self::normalize(
            $path
            .(isset($parts['query']) ? '?'.$parts['query'] : '')
            .(isset($parts['fragment']) ? '#'.$parts['fragment'] : ''),
        );
    }

    /**
     * Resolve and preserve a safe return target for a public auth request.
     *
     * An explicit return_to takes precedence. Otherwise, the framework
     * intended URL is accepted only when it belongs to the configured origin.
     * The session value is always rewritten as a relative path.
     */
    public static function resolveForRequest(
        Request $request,
        mixed $explicit = null,
    ): ?string {
        $returnTo = self::normalize($explicit)
            ?? self::normalizeSameOrigin(
                $request->session()->get('url.intended'),
            );

        if ($returnTo) {
            $request->session()->put('url.intended', $returnTo);
        } else {
            $request->session()->forget('url.intended');
        }

        return $returnTo;
    }

    /**
     * Build the homepage entry URL consumed by the public auth modal.
     */
    public static function modalEntry(
        string $mode,
        ?string $returnTo = null,
        array $parameters = [],
    ): string {
        $query = ['auth' => $mode, ...$parameters];

        if ($returnTo = self::normalize($returnTo)) {
            $query['return_to'] = $returnTo;
        }

        return '/?'.http_build_query(
            $query,
            '',
            '&',
            PHP_QUERY_RFC3986,
        );
    }

    /**
     * Add or replace query parameters without losing the target fragment.
     */
    public static function withQuery(
        ?string $returnTo,
        array $parameters,
    ): string {
        $returnTo = self::normalize($returnTo) ?? '/';
        $parts = parse_url($returnTo);
        $query = [];

        if (isset($parts['query'])) {
            parse_str($parts['query'], $query);
        }

        foreach ($parameters as $key => $value) {
            $query[(string) $key] = $value;
        }

        $path = $parts['path'] ?? '/';
        $queryString = http_build_query(
            $query,
            '',
            '&',
            PHP_QUERY_RFC3986,
        );

        return $path
            .($queryString !== '' ? '?'.$queryString : '')
            .(isset($parts['fragment']) ? '#'.$parts['fragment'] : '');
    }

    /**
     * @param  array<string, mixed>  $parts
     */
    private static function effectivePort(array $parts): ?int
    {
        if (isset($parts['port'])) {
            return (int) $parts['port'];
        }

        return match (strtolower((string) ($parts['scheme'] ?? ''))) {
            'http' => 80,
            'https' => 443,
            default => null,
        };
    }
}
