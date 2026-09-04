<?php

namespace App\Models;

use App\Support\ReferenceData\ReferenceAsset;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Reel extends Model implements HasMedia
{
    use InteractsWithMedia;

    protected $fillable = [
        'title',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('thumbnail')->singleFile();
        $this->addMediaCollection('video')->singleFile();
    }

    public function thumbnailUrl(): ?string
    {
        return $this->getFirstMediaUrl('thumbnail')
            ?: ReferenceAsset::url($this->fallback_thumbnail_path);
    }

    public function videoUrl(): ?string
    {
        return $this->getFirstMediaUrl('video')
            ?: ReferenceAsset::url($this->fallback_video_path);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
