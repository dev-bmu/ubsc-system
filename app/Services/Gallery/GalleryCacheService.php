<?php

namespace App\Services\Gallery;

use Illuminate\Support\Facades\Cache;

class GalleryCacheService
{
    private const VERSION_KEY = 'gallery:public:version';

    public function version(): int
    {
        return (int) Cache::rememberForever(self::VERSION_KEY, fn () => 1);
    }

    public function key(string $suffix): string
    {
        return "gallery:public:v{$this->version()}:{$suffix}";
    }

    public function invalidate(): void
    {
        $next = $this->version() + 1;
        Cache::forever(self::VERSION_KEY, $next);
    }
}
