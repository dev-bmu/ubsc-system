<?php

namespace App\Models;

use App\Notifications\Auth\ResetPasswordNotification;
use App\Notifications\Auth\VerifyEmailNotification;
use App\Support\AuthenticationIdentity;
use App\Support\PublicReturnPath;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Passkeys\Contracts\PasskeyUser;
use Laravel\Passkeys\PasskeyAuthenticatable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements MustVerifyEmail, PasskeyUser
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, HasRoles, Notifiable, PasskeyAuthenticatable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'avatar',
        'phone_number',
        'birth_place',
        'birth_date',
        'identity_category',
        'identity_number',
        'identity_file_path',
        'identity_status',
        'google_id',
    ];

    protected $appends = ['avatar_url'];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'staff_last_seen_at' => 'datetime',
            'birth_date' => 'date',
            'password' => 'hashed',
        ];
    }

    /**
     * Store authentication identities in their canonical form regardless of
     * whether they originate from registration, Google, seeders, or admin UI.
     */
    protected function email(): Attribute
    {
        return Attribute::make(
            set: static fn (mixed $value): string => AuthenticationIdentity::normalizeEmail($value),
        );
    }

    public function sendPasswordResetNotification(
        #[\SensitiveParameter] $token,
    ): void {
        $returnTo = app()->bound('request')
            ? PublicReturnPath::normalize(request()->input('return_to'))
            : null;

        $this->notify(new ResetPasswordNotification($token, $returnTo));
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailNotification);
    }

    public function getAvatarUrlAttribute(): ?string
    {
        if (! $this->avatar) {
            return null;
        }

        return Str::startsWith($this->avatar, ['http://', 'https://', '/'])
            ? $this->avatar
            : asset('storage/'.$this->avatar);
    }

    public function news(): HasMany
    {
        return $this->hasMany(News::class, 'author_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }

    public function paymentAttempts(): HasMany
    {
        return $this->hasMany(PaymentAttempt::class);
    }

    public function adminMfaSetting(): HasOne
    {
        return $this->hasOne(AdminMfaSetting::class);
    }
}
