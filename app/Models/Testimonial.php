<?php

namespace App\Models;

use App\Support\ReferenceData\ReferenceAsset;
use Illuminate\Database\Eloquent\Model;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Testimonial extends Model implements HasMedia
{
    use InteractsWithMedia;

    protected $fillable = [
        'author_name',
        'author_role',
        'quote',
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
        $this->addMediaCollection('image')->singleFile();
        $this->addMediaCollection('logo')->singleFile();
    }

    public function imageUrl(): ?string
    {
        return $this->getFirstMediaUrl('image') ?: $this->fallbackImageUrl();
    }

    public function logoUrl(): ?string
    {
        return $this->getFirstMediaUrl('logo') ?: $this->fallbackLogoUrl();
    }

    private function fallbackImageUrl(): ?string
    {
        $configured = ReferenceAsset::url($this->fallback_image_path);

        if ($configured) {
            return $configured;
        }

        $fallbacks = [
            'ub football club' => 'assets/icons/testimonial-ub-sport-center.avif',
            'malang tennis academy' => 'assets/icons/testimonial-ub-sport-center.avif',
            'brawijaya badminton club' => 'assets/icons/testimonial-ub-sport-center.avif',
        ];

        $path = $fallbacks[strtolower($this->author_name)] ?? null;

        if (! $path || ! file_exists(public_path($path))) {
            return null;
        }

        return ReferenceAsset::url($path);
    }

    private function fallbackLogoUrl(): ?string
    {
        $configured = ReferenceAsset::url($this->fallback_logo_path);

        if ($configured) {
            return $configured;
        }

        $fallbacks = [
            'malang tennis academy' => 'assets/icons/ulasan-malang-tennis-academy-ubsc.avif',
        ];

        $path = $fallbacks[strtolower($this->author_name)] ?? null;

        if (! $path || ! file_exists(public_path($path))) {
            return null;
        }

        return ReferenceAsset::url($path);
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }

    public function scopeOrdered($q)
    {
        return $q->orderBy('sort_order');
    }
}
