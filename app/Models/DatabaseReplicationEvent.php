<?php

namespace App\Models;

use App\Casts\UtcImmutableDateTime;
use App\Models\Builders\DatabaseReplicationEventBuilder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use LogicException;

final class DatabaseReplicationEvent extends Model
{
    public $timestamps = false;

    protected $guarded = ['*'];

    protected $hidden = [
        'source_payload',
        'source_signature',
        'signature',
    ];

    protected static function booted(): void
    {
        self::creating(static function (): never {
            throw new LogicException(
                'Database replication events can only be appended by the control plane.',
            );
        });
        self::updating(static function (): never {
            throw new LogicException('Database replication events are append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Database replication events cannot be deleted.');
        });
    }

    public function newEloquentBuilder($query): Builder
    {
        /** @var QueryBuilder $query */
        return new DatabaseReplicationEventBuilder($query);
    }

    protected function casts(): array
    {
        return [
            'schema_version' => 'integer',
            'sequence' => 'integer',
            'topology_epoch' => 'integer',
            'checks' => 'array',
            'source_payload' => 'array',
            'observed_at' => UtcImmutableDateTime::class,
            'recorded_at' => UtcImmutableDateTime::class,
        ];
    }
}
