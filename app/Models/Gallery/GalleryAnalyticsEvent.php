<?php

namespace App\Models\Gallery;

use Illuminate\Database\Eloquent\Model;

class GalleryAnalyticsEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'event_type',
        'item_uuid',
        'section_key',
        'session_hash',
        'query_hash',
        'query_term',
        'payload',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'occurred_at' => 'datetime',
        ];
    }
}
