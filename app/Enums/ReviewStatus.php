<?php

namespace App\Enums;

enum ReviewStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Menunggu validasi',
            self::Approved => 'Tayang',
            self::Rejected => 'Perlu diperbaiki',
        };
    }
}
