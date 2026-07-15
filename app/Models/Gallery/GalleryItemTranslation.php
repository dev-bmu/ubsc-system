<?php

namespace App\Models\Gallery;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GalleryItemTranslation extends Model
{
    protected $fillable = [
        'locale',
        'title',
        'arena_type',
        'alt_text',
        'caption',
        'search_aliases',
    ];

    protected function casts(): array
    {
        return ['search_aliases' => 'array'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(GalleryItem::class, 'gallery_item_id');
    }
}
