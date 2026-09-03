<?php

namespace App\Models;

use App\Casts\UtcImmutableDateTime;
use App\Models\Builders\RecoveryEvidenceBuilder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use LogicException;

final class RecoveryEvidence extends Model
{
    public $timestamps = false;

    protected $table = 'recovery_evidence';

    protected $guarded = ['*'];

    protected $hidden = [
        'checksum_sha256',
        'signature',
        'source_payload',
        'source_signature',
    ];

    protected static function booted(): void
    {
        self::creating(static function (): never {
            throw new LogicException(
                'Recovery evidence can only be appended by its transactional ledger.',
            );
        });
        self::updating(static function (): never {
            throw new LogicException('Recovery evidence is append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Recovery evidence cannot be deleted by the application.');
        });
    }

    public function newEloquentBuilder($query): Builder
    {
        /** @var QueryBuilder $query */
        return new RecoveryEvidenceBuilder($query);
    }

    protected function casts(): array
    {
        return [
            'schema_version' => 'integer',
            'sequence' => 'integer',
            'source_snapshot_at' => UtcImmutableDateTime::class,
            'recovery_point_at' => UtcImmutableDateTime::class,
            'started_at' => UtcImmutableDateTime::class,
            'completed_at' => UtcImmutableDateTime::class,
            'immutable_until' => UtcImmutableDateTime::class,
            'size_bytes' => 'integer',
            'observed_rpo_seconds' => 'integer',
            'observed_rto_seconds' => 'integer',
            'checks' => 'array',
            'source_payload' => 'array',
            'recorded_at' => UtcImmutableDateTime::class,
        ];
    }
}
