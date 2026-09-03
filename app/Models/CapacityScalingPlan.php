<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

final class CapacityScalingPlan extends Model
{
    public $timestamps = false;

    protected $table = 'capacity_scaling_plans';

    protected $guarded = [];

    protected $hidden = ['signature'];

    protected static function booted(): void
    {
        self::updating(static function (): never {
            throw new LogicException('Capacity scaling plans are append-only.');
        });
        self::deleting(static function (): never {
            throw new LogicException('Capacity scaling plans cannot be deleted through Eloquent.');
        });
    }

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'generated_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'recorded_at' => 'immutable_datetime',
        ];
    }
}
