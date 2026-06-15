<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class FacilityUnit extends Model implements HasMedia
{
    use InteractsWithMedia;

    protected $fillable = [
        'facility_id',
        'name',
        'is_active',
        'use_custom_schedule',
        'active_slots',
        'use_custom_pricing',
    ];

    protected function casts(): array
    {
        return [
            'is_active'           => 'boolean',
            'use_custom_schedule' => 'boolean',
            'active_slots'        => 'array',
            'use_custom_pricing'  => 'boolean',
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('unit_image')->singleFile();
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function prices(): HasMany
    {
        return $this->hasMany(FacilityUnitPrice::class);
    }
}
