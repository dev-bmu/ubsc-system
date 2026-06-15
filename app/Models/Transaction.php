<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Transaction extends Model
{
    protected $fillable = [
        'user_id',
        'transactionable_id',
        'transactionable_type',
        'amount',
        'payment_status',
        'xendit_invoice_id',
        'checkout_url',
        'paid_at',
    ];

    protected $appends = ['receipt_number'];

    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
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

    public function getReceiptNumberAttribute(): string
    {
        return 'UBSC-' . str_pad((string) $this->id, 6, '0', STR_PAD_LEFT);
    }
}
