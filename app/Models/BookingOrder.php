<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;

class BookingOrder extends Model
{
    protected $fillable = [
        'user_id',
        'customer_name',
        'whatsapp_number',
        'identity_category',
        'identity_number',
        'subtotal_amount',
        'transaction_fee',
        'discount_amount',
        'total_amount',
        'status',
        'notes',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'subtotal_amount' => 'integer',
            'transaction_fee' => 'integer',
            'discount_amount' => 'integer',
            'total_amount' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function transaction(): MorphOne
    {
        return $this->morphOne(Transaction::class, 'transactionable');
    }
}
