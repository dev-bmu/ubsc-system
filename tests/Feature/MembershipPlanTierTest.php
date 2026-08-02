<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Database\Seeders\MembershipPlanSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class MembershipPlanTierTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_membership_plans_are_real_database_records_with_final_content_and_order(): void
    {
        Storage::fake('public');

        $this->seed(MembershipPlanSeeder::class);

        $plans = MembershipPlan::query()
            ->whereNotNull('bootstrap_key')
            ->orderBy('sort_order')
            ->get();

        $this->assertCount(4, $plans);
        $this->assertSame(
            ['hemat', 'favorit', 'performa', 'eksklusif'],
            $plans->pluck('tier')->all(),
        );
        $this->assertSame(
            ['Hemat', 'Favorit', 'Performa', 'Eksklusif'],
            $plans->pluck('public_badge')->all(),
        );
        $this->assertSame([1, 2, 3, 4], $plans->pluck('sort_order')->all());
        $this->assertSame([false, true, false, false], $plans->pluck('is_primary')->all());

        foreach ($plans as $plan) {
            $this->assertSame(MembershipPlanSeeder::BASE_NAME, $plan->name);
            $this->assertSame(MembershipPlanSeeder::BASE_DESCRIPTION, $plan->description);
            $this->assertSame('Hemat 20%', $plan->savings_label);
            $this->assertSame('Mulai Membership', $plan->cta_label);
            $this->assertNull($plan->card_image_url);
            $this->assertSame(150000, (int) $plan->price);
            $this->assertSame(187500, $plan->compare_at_price);
            $this->assertSame(1, (int) $plan->duration_months);
            $this->assertSame(MembershipPlanSeeder::FEATURES, $plan->features);
            $this->assertTrue($plan->is_active);
            $this->assertCount(1, $plan->getMedia('card_image'));
            $this->assertSame('image/avif', $plan->getFirstMedia('card_image')?->mime_type);
            $this->assertNotSame('', $plan->cardImageUrl());
        }
    }

    public function test_default_membership_seeder_is_idempotent_for_records_and_media(): void
    {
        Storage::fake('public');

        $this->seed(MembershipPlanSeeder::class);
        $this->seed(MembershipPlanSeeder::class);

        $plans = MembershipPlan::query()
            ->whereNotNull('bootstrap_key')
            ->get();

        $this->assertCount(4, $plans);
        $this->assertSame(4, $plans->sum(
            fn (MembershipPlan $plan): int => $plan->getMedia('card_image')->count()
        ));
    }

    public function test_default_membership_seeder_preserves_existing_admin_plan_and_primary_choice(): void
    {
        Storage::fake('public');
        $userPlan = MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Tahunan Buatan Admin',
            'description' => 'Konten khusus yang tidak boleh ditimpa seeder.',
            'tier' => 'favorit',
            'public_badge' => 'Pilihan Kampus',
            'price' => 999000,
            'compare_at_price' => 1200000,
            'duration_months' => 12,
            'features' => ['Benefit khusus admin'],
            'is_primary' => true,
            'sort_order' => 77,
        ]));

        $this->seed(MembershipPlanSeeder::class);
        $this->seed(MembershipPlanSeeder::class);

        $userPlan->refresh();
        $this->assertSame('Paket Tahunan Buatan Admin', $userPlan->name);
        $this->assertSame('Konten khusus yang tidak boleh ditimpa seeder.', $userPlan->description);
        $this->assertSame(999000, (int) $userPlan->price);
        $this->assertSame(['Benefit khusus admin'], $userPlan->features);
        $this->assertTrue($userPlan->is_primary);
        $this->assertNull($userPlan->bootstrap_key);
        $this->assertSame(5, MembershipPlan::query()->count());
        $this->assertFalse(
            MembershipPlan::query()
                ->where('bootstrap_key', 'ubsc-membership-favorit-v1')
                ->firstOrFail()
                ->is_primary,
        );
    }

    public function test_seeder_adopts_matching_legacy_fallback_records_without_duplicating_them(): void
    {
        Storage::fake('public');
        $legacyIds = [];

        foreach (MembershipPlanSeeder::PLANS as $definition) {
            $legacyIds[] = MembershipPlan::create($this->planAttributes([
                'name' => MembershipPlanSeeder::BASE_NAME,
                'description' => MembershipPlanSeeder::BASE_DESCRIPTION,
                'tier' => $definition['tier'],
                'public_badge' => $definition['label'],
                'features' => MembershipPlanSeeder::FEATURES,
                'card_image_url' => 'https://legacy.example.test/membership.jpg',
                'is_primary' => false,
                'sort_order' => $definition['sort_order'],
            ]))->id;
        }

        $this->seed(MembershipPlanSeeder::class);

        $plans = MembershipPlan::query()->orderBy('sort_order')->get();
        $this->assertCount(4, $plans);
        $this->assertSame($legacyIds, $plans->pluck('id')->all());
        $this->assertSame(4, $plans->whereNotNull('bootstrap_key')->count());
        $this->assertSame([false, true, false, false], $plans->pluck('is_primary')->all());

        foreach ($plans as $plan) {
            $this->assertCount(1, $plan->getMedia('card_image'));
            $this->assertNull($plan->card_image_url);
        }
    }

    public function test_seeded_membership_records_are_visible_in_admin_home_and_pricing_payloads(): void
    {
        Storage::fake('public');
        $this->seed(MembershipPlanSeeder::class);

        $firstPlan = MembershipPlan::query()
            ->where('bootstrap_key', 'ubsc-membership-hemat-v1')
            ->firstOrFail();

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('HomePage')
                ->has('membershipPlans', 4)
                ->where('membershipPlans.0.id', $firstPlan->id)
                ->where('membershipPlans.0.tier', 'hemat'));

        $this->get(route('pricing'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('PricingPage')
                ->has('membershipPlans', 4)
                ->where('membershipPlans.0.id', $firstPlan->id)
                ->where('membershipPlans.0.tier', 'hemat'));

        $this->actingAs($this->memberAdmin())
            ->get(route('admin.memberships.plans.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/MembershipPlans/Index')
                ->has('plans', 4)
                ->where('plans.0.id', $firstPlan->id)
                ->where('plans.0.tier', 'hemat'));
    }

    /**
     * Imports and older application code can omit the tier. They must land
     * on the entry tier instead of creating an invalid/null visual state.
     */
    public function test_plan_without_an_explicit_tier_defaults_to_hemat(): void
    {
        $plan = MembershipPlan::create($this->planAttributes([
            'name' => 'Legacy Monthly Plan',
        ]));

        $this->assertSame('hemat', $plan->fresh()->tier);
        $this->assertDatabaseHas('membership_plans', [
            'id' => $plan->id,
            'tier' => 'hemat',
        ]);
    }

    public function test_tier_migration_backfills_legacy_plans_from_their_existing_identity(): void
    {
        $migration = require database_path(
            'migrations/2026_07_28_000001_add_tier_to_membership_plans_table.php'
        );

        $migration->down();

        $now = now();
        DB::table('membership_plans')->insert([
            [
                'name' => 'Legacy Primary',
                'public_badge' => null,
                'price' => 150000,
                'duration_months' => 1,
                'is_active' => true,
                'is_primary' => true,
                'sort_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Legacy Performa',
                'public_badge' => '  PERFORMA ',
                'price' => 300000,
                'duration_months' => 3,
                'is_active' => true,
                'is_primary' => false,
                'sort_order' => 2,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Legacy Without Tier Identity',
                'public_badge' => 'VIP',
                'price' => 500000,
                'duration_months' => 6,
                'is_active' => true,
                'is_primary' => false,
                'sort_order' => 3,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);

        $migration->up();

        $this->assertDatabaseHas('membership_plans', [
            'name' => 'Legacy Primary',
            'tier' => 'favorit',
        ]);
        $this->assertDatabaseHas('membership_plans', [
            'name' => 'Legacy Performa',
            'tier' => 'performa',
        ]);
        $this->assertDatabaseHas('membership_plans', [
            'name' => 'Legacy Without Tier Identity',
            'tier' => 'hemat',
        ]);
    }

    public function test_admin_can_store_every_supported_membership_tier(): void
    {
        Storage::fake('public');
        $admin = $this->memberAdmin();
        $tiers = ['hemat', 'favorit', 'performa', 'eksklusif'];

        foreach ($tiers as $index => $tier) {
            $response = $this->actingAs($admin)->post(
                route('admin.memberships.plans.store'),
                $this->planAttributes([
                    'name' => 'Paket '.ucfirst($tier),
                    'tier' => $tier,
                    'price' => 100000 + ($index * 50000),
                    'compare_at_price' => 150000 + ($index * 50000),
                    'sort_order' => $index + 1,
                    'card_image' => UploadedFile::fake()->image(
                        "membership-{$tier}.jpg",
                        1200,
                        400,
                    ),
                ])
            );

            $response
                ->assertRedirect(route('admin.memberships.plans.index'))
                ->assertSessionHasNoErrors();

            $this->assertDatabaseHas('membership_plans', [
                'name' => 'Paket '.ucfirst($tier),
                'tier' => $tier,
            ]);
        }
    }

    public function test_admin_cannot_store_an_unknown_membership_tier(): void
    {
        $admin = $this->memberAdmin();

        $this->actingAs($admin)
            ->from(route('admin.memberships.plans.index'))
            ->post(route('admin.memberships.plans.store'), $this->planAttributes([
                'name' => 'Paket Tidak Valid',
                'tier' => 'vip',
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasErrors('tier');

        $this->assertDatabaseMissing('membership_plans', [
            'name' => 'Paket Tidak Valid',
        ]);
    }

    public function test_admin_can_update_a_membership_plan_tier(): void
    {
        $admin = $this->memberAdmin();
        $plan = MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Gym',
            'tier' => 'favorit',
        ]));

        $this->actingAs($admin)
            ->patch(route('admin.memberships.plans.update', $plan), $this->planAttributes([
                'name' => $plan->name,
                'tier' => 'performa',
            ]))
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('membership_plans', [
            'id' => $plan->id,
            'tier' => 'performa',
        ]);
    }

    public function test_admin_cannot_update_a_membership_plan_to_an_unknown_tier(): void
    {
        $admin = $this->memberAdmin();
        $plan = MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Gym',
            'tier' => 'favorit',
        ]));

        $this->actingAs($admin)
            ->from(route('admin.memberships.plans.index'))
            ->patch(route('admin.memberships.plans.update', $plan), $this->planAttributes([
                'name' => $plan->name,
                'tier' => 'vip',
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasErrors('tier');

        $this->assertSame('favorit', $plan->fresh()->tier);
    }

    public function test_home_page_exposes_the_membership_tier(): void
    {
        MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Eksklusif',
            'tier' => 'eksklusif',
            'is_primary' => true,
        ]));

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('HomePage')
                ->has('membershipPlans', 1)
                ->where('membershipPlans.0.tier', 'eksklusif'));
    }

    public function test_pricing_page_exposes_the_membership_tier(): void
    {
        MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Performa',
            'tier' => 'performa',
            'is_primary' => true,
        ]));

        $this->get(route('pricing'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('PricingPage')
                ->has('membershipPlans', 1)
                ->where('membershipPlans.0.tier', 'performa'));
    }

    public function test_plan_with_any_membership_history_is_deactivated_instead_of_deleted(): void
    {
        $plan = MembershipPlan::create($this->planAttributes());
        $member = User::factory()->create();
        Membership::create([
            'user_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'customer_name' => $member->name,
            'start_date' => today(),
            'end_date' => today()->addMonth(),
            'status' => 'pending_payment',
            'created_via' => 'public',
        ]);

        $this->actingAs($this->memberAdmin())
            ->from(route('admin.memberships.plans.index'))
            ->delete(route('admin.memberships.plans.destroy', $plan))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasErrors('plan');

        $this->assertDatabaseHas('membership_plans', ['id' => $plan->id]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function planAttributes(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Paket Bulanan',
            'description' => 'Akses gym dengan jadwal fleksibel.',
            'public_badge' => 'Favorit',
            'savings_label' => 'Hemat 20%',
            'cta_label' => 'Mulai Membership',
            'price' => 150000,
            'compare_at_price' => 187500,
            'duration_months' => 1,
            'features' => ['Akses Gym 24 Jam', 'Jadwal Fleksibel'],
            'is_active' => true,
            'is_primary' => false,
            'sort_order' => 1,
        ], $overrides);
    }

    private function memberAdmin(): User
    {
        Permission::firstOrCreate([
            'name' => 'manage-members',
            'guard_name' => 'web',
        ]);

        $role = Role::firstOrCreate([
            'name' => 'Manager',
            'guard_name' => 'web',
        ]);
        $role->syncPermissions(['manage-members']);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
