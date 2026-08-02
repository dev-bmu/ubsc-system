<?php

namespace App\Models;

use App\Casts\SanitizedPaymentMetadata;
use App\Enums\PaymentAttemptStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class PaymentEvent extends Model
{
    protected $fillable = [
        'public_id',
        'payment_attempt_id',
        'provider',
        'provider_event_id',
        'event_type',
        'reported_status',
        'reported_amount',
        'reported_currency',
        'payload_hash',
        'metadata',
        'processing_result',
        'processing_message',
        'occurred_at',
        'received_at',
        'processed_at',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $event): void {
            $event->public_id ??= (string) Str::uuid();
            $event->reported_currency = strtoupper((string) $event->reported_currency);
            $event->received_at ??= now();
        });
    }

    protected function casts(): array
    {
        return [
            'reported_status' => PaymentAttemptStatus::class,
            'reported_amount' => 'integer',
            'metadata' => SanitizedPaymentMetadata::class,
            'occurred_at' => 'datetime',
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(PaymentAttempt::class, 'payment_attempt_id');
    }
}
