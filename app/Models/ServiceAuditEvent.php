<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

final class ServiceAuditEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'public_id',
        'subject_type',
        'subject_id',
        'action',
        'from_state',
        'to_state',
        'actor_type',
        'actor_id',
        'source',
        'reason_code',
        'correlation_id',
        'deduplication_key',
        'integrity_key_version',
        'payload_hash',
        'metadata',
        'occurred_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'subject_id' => 'integer',
            'actor_id' => 'integer',
            'integrity_key_version' => 'integer',
            'metadata' => 'array',
            'occurred_at' => 'immutable_datetime',
            'created_at' => 'immutable_datetime',
        ];
    }

    protected static function booted(): void
    {
        self::updating(static function (): never {
            throw new LogicException('Service audit events are append-only.');
        });

        self::deleting(static function (): never {
            throw new LogicException('Service audit events are append-only.');
        });
    }
}
