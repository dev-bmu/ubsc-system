<?php

namespace App\Models\Gallery;

use Illuminate\Database\Eloquent\Model;

class GalleryAnalyticsDaily extends Model
{
    protected $table = 'gallery_analytics_daily';

    protected $fillable = [
        'event_date',
        'event_type',
        'section_key',
        'item_uuid',
        'dimension_hash',
        'dimension_label',
        'event_count',
        'unique_sessions',
    ];

    protected function casts(): array
    {
        return [
            'event_date' => 'date',
            'event_count' => 'integer',
            'unique_sessions' => 'integer',
        ];
    }
}
