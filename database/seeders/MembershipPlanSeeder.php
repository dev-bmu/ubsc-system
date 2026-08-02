<?php

namespace Database\Seeders;

use App\Models\MembershipPlan;
use Illuminate\Database\Seeder;
use RuntimeException;

class MembershipPlanSeeder extends Seeder
{
    public const BASE_NAME = 'Latihan Konsisten & Fleksibel';

    public const BASE_DESCRIPTION = 'Membership bulanan untuk akses latihan fleksibel dengan fasilitas modern UB Sport Center.';

    public const FEATURES = [
        'Akses Gym 24 Jam',
        'Fasilitas Lengkap',
        'Jadwal Fleksibel',
        '1 Lokasi Aktif',
    ];

    public const IMAGE = 'assets/images/poster-gym-konten-program-ub-sport-center.avif';

    /**
     * @var array<int, array{key: string, tier: string, label: string, sort_order: int}>
     */
    public const PLANS = [
        [
            'key' => 'ubsc-membership-hemat-v1',
            'tier' => MembershipPlan::TIER_HEMAT,
            'label' => 'Hemat',
            'sort_order' => 1,
        ],
        [
            'key' => 'ubsc-membership-favorit-v1',
            'tier' => MembershipPlan::TIER_FAVORIT,
            'label' => 'Favorit',
            'sort_order' => 2,
        ],
        [
            'key' => 'ubsc-membership-performa-v1',
            'tier' => MembershipPlan::TIER_PERFORMA,
            'label' => 'Performa',
            'sort_order' => 3,
        ],
        [
            'key' => 'ubsc-membership-eksklusif-v1',
            'tier' => MembershipPlan::TIER_EKSKLUSIF,
            'label' => 'Eksklusif',
            'sort_order' => 4,
        ],
    ];

    public function run(): void
    {
        $imagePath = public_path(self::IMAGE);

        if (! is_file($imagePath)) {
            throw new RuntimeException("Default membership image was not found at [{$imagePath}].");
        }

        $hasExistingPrimary = MembershipPlan::query()
            ->where('is_active', true)
            ->where('is_primary', true)
            ->exists();

        foreach (self::PLANS as $definition) {
            $plan = MembershipPlan::query()
                ->where('bootstrap_key', $definition['key'])
                ->first();

            if (! $plan) {
                $plan = $this->legacyMatch($definition);
            }

            if ($plan) {
                if ($plan->bootstrap_key === null) {
                    $plan->forceFill(['bootstrap_key' => $definition['key']])->save();
                }
            } else {
                $plan = new MembershipPlan;
                $plan->forceFill([
                    ...$this->baseAttributes(),
                    'bootstrap_key' => $definition['key'],
                    'tier' => $definition['tier'],
                    'public_badge' => $definition['label'],
                    'is_primary' => $definition['tier'] === MembershipPlan::TIER_FAVORIT
                        && ! $hasExistingPrimary,
                    'sort_order' => $definition['sort_order'],
                ])->save();
            }

            if (! $plan->hasMedia('card_image')) {
                $plan
                    ->addMedia($imagePath)
                    ->preservingOriginal()
                    ->toMediaCollection('card_image');

                if ($plan->card_image_url !== null) {
                    $plan->forceFill(['card_image_url' => null])->save();
                }
            }
        }

        if (! MembershipPlan::query()->where('is_active', true)->where('is_primary', true)->exists()) {
            MembershipPlan::query()
                ->where('bootstrap_key', 'ubsc-membership-favorit-v1')
                ->where('is_active', true)
                ->update(['is_primary' => true]);
        }
    }

    /**
     * Adopt only a row that already has all public fallback content. This
     * lets existing installations upgrade without duplicating those exact
     * plans, while unrelated admin-created packages remain untouched.
     *
     * @param  array{key: string, tier: string, label: string, sort_order: int}  $definition
     */
    private function legacyMatch(array $definition): ?MembershipPlan
    {
        return MembershipPlan::query()
            ->whereNull('bootstrap_key')
            ->where('name', self::BASE_NAME)
            ->where('description', self::BASE_DESCRIPTION)
            ->where('tier', $definition['tier'])
            ->where('public_badge', $definition['label'])
            ->where('savings_label', 'Hemat 20%')
            ->where('cta_label', 'Mulai Membership')
            ->where('price', 150000)
            ->where('compare_at_price', 187500)
            ->where('duration_months', 1)
            ->where('is_active', true)
            ->where('sort_order', $definition['sort_order'])
            ->orderBy('id')
            ->get()
            ->first(fn (MembershipPlan $plan): bool => $plan->features === self::FEATURES);
    }

    /**
     * @return array<string, mixed>
     */
    private function baseAttributes(): array
    {
        return [
            'name' => self::BASE_NAME,
            'description' => self::BASE_DESCRIPTION,
            'savings_label' => 'Hemat 20%',
            'cta_label' => 'Mulai Membership',
            'card_image_url' => null,
            'price' => 150000,
            'compare_at_price' => 187500,
            'duration_months' => 1,
            'features' => self::FEATURES,
            'is_active' => true,
        ];
    }
}
