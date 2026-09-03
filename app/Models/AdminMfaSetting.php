<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminMfaSetting extends Model
{
    protected $fillable = [
        'totp_secret',
        'totp_confirmed_at',
        'totp_last_used_step',
        'recovery_codes',
        'recovery_codes_generated_at',
        'recovery_codes_acknowledged_at',
        'recovery_codes_version',
        'enabled_at',
        'last_verified_at',
        'last_verified_method',
        'version',
    ];

    protected $hidden = [
        'totp_secret',
        'recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'totp_secret' => 'encrypted',
            'totp_confirmed_at' => 'datetime',
            'totp_last_used_step' => 'integer',
            'recovery_codes' => 'encrypted:array',
            'recovery_codes_generated_at' => 'datetime',
            'recovery_codes_acknowledged_at' => 'datetime',
            'recovery_codes_version' => 'integer',
            'enabled_at' => 'datetime',
            'last_verified_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
