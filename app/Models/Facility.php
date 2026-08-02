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
        'reservation_method',
        'reservation_url',
        'reservation_phone',
        'reservation_message',
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

    /**
     * Keep the public booking directory and reservation-link resolver on the
     * same rule. If booking visibility gains its own flag later, it only needs
     * to be changed here and in isVisibleInBookingDirectory().
     */
    public function scopeVisibleInBookingDirectory(Builder $query): Builder
    {
        return $query
            ->where('is_active', true)
            ->whereIn('reservation_method', ['website', 'auto']);
    }

    public function isVisibleInBookingDirectory(): bool
    {
        return $this->is_active === true
            && in_array(
                $this->reservation_method,
                ['website', 'auto'],
                true,
            );
    }
}
