<?php

namespace App\Models\Gallery;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

class GalleryItemSection extends Pivot
{
    protected $table = 'gallery_item_section';

    public $incrementing = true;

    protected $fillable = [
        'gallery_item_id',
        'gallery_section_id',
        'featured_position',
        'sort_order',
        'assigned_by',
    ];

    protected function casts(): array
    {
        return [
            'featured_position' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(GalleryItem::class, 'gallery_item_id');
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(GallerySection::class, 'gallery_section_id');
    }
}
