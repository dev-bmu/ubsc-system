<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class MonitoringIncident extends Model
{
    use SoftDeletes;

    public const SEVERITIES = ['critical', 'warning', 'info'];

    public const ACTIVE_STATUSES = ['open', 'acknowledged'];

    protected $fillable = [
        'public_id',
        'deduplication_key',
        'active_key',
        'source',
        'title',
        'summary',
        'severity',
        'status',
        'started_at',
        'last_observed_at',
        'acknowledged_at',
        'acknowledged_by',
        'resolved_at',
        'resolved_by',
        'resolution_note',
        'context',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $incident): void {
            $incident->public_id ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'started_at' => 'immutable_datetime',
            'last_observed_at' => 'immutable_datetime',
            'acknowledged_at' => 'immutable_datetime',
            'resolved_at' => 'immutable_datetime',
            'context' => 'array',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function acknowledgedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
