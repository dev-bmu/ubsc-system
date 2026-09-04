<?php

namespace App\Support\ReferenceData;

final class ReferenceAsset
{
    public static function url(mixed $path): ?string
    {
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $normalized = '/'.ltrim(str_replace('\\', '/', trim($path)), '/');

        if (str_contains($normalized, '..')
            || ! is_file(public_path(ltrim($normalized, '/')))) {
            return null;
        }

        return $normalized;
    }
}
