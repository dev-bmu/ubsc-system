<?php

namespace App\Models;

use App\Casts\UtcImmutableDateTime;
use Illuminate\Database\Eloquent\Model;
use LogicException;

final class ResilienceDrillEvidence extends Model
{
    public $timestamps = false;

    protected $table = 'resilience_drill_evidence';

    protected $guarded = ['*'];

    protected $hidden = [
        'source_signature',
        'ledger_signature',
    ];

    protected static function booted(): void
    {
        self::creating(static function (): never {
            throw new LogicException(
                'Resilience drill evidence can only be appended by its transactional ledger.',
            );
        });
        self::updating(static function (): never {
            throw new LogicException('Resilience drill evidence is append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Resilience drill evidence cannot be deleted by the application.');
        });
    }

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'started_at' => UtcImmutableDateTime::class,
            'completed_at' => UtcImmutableDateTime::class,
            'scenario_count' => 'integer',
            'passed_count' => 'integer',
            'failed_count' => 'integer',
            'aborted_count' => 'integer',
            'campaign_controls_passed' => 'boolean',
            'worst_detection_seconds' => 'integer',
            'worst_recovery_seconds' => 'integer',
            'payload' => 'array',
            'recorded_at' => UtcImmutableDateTime::class,
        ];
    }
}
