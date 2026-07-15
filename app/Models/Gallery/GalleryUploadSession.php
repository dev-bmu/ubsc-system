<?php

namespace App\Models\Gallery;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class GalleryUploadSession extends Model
{
    protected $fillable = [
        'uuid',
        'user_id',
        'upload_batch_id',
        'gallery_item_id',
        'client_fingerprint',
        'original_name',
        'source_mime',
        'total_bytes',
        'chunk_size',
        'total_chunks',
        'received_chunks',
        'metadata',
        'status',
        'source_sha256',
        'staged_path',
        'error_detail',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'total_bytes' => 'integer',
            'chunk_size' => 'integer',
            'total_chunks' => 'integer',
            'received_chunks' => 'array',
            'metadata' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $session): void {
            $session->uuid ??= (string) Str::uuid();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(GalleryUploadBatch::class, 'upload_batch_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(GalleryItem::class, 'gallery_item_id');
    }
}
