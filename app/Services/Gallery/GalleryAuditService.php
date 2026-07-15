<?php

namespace App\Services\Gallery;

use App\Models\Gallery\GalleryAuditLog;
use App\Models\Gallery\GalleryItem;
use App\Models\User;
use Illuminate\Support\Str;

class GalleryAuditService
{
    public function record(
        ?GalleryItem $item,
        string $action,
        ?array $before = null,
        ?array $after = null,
        ?User $user = null,
        ?string $requestId = null,
    ): GalleryAuditLog {
        return GalleryAuditLog::create([
            'gallery_item_id' => $item?->id,
            'item_uuid' => $item?->uuid,
            'user_id' => $user?->id ?? auth()->id(),
            'action' => $action,
            'before' => $before,
            'after' => $after,
            'request_id' => $requestId ?: $this->requestId(),
            'created_at' => now(),
        ]);
    }

    private function requestId(): string
    {
        if (! app()->runningInConsole() && app()->bound('request')) {
            $requestId = request()->header('X-Request-ID');

            if (is_string($requestId) && Str::isUuid($requestId)) {
                return $requestId;
            }
        }

        return (string) Str::uuid();
    }
}
