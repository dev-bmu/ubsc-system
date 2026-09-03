<?php

namespace App\Support;

use App\Models\User;

final class AdminAccess
{
    public const STAFF_ROLES = [
        'Administrator',
        'Manager',
        'Finance',
        'Staff Central',
        'Staff Front Office',
    ];

    public static function allows(?User $user): bool
    {
        return $user !== null && $user->hasAnyRole(self::STAFF_ROLES);
    }
}
