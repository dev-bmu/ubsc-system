<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class MonitoringAlertDelivery extends Model
{
    public const TERMINAL_STATUSES = ['delivered', 'dead'];

    protected $fillable = [
        'public_id',
        'monitoring_incident_id',
        'deduplication_key',
        'event',
        'channel',
        'severity',
        'status',
        'payload',
        'attempts',
        'available_at',
        'claimed_at',
        'claim_token',
        'last_attempt_at',
        'delivered_at',
        'last_error_code',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $delivery): void {
            $delivery->public_id ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'attempts' => 'integer',
            'available_at' => 'immutable_datetime',
            'claimed_at' => 'immutable_datetime',
            'last_attempt_at' => 'immutable_datetime',
            'delivered_at' => 'immutable_datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(MonitoringIncident::class, 'monitoring_incident_id');
    }
}
