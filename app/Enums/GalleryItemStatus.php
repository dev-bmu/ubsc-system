<?php

namespace App\Enums;

enum GalleryItemStatus: string
{
    case Draft = 'draft';
    case Processing = 'processing';
    case ReadyForReview = 'ready_for_review';
    case Scheduled = 'scheduled';
    case Published = 'published';
    case Unpublished = 'unpublished';
    case Failed = 'failed';

    /**
     * @return array<int, self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Draft => [self::Processing, self::ReadyForReview],
            self::Processing => [self::Draft, self::ReadyForReview, self::Failed],
            self::ReadyForReview => [self::Draft, self::Scheduled, self::Published],
            self::Scheduled => [self::ReadyForReview, self::Published],
            self::Published => [self::Unpublished],
            self::Unpublished => [self::ReadyForReview],
            self::Failed => [self::Processing, self::Draft],
        };
    }

    public function canTransitionTo(self $status): bool
    {
        return in_array($status, $this->allowedTransitions(), true);
    }
}
