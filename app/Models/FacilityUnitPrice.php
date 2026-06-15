<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FacilityUnitPrice extends Model
{
    protected $fillable = [
        'facility_unit_id',
        'user_category',
        'label',
        'price',
        'duration_minutes',
        'schedule_type',
        'applicable_days',
        'starts_at',
        'ends_at',
        'starts_on',
        'ends_on',
        'notes',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'applicable_days' => 'array',
            'starts_on'       => 'date',
            'ends_on'         => 'date',
        ];
    }

    public function facilityUnit(): BelongsTo
    {
        return $this->belongsTo(FacilityUnit::class);
    }
}
