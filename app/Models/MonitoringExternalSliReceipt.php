<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class MonitoringExternalSliReceipt extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'provider',
        'probe_id',
        'signing_key_id',
        'status',
        'checked_at',
        'completed_at',
        'latency_ms',
        'body_sha256',
        'recorded_at',
    ];

    protected $hidden = [
        'body_sha256',
    ];

    protected function casts(): array
    {
        return [
            'checked_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'latency_ms' => 'integer',
            'recorded_at' => 'immutable_datetime',
        ];
    }
}
