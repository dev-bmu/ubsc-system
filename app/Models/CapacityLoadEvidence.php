<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

final class CapacityLoadEvidence extends Model
{
    public $timestamps = false;

    protected $table = 'capacity_load_evidence';

    protected $guarded = [];

    protected $hidden = ['source_signature'];

    protected static function booted(): void
    {
        self::updating(static function (): never {
            throw new LogicException('Capacity evidence is append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Capacity evidence cannot be deleted by the application.');
        });
    }

    protected function casts(): array
    {
        return [
            'tested_instances' => 'integer',
            'tested_requests_per_second' => 'float',
            'operational_requests_per_second' => 'float',
            'operational_requests_per_second_per_instance' => 'float',
            'p95_ms' => 'integer',
            'p99_ms' => 'integer',
            'error_rate_percent' => 'float',
            'hold_seconds' => 'integer',
            'generated_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'payload' => 'array',
            'imported_at' => 'immutable_datetime',
        ];
    }
}
