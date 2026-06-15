<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MembershipHistory extends Model
{
    protected $fillable = [
        'membership_id',
        'user_id',
        'membership_plan_id',
        'transaction_id',
        'renewed_from_membership_id',
        'actor_id',
        'actor_type',
        'action',
        'start_date',
        'end_date',
        'amount',
        'payment_status',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'metadata' => 'array',
        ];
    }

    public function membership(): BelongsTo
    {
        return $this->belongsTo(Membership::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'membership_plan_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }

    public function renewedFrom(): BelongsTo
    {
        return $this->belongsTo(Membership::class, 'renewed_from_membership_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
