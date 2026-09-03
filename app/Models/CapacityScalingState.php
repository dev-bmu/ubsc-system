<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class CapacityScalingState extends Model
{
    protected $table = 'capacity_scaling_states';

    protected $primaryKey = 'target_key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'observed_instances' => 'integer',
            'raw_recommendation' => 'integer',
            'desired_instances' => 'integer',
            'low_observation_count' => 'integer',
            'low_since' => 'immutable_datetime',
            'last_scale_up_at' => 'immutable_datetime',
            'last_scale_down_at' => 'immutable_datetime',
            'version' => 'integer',
        ];
    }
}
