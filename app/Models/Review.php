<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    protected $fillable = [
        'user_id',
        'reviewer_name',
        'rating',
        'text',
        'is_approved',
    ];

    protected function casts(): array
    {
        return [
            'rating'      => 'float',
            'is_approved' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopePending($q)
    {
        return $q->where('is_approved', false);
    }

    public function scopeApproved($q)
    {
        return $q->where('is_approved', true);
    }
}
