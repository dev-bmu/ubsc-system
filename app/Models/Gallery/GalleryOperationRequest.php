<?php

namespace App\Models\Gallery;

use Illuminate\Database\Eloquent\Model;

class GalleryOperationRequest extends Model
{
    protected $fillable = [
        'user_id',
        'idempotency_key',
        'operation',
        'request_hash',
        'response',
        'status',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'response' => 'array',
            'expires_at' => 'datetime',
        ];
    }
}
