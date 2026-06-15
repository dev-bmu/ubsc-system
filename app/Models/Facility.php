<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Facility extends Model implements HasMedia
{
    use InteractsWithMedia;

    protected $fillable = [
        'facility_category_id',
        'name',
        'slug',
        'description',
        'location',
        'venue_type',
        'capacity',
        'active_slots',
        'class_code',
        'rating',
        'display_metadata',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active'        => 'boolean',
            'rating'           => 'float',
            'capacity'         => 'integer',
            'display_metadata' => 'array',
            'active_slots'     => 'array',
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('hero')->singleFile();
        $this->addMediaCollection('gallery');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(FacilityCategory::class, 'facility_category_id');
    }

    public function prices(): HasMany
    {
        return $this->hasMany(FacilityPrice::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function units(): HasMany
    {
        return $this->hasMany(FacilityUnit::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
