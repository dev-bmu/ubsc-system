<?php

namespace App\Models\Gallery;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class GallerySection extends Model
{
    protected $fillable = [
        'key',
        'slug',
        'name',
        'quota',
        'layout',
        'is_active',
        'activated_at',
    ];

    protected function casts(): array
    {
        return [
            'quota' => 'integer',
            'is_active' => 'boolean',
            'activated_at' => 'datetime',
        ];
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(GalleryItem::class, 'gallery_item_section')
            ->using(GalleryItemSection::class)
            ->withPivot(['id', 'featured_position', 'sort_order', 'assigned_by'])
            ->withTimestamps();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
