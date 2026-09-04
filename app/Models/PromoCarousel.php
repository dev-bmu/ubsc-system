<?php

namespace App\Models;

use App\Support\ReferenceData\ReferenceAsset;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class PromoCarousel extends Model implements HasMedia
{
    use InteractsWithMedia;

    protected $fillable = [
        'title',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('slide')->singleFile();
    }

    public function slideUrl(): ?string
    {
        return $this->getFirstMediaUrl('slide')
            ?: ReferenceAsset::url($this->fallback_asset_path);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order');
    }
}
