<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphOne;

class Booking extends Model
{
    protected $fillable = [
        'user_id',
        'customer_name',
        'facility_id',
        'facility_unit_id',
        'booking_date',
        'start_time',
        'end_time',
        'pax',
        'subtotal_price',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'booking_date' => 'date',
            'pax'          => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function facilityUnit(): BelongsTo
    {
        return $this->belongsTo(FacilityUnit::class);
    }

    public function transaction(): MorphOne
    {
        return $this->morphOne(Transaction::class, 'transactionable');
    }
}
