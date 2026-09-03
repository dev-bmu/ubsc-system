<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

final class CapacityPlatformObservation extends Model
{
    public $timestamps = false;

    protected $table = 'capacity_platform_observations';

    protected $guarded = [];

    protected $hidden = ['source_signature'];

    protected static function booted(): void
    {
        self::updating(static function (): never {
            throw new LogicException('Capacity platform observations are append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Capacity platform observations cannot be deleted through Eloquent.');
        });
    }

    protected function casts(): array
    {
        return [
            'observed_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'payload' => 'array',
            'recorded_at' => 'immutable_datetime',
        ];
    }
}
