<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;

class Membership extends Model
{
    protected $fillable = [
        'user_id',
        'membership_plan_id',
        'renewed_from_membership_id',
        'customer_name',
        'start_date',
        'end_date',
        'status',
        'created_by_id',
        'created_via',
        'registration_token',
        'registration_email',
        'registration_phone',
        'registration_gender',
        'registration_category',
        'registration_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'registration_expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function transaction(): MorphOne
    {
        return $this->morphOne(Transaction::class, 'transactionable');
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'membership_plan_id');
    }

    public function renewedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'renewed_from_membership_id');
    }

    public function renewals(): HasMany
    {
        return $this->hasMany(self::class, 'renewed_from_membership_id');
    }

    public function histories(): HasMany
    {
        return $this->hasMany(MembershipHistory::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function scopeEffectiveAt(Builder $query, ?string $date = null): Builder
    {
        $date ??= now()->toDateString();

        return $query
            ->where('status', 'active')
            ->whereHas(
                'transaction',
                fn (Builder $transaction) => $transaction->where('payment_status', 'PAID'),
            )
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date);
    }
}
