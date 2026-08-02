<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class MembershipPlanDurationPresentationTest extends TestCase
{
    use RefreshDatabase;

    public function test_duration_copy_is_derived_without_overwriting_custom_content(): void
    {
        $plan = $this->plan([
            'description' => 'Deskripsi khusus buatan admin yang harus tetap utuh.',
        ]);

        $expected = [
            1 => ['1 bulan', 'Membership bulanan untuk'],
            3 => ['3 bulan', 'Membership 3 bulan untuk'],
            6 => ['6 bulan', 'Membership 6 bulan untuk'],
            12 => ['1 tahun', 'Membership tahunan untuk'],
        ];

        foreach ($expected as $months => [$label, $lead]) {
            $plan->update(['duration_months' => $months]);
            $plan->refresh();

            $this->assertSame($label, $plan->durationLabel());
            $this->assertSame($lead, $plan->durationLead());
            $this->assertSame(
                'Deskripsi khusus buatan admin yang harus tetap utuh.',
                $plan->description,
            );
        }
    }

    public function test_admin_can_change_duration_without_resending_or_erasing_custom_description(): void
    {
        $plan = $this->plan([
            'description' => 'Narasi custom yang dikelola divisi konten.',
        ]);

        $this->actingAs($this->memberAdmin())
            ->patch(route('admin.memberships.plans.update', $plan), [
                'name' => $plan->name,
                'tier' => $plan->tier,
                'price' => $plan->price,
                'duration_months' => 12,
                'features' => $plan->features,
                'is_active' => true,
                'is_primary' => true,
                'sort_order' => 1,
            ])
            ->assertSessionHasNoErrors();

        $plan->refresh();
        $this->assertSame(12, (int) $plan->duration_months);
        $this->assertSame('Membership tahunan untuk', $plan->durationLead());
        $this->assertSame('Narasi custom yang dikelola divisi konten.', $plan->description);
    }

    public function test_public_and_admin_plan_payloads_share_the_same_duration_copy(): void
    {
        $plan = $this->plan([
            'tier' => MembershipPlan::TIER_EKSKLUSIF,
            'duration_months' => 12,
        ]);

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('HomePage')
                ->where('membershipPlans.0.id', $plan->id)
                ->where('membershipPlans.0.duration_label', '1 tahun')
                ->where('membershipPlans.0.duration_lead', 'Membership tahunan untuk'));

        $this->get(route('pricing'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('PricingPage')
                ->where('membershipPlans.0.id', $plan->id)
                ->where('membershipPlans.0.duration_label', '1 tahun')
                ->where('membershipPlans.0.duration_lead', 'Membership tahunan untuk'));

        $this->actingAs($this->memberAdmin())
            ->get(route('admin.memberships.plans.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/MembershipPlans/Index')
                ->where('plans.0.id', $plan->id)
                ->where('plans.0.duration_label', '1 tahun')
                ->where('plans.0.duration_lead', 'Membership tahunan untuk'));
    }

    public function test_admin_membership_payload_identifies_the_real_plan_tier_duration_and_status(): void
    {
        $plan = $this->plan([
            'tier' => MembershipPlan::TIER_PERFORMA,
            'duration_months' => 6,
        ]);
        $member = User::factory()->create();
        $membership = Membership::create([
            'user_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'customer_name' => $member->name,
            'start_date' => today()->subDay(),
            'end_date' => today()->addMonths(6),
            'status' => 'active',
            'created_via' => 'public',
        ]);

        $this->actingAs($this->memberAdmin())
            ->get(route('admin.memberships.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Memberships/Index')
                ->where('memberships.0.id', $membership->id)
                ->where('memberships.0.membership_plan_id', $plan->id)
                ->where('memberships.0.plan_name', $plan->name)
                ->where('memberships.0.plan_tier', MembershipPlan::TIER_PERFORMA)
                ->where('memberships.0.plan_tier_label', 'Performa')
                ->where('memberships.0.plan_duration_months', 6)
                ->where('memberships.0.plan_duration_label', '6 bulan')
                ->where('memberships.0.status', 'active')
                ->where('plans.0.id', $plan->id)
                ->where('plans.0.tier_label', 'Performa')
                ->where('plans.0.duration_label', '6 bulan'));
    }

    public function test_pending_public_membership_reaches_admin_with_unpaid_status_and_plan_identity(): void
    {
        $plan = $this->plan([
            'tier' => MembershipPlan::TIER_FAVORIT,
            'duration_months' => 3,
        ]);
        $member = User::factory()->create();
        $membership = Membership::create([
            'user_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'customer_name' => $member->name,
            'start_date' => today(),
            'end_date' => today()->addMonths(3),
            'status' => 'pending_payment',
            'created_via' => 'public',
            'registration_email' => 'member@example.test',
            'registration_phone' => '081234567890',
            'registration_gender' => 'P',
            'registration_category' => 'umum',
            'registration_expires_at' => now()->addDay(),
        ]);
        $transaction = $membership->transaction()->create([
            'user_id' => $member->id,
            'amount' => $plan->price,
            'payment_status' => 'UNPAID',
        ]);

        $this->actingAs($this->memberAdmin())
            ->get(route('admin.memberships.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Memberships/Index')
                ->where('memberships.0.id', $membership->id)
                ->where('memberships.0.status', 'pending_payment')
                ->where('memberships.0.plan_tier_label', 'Favorit')
                ->where('memberships.0.plan_duration_label', '3 bulan')
                ->where('memberships.0.registration.email', 'member@example.test')
                ->where('memberships.0.registration.phone', '081234567890')
                ->where('memberships.0.registration.gender', 'P')
                ->where('memberships.0.registration.category', 'umum')
                ->where('memberships.0.registration.expires_at', fn ($value) => is_string($value) && $value !== '')
                ->where('memberships.0.transaction.id', $transaction->id)
                ->where('memberships.0.transaction.payment_status', 'UNPAID'));
    }

    /** @param array<string, mixed> $overrides */
    private function plan(array $overrides = []): MembershipPlan
    {
        return MembershipPlan::create(array_replace([
            'name' => 'Latihan Konsisten & Fleksibel',
            'description' => 'Membership fleksibel UB Sport Center.',
            'tier' => MembershipPlan::TIER_FAVORIT,
            'price' => 150000,
            'duration_months' => 1,
            'features' => ['Akses Gym 24 Jam'],
            'is_active' => true,
            'is_primary' => true,
            'sort_order' => 1,
        ], $overrides));
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

        $admin = User::factory()->create();
        $admin->assignRole($role);

        return $admin;
    }
}
