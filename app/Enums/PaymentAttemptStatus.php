<?php

namespace App\Enums;

enum PaymentAttemptStatus: string
{
    case Draft = 'draft';
    case Creating = 'creating';
    case Pending = 'pending';
    case Paid = 'paid';
    case Failed = 'failed';
    case Expired = 'expired';
    case Cancelled = 'cancelled';
    case Reconciling = 'reconciling';

    public function isTerminal(): bool
    {
        return in_array($this, [
            self::Paid,
            self::Failed,
            self::Expired,
            self::Cancelled,
        ], true);
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, match ($this) {
            self::Draft => [self::Creating],
            self::Creating => [
                self::Pending,
                self::Paid,
                self::Failed,
                self::Reconciling,
            ],
            self::Pending => [
                self::Paid,
                self::Failed,
                self::Expired,
                self::Cancelled,
            ],
            self::Reconciling => [
                self::Pending,
                self::Paid,
                self::Failed,
                self::Expired,
            ],
            self::Paid, self::Failed, self::Expired, self::Cancelled => [],
        }, true);
    }
}
