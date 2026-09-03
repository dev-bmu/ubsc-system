<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonitoringHeartbeat extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = [
        'key',
        'category',
        'status',
        'observed_at',
        'last_success_at',
        'last_failure_at',
        'latency_ms',
        'message',
        'context',
    ];

    protected function casts(): array
    {
        return [
            'observed_at' => 'immutable_datetime',
            'last_success_at' => 'immutable_datetime',
            'last_failure_at' => 'immutable_datetime',
            'latency_ms' => 'integer',
            'context' => 'array',
        ];
    }
}
