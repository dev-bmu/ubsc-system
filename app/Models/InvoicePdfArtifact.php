<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoicePdfArtifact extends Model
{
    public const TIER_HOT = 'hot';

    public const TIER_ARCHIVE = 'archive';

    protected $fillable = [
        'cache_key',
        'kind',
        'subject_id',
        'template_version',
        'storage_tier',
        'disk',
        'path',
        'content_sha256',
        'size_bytes',
        'render_duration_ms',
        'generated_at',
        'last_verified_at',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'subject_id' => 'integer',
            'size_bytes' => 'integer',
            'render_duration_ms' => 'integer',
            'generated_at' => 'immutable_datetime',
            'last_verified_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
        ];
    }
}
