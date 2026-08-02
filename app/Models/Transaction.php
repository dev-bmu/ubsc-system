<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Transaction extends Model
{
    protected $fillable = [
        'user_id',
        'transactionable_id',
        'transactionable_type',
        'amount',
        'payment_status',
        'payment_method',
        'xendit_invoice_id',
        'checkout_url',
        'service_snapshot',
        'paid_at',
    ];

    protected $appends = ['receipt_number'];

    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'service_snapshot' => 'array',
        ];
    }

    public function transactionable(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function paymentAttempts(): HasMany
    {
        return $this->hasMany(PaymentAttempt::class);
    }

    public function getReceiptNumberAttribute(): string
    {
        return 'UBSC-'.str_pad((string) $this->id, 6, '0', STR_PAD_LEFT);
    }
}
