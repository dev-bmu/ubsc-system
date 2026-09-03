<?php

namespace App\Models;

use App\Enums\ReviewStatus;
use App\Support\PublicReviewFeed;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class Review extends Model
{
    protected $fillable = [
        'user_id',
        'reviewer_name',
        'rating',
        'text',
        'is_approved',
        'status',
        'version',
        'submitted_at',
        'approved_at',
        'rejected_at',
        'moderated_at',
        'moderated_by',
        'moderation_feedback',
        'eligibility_source',
        'eligibility_reference_id',
    ];

    protected function casts(): array
    {
        return [
            'rating' => 'float',
            'is_approved' => 'boolean',
            'status' => ReviewStatus::class,
            'version' => 'integer',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'moderated_at' => 'datetime',
            'eligibility_reference_id' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Review $review): void {
            $contentChanged = $review->exists
                && ($review->isDirty('rating') || $review->isDirty('text'));

            if ($contentChanged) {
                $review->status = ReviewStatus::Pending;
                $review->is_approved = false;
                $review->approved_at = null;
                $review->rejected_at = null;
                $review->moderated_at = null;
                $review->moderated_by = null;
                $review->moderation_feedback = null;

                if (! $review->isDirty('version')) {
                    $review->version = max(1, (int) $review->getOriginal('version') + 1);
                }
            }

            if ($review->isDirty('status')) {
                $status = $review->status instanceof ReviewStatus
                    ? $review->status
                    : ReviewStatus::from((string) $review->status);
                $review->is_approved = $status === ReviewStatus::Approved;
            } elseif ($review->isDirty('is_approved')) {
                $review->status = $review->is_approved
                    ? ReviewStatus::Approved
                    : ReviewStatus::Pending;
            }

            $status = $review->status instanceof ReviewStatus
                ? $review->status
                : ReviewStatus::tryFrom((string) $review->status);

            $review->submitted_at ??= now();
            if ($status === ReviewStatus::Pending) {
                $review->is_approved = false;
                $review->approved_at = null;
                $review->rejected_at = null;
                $review->moderated_at = null;
                $review->moderated_by = null;
                $review->moderation_feedback = null;
            } elseif ($status === ReviewStatus::Approved) {
                $review->is_approved = true;
                $review->approved_at ??= now();
                $review->rejected_at = null;
                $review->moderation_feedback = null;
            } elseif ($status === ReviewStatus::Rejected) {
                $review->is_approved = false;
                $review->approved_at = null;
                $review->rejected_at ??= now();
            }
        });

        static::saved(function (Review $review): void {
            if (! $review->wasRecentlyCreated && ! $review->wasChanged([
                'user_id',
                'reviewer_name',
                'rating',
                'text',
                'status',
                'is_approved',
                'approved_at',
            ])) {
                return;
            }

            DB::afterCommit(static function (): void {
                PublicReviewFeed::forgetCache();
            });
        });

        static::deleted(static function (): void {
            DB::afterCommit(static function (): void {
                PublicReviewFeed::forgetCache();
            });
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function moderator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'moderated_by');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', ReviewStatus::Pending->value);
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('status', ReviewStatus::Approved->value);
    }

    public function scopeRejected(Builder $query): Builder
    {
        return $query->where('status', ReviewStatus::Rejected->value);
    }
}
