<?php

namespace App\Models\Gallery;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class GalleryUploadBatch extends Model
{
    protected $fillable = [
        'uuid',
        'user_id',
        'status',
        'file_count',
        'completed_count',
        'failed_count',
        'common_metadata',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'common_metadata' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $batch): void {
            $batch->uuid ??= (string) Str::uuid();
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

    public function items(): HasMany
    {
        return $this->hasMany(GalleryItem::class, 'upload_batch_id');
    }
}
