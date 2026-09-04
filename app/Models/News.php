<?php

namespace App\Models;

use App\Support\ReferenceData\ReferenceAsset;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class News extends Model implements HasMedia
{
    use InteractsWithMedia;

    public const MAX_IMAGES = 12;

    protected $fillable = [
        'news_category_id',
        'author_id',
        'title',
        'slug',
        'excerpt',
        'content',
        'status',
        'is_hero_featured',
        'hero_sort_order',
        'published_at',
    ];

    protected function casts(): array
    {
        return [
            'is_hero_featured' => 'boolean',
            'hero_sort_order' => 'integer',
            'published_at' => 'datetime',
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('thumbnail');
    }

    public function thumbnailUrl(): ?string
    {
        return $this->getFirstMediaUrl('thumbnail')
            ?: ReferenceAsset::url($this->fallback_image_path);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(NewsCategory::class, 'news_category_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query
            ->where('status', 'published')
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }

    public function scopeHeroFeatured(Builder $query): Builder
    {
        return $query
            ->where('is_hero_featured', true)
            ->whereBetween('hero_sort_order', [1, 6]);
    }
}
