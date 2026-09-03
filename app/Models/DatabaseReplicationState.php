<?php

namespace App\Models;

use App\Casts\UtcImmutableDateTime;
use Illuminate\Database\Eloquent\Model;

final class DatabaseReplicationState extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $guarded = ['*'];

    protected $hidden = ['source_payload', 'source_signature'];

    protected function casts(): array
    {
        return [
            'topology_epoch' => 'integer',
            'replica_count' => 'integer',
            'healthy_replica_count' => 'integer',
            'synchronous_replica_count' => 'integer',
            'maximum_replica_lag_ms' => 'integer',
            'data_loss_bytes' => 'integer',
            'checks' => 'array',
            'source_payload' => 'array',
            'observed_at' => UtcImmutableDateTime::class,
            'last_healthy_at' => UtcImmutableDateTime::class,
            'last_failure_at' => UtcImmutableDateTime::class,
        ];
    }
}
