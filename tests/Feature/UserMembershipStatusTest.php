<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use App\Services\ServiceLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class UserMembershipStatusTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_end_date_is_inclusive_then_membership_expires_once_at_next_midnight(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->membership(
            $user,
            $plan,
            '2026-07-01',
            '2026-07-26',
        );

        Carbon::setTestNow(Carbon::parse(
            '2026-07-26 23:59:59',
            config('app.timezone'),
        ));

        $activeResponse = $this->actingAs($user)
            ->getJson(route('user.membership'))
            ->assertOk()
            ->assertJsonPath('current.id', $membership->id)
            ->assertJsonPath('current.status', 'active')
            ->assertJsonPath(
                'current.image_url',
                '/storage/memberships/gym-monthly.jpg',
            )
            ->assertJsonPath('current.days_remaining', 1);
        $this->assertStringContainsString(
            'no-store',
            (string) $activeResponse->headers->get('Cache-Control'),
        );
        $this->assertStringContainsString(
            'private',
            (string) $activeResponse->headers->get('Cache-Control'),
        );

        Carbon::setTestNow(Carbon::parse(
            '2026-07-27 00:00:00',
            config('app.timezone'),
        ));

        $this->actingAs($user)
            ->getJson(route('user.membership'))
            ->assertOk()
            ->assertJsonPath('current', null)
            ->assertJsonPath('latest.id', $membership->id)
            ->assertJsonPath('latest.status', 'expired');

        $this->actingAs($user)
            ->getJson(route('user.membership'))
            ->assertOk()
            ->assertJsonPath('latest.status', 'expired');

        $this->assertDatabaseHas('memberships', [
            'id' => $membership->id,
            'status' => 'expired',
        ]);
        $this->assertDatabaseCount('membership_histories', 1);
        $this->assertDatabaseHas('membership_histories', [
            'membership_id' => $membership->id,
            'action' => 'auto_expired',
            'actor_type' => 'system',
        ]);
    }

    public function test_current_and_future_renewal_are_returned_separately(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-07-26 12:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $plan = $this->plan();
        $current = $this->membership(
            $user,
            $plan,
            '2026-07-01',
            '2026-07-31',
        );
        $scheduled = $this->membership(
            $user,
            $plan,
            '2026-08-01',
            '2026-08-31',
            $current,
        );

        $this->actingAs($user)
            ->getJson(route('user.membership'))
            ->assertOk()
            ->assertJsonPath('current.id', $current->id)
            ->assertJsonPath('current.status', 'active')
            ->assertJsonPath('scheduled.id', $scheduled->id)
            ->assertJsonPath('scheduled.status', 'scheduled');
    }

    public function test_membership_status_fails_closed_for_missing_or_split_payment_state(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-07-26 12:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = Membership::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-07-01',
            'end_date' => '2026-08-01',
            'status' => 'active',
            'created_via' => 'test',
        ]);
        $lifecycle = app(ServiceLifecycleService::class);

        $this->assertSame('awaiting_payment', $lifecycle->membershipStatus($membership));

        $membership->transaction()->create([
            'user_id' => $user->id,
            'amount' => $plan->price,
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);
        $membership->update(['status' => 'pending_payment']);

        $this->assertSame(
            'awaiting_payment',
            $lifecycle->membershipStatus($membership->fresh()),
        );
    }

    public function test_membership_endpoint_does_not_depend_on_transaction_history_page_size(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-07-26 12:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->membership(
            $user,
            $plan,
            '2026-07-01',
            '2026-08-01',
        );

        foreach (range(1, 30) as $index) {
            $user->bookings()->create([
                'customer_name' => $user->name,
                'facility_id' => $this->dummyFacilityId(),
                'booking_date' => now()->addDays($index)->toDateString(),
                'start_time' => '08:00',
                'end_time' => '09:00',
                'pax' => 1,
                'subtotal_price' => 1000,
                'status' => 'confirmed',
            ])->transaction()->create([
                'user_id' => $user->id,
                'amount' => 1000,
                'payment_status' => 'PAID',
                'paid_at' => now(),
            ]);
        }

        $this->actingAs($user)
            ->getJson(route('user.membership'))
            ->assertOk()
            ->assertJsonPath('current.id', $membership->id)
            ->assertJsonPath('current.status', 'active');
    }

    private function plan(): MembershipPlan
    {
        return MembershipPlan::create([
            'name' => 'Gym Monthly',
            'price' => 150000,
            'duration_months' => 1,
            'is_active' => true,
            'sort_order' => 1,
        ]);
    }

    private function membership(
        User $user,
        MembershipPlan $plan,
        string $startDate,
        string $endDate,
        ?Membership $renewedFrom = null,
    ): Membership {
        $membership = Membership::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'renewed_from_membership_id' => $renewedFrom?->id,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'status' => 'active',
            'created_via' => 'test',
        ]);

        $membership->transaction()->create([
            'user_id' => $user->id,
            'amount' => $plan->price,
            'payment_status' => 'PAID',
            'paid_at' => now(),
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'membership',
                'plan_name' => $plan->name,
                'plan_image_url' => '/storage/memberships/gym-monthly.jpg',
                'start_date' => $startDate,
                'end_date' => $endDate,
            ],
        ]);

        return $membership;
    }

    private function dummyFacilityId(): int
    {
        static $facilityId;

        if ($facilityId) {
            return $facilityId;
        }

        $categoryId = \App\Models\FacilityCategory::create([
            'name' => 'Fasilitas',
            'slug' => 'fasilitas',
        ])->id;

        $facilityId = \App\Models\Facility::create([
            'facility_category_id' => $categoryId,
            'name' => 'Lapangan',
            'slug' => 'lapangan',
            'capacity' => 1,
            'is_active' => true,
        ])->id;

        return $facilityId;
    }
}
