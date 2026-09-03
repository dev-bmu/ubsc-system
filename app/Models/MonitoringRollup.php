<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonitoringRollup extends Model
{
    protected $fillable = [
        'metric_key',
        'bucket_started_at',
        'first_sampled_at',
        'last_sampled_at',
        'sample_count',
        'operational_count',
        'degraded_count',
        'outage_count',
        'unknown_count',
        'sli_good_count',
        'sli_total_count',
        'latency_sample_count',
        'latency_sum_ms',
        'latency_max_ms',
        'value_sample_count',
        'value_sum',
        'value_max',
        'value_last',
    ];

    protected function casts(): array
    {
        return [
            'bucket_started_at' => 'immutable_datetime',
            'first_sampled_at' => 'immutable_datetime',
            'last_sampled_at' => 'immutable_datetime',
            'sample_count' => 'integer',
            'operational_count' => 'integer',
            'degraded_count' => 'integer',
            'outage_count' => 'integer',
            'unknown_count' => 'integer',
            'sli_good_count' => 'integer',
            'sli_total_count' => 'integer',
            'latency_sample_count' => 'integer',
            'latency_sum_ms' => 'integer',
            'latency_max_ms' => 'integer',
            'value_sample_count' => 'integer',
            'value_sum' => 'float',
            'value_max' => 'float',
            'value_last' => 'float',
        ];
    }
}
