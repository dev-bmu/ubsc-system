<?php

namespace App\Models;

use App\Casts\SanitizedPaymentMetadata;
use App\Enums\PaymentAttemptStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class PaymentAttempt extends Model
{
    protected $fillable = [
        'public_id',
        'transaction_id',
        'user_id',
        'attempt_number',
        'idempotency_key',
        'request_fingerprint',
        'amount',
        'currency',
        'status',
        'provider',
        'provider_reference',
        'provider_transaction_id',
        'failure_code',
        'failure_message',
        'metadata',
        'expires_at',
        'paid_at',
        'lock_version',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $attempt): void {
            $attempt->public_id ??= (string) Str::uuid();
            $attempt->currency = strtoupper((string) ($attempt->currency ?: 'IDR'));
        });
    }

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'attempt_number' => 'integer',
            'status' => PaymentAttemptStatus::class,
            'metadata' => SanitizedPaymentMetadata::class,
            'expires_at' => 'datetime',
            'paid_at' => 'datetime',
            'lock_version' => 'integer',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PaymentEvent::class);
    }
}
