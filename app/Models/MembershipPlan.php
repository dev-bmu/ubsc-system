<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class MembershipPlan extends Model implements HasMedia
{
    use InteractsWithMedia;

    public const TIER_HEMAT = 'hemat';

    public const TIER_FAVORIT = 'favorit';

    public const TIER_PERFORMA = 'performa';

    public const TIER_EKSKLUSIF = 'eksklusif';

    public const TIERS = [
        self::TIER_HEMAT,
        self::TIER_FAVORIT,
        self::TIER_PERFORMA,
        self::TIER_EKSKLUSIF,
    ];

    public const TIER_LABELS = [
        self::TIER_HEMAT => 'Hemat',
        self::TIER_FAVORIT => 'Favorit',
        self::TIER_PERFORMA => 'Performa',
        self::TIER_EKSKLUSIF => 'Eksklusif',
    ];

    public const SUPPORTED_DURATIONS = [1, 3, 6, 12];

    protected $fillable = [
        'name',
        'description',
        'tier',
        'public_badge',
        'savings_label',
        'cta_label',
        'card_image_url',
        'price',
        'compare_at_price',
        'duration_months',
        'features',
        'is_active',
        'is_primary',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'features' => 'array',
            'compare_at_price' => 'integer',
            'is_active' => 'boolean',
            'is_primary' => 'boolean',
        ];
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('card_image')
            ->useDisk('public')
            ->acceptsMimeTypes([
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/avif',
            ])
            ->singleFile();
    }

    public function cardImageUrl(): ?string
    {
        return $this->getFirstMediaUrl('card_image') ?: $this->card_image_url;
    }

    public function tierLabel(): string
    {
        return self::TIER_LABELS[$this->tier] ?? self::TIER_LABELS[self::TIER_HEMAT];
    }

    /**
     * Human-readable contract duration used consistently by the public card,
     * admin package selector, and membership records.
     */
    public function durationLabel(): string
    {
        return self::durationLabelFor((int) $this->duration_months);
    }

    public static function durationLabelFor(int $months): string
    {
        return match ($months) {
            1 => '1 bulan',
            12 => '1 tahun',
            default => $months.' bulan',
        };
    }

    /**
     * Opening copy for the public card. This is derived from duration so an
     * admin can change the billing period without silently rewriting their
     * custom name or description.
     */
    public function durationLead(): string
    {
        return self::durationLeadFor((int) $this->duration_months);
    }

    public static function durationLeadFor(int $months): string
    {
        return match ($months) {
            1 => 'Membership bulanan untuk',
            12 => 'Membership tahunan untuk',
            default => 'Membership '.self::durationLabelFor($months).' untuk',
        };
    }

    public function scopeOrderByTier(Builder $query): Builder
    {
        return $query->orderByRaw(
            'CASE tier WHEN ? THEN 0 WHEN ? THEN 1 WHEN ? THEN 2 WHEN ? THEN 3 ELSE 4 END',
            self::TIERS,
        );
    }

    public function discountPercentage(): ?int
    {
        $price = (int) $this->price;
        $compareAtPrice = (int) ($this->compare_at_price ?? 0);

        if ($price < 0 || $compareAtPrice <= $price) {
            return null;
        }

        return (int) round((($compareAtPrice - $price) / $compareAtPrice) * 100);
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }
}
