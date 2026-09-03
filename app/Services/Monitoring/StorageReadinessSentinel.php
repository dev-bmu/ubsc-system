<?php

namespace App\Services\Monitoring;

final class StorageReadinessSentinel
{
    public const CONTENT = "ubsc-storage-readiness-v1\n";

    public function validDisk(string $disk): bool
    {
        return preg_match('/\A[a-z0-9][a-z0-9._-]{0,63}\z/i', trim($disk)) === 1;
    }

    public function normalizePath(string $path): ?string
    {
        $path = str_replace('\\', '/', trim($path));
        $segments = explode('/', $path);

        if ($path === ''
            || str_starts_with($path, '/')
            || strlen($path) > 255
            || preg_match('/[\x00-\x1F\x7F]/', $path) === 1
            || collect($segments)->contains(
                static fn (string $segment): bool => $segment === ''
                    || $segment === '.'
                    || $segment === '..'
                    || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\z/', $segment) !== 1,
            )) {
            return null;
        }

        return $path;
    }

    public function contentMatches(mixed $content): bool
    {
        return is_string($content) && hash_equals(self::CONTENT, $content);
    }
}
