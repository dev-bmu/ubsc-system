<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonitoringSnapshot extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = [
        'key',
        'schema_version',
        'status',
        'payload',
        'collected_at',
        'collection_duration_ms',
    ];

    protected function casts(): array
    {
        return [
            'schema_version' => 'integer',
            'payload' => 'array',
            'collected_at' => 'immutable_datetime',
            'collection_duration_ms' => 'integer',
        ];
    }
}
