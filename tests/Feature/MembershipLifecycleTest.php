<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use App\Services\MembershipLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class MembershipLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_user_cannot_have_overlapping_active_membership(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $service = app(MembershipLifecycleService::class);

        $service->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-01-01',
            'source' => 'user',
            'actor' => $user,
        ]);

        $this->expectException(ValidationException::class);

        $service->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-01-15',
            'source' => 'user',
            'actor' => $user,
        ]);
    }

    public function test_renewal_starts_after_previous_end_date_and_writes_history(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-01-15 12:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $admin = User::factory()->create();
        $plan = $this->plan();
        $service = app(MembershipLifecycleService::class);

        $source = $service->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-01-01',
            'source' => 'user',
            'actor' => $user,
        ]);

        $renewal = $service->renew($source, [
            'membership_plan_id' => $plan->id,
            'source' => 'admin',
            'actor' => $admin,
        ]);

        $this->assertSame($source->id, $renewal->renewed_from_membership_id);
        $this->assertSame('2026-02-02', $renewal->start_date->toDateString());
        $this->assertSame('2026-03-02', $renewal->end_date->toDateString());

        $this->assertDatabaseHas('membership_histories', [
            'membership_id' => $renewal->id,
            'user_id' => $user->id,
            'membership_plan_id' => $plan->id,
            'renewed_from_membership_id' => $source->id,
            'actor_id' => $admin->id,
            'actor_type' => 'admin',
            'action' => 'renewed',
            'amount' => 150000,
            'payment_status' => 'PAID',
        ]);
    }

    public function test_lapsed_renewal_starts_today_instead_of_creating_an_expired_period(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-08-02 12:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $plan = $this->plan();
        $service = app(MembershipLifecycleService::class);

        $source = $service->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-01-01',
            'source' => 'user',
            'actor' => $user,
        ]);

        $renewal = $service->renew($source, [
            'membership_plan_id' => $plan->id,
            'source' => 'user',
            'actor' => $user,
        ]);

        $this->assertSame($source->id, $renewal->renewed_from_membership_id);
        $this->assertSame('2026-08-02', $renewal->start_date->toDateString());
        $this->assertSame('2026-09-02', $renewal->end_date->toDateString());
    }

    public function test_repeated_renewal_of_an_old_record_appends_to_latest_paid_tail(): void
    {
        Carbon::setTestNow(Carbon::parse(
            '2026-01-15 12:00:00',
            config('app.timezone'),
        ));

        $user = User::factory()->create();
        $plan = $this->plan();
        $service = app(MembershipLifecycleService::class);

        $source = $service->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-01-01',
            'source' => 'user',
            'actor' => $user,
        ]);
        $firstRenewal = $service->renew($source, [
            'membership_plan_id' => $plan->id,
            'source' => 'user',
            'actor' => $user,
        ]);

        $secondRenewal = $service->renew($source, [
            'membership_plan_id' => $plan->id,
            'source' => 'user',
            'actor' => $user,
        ]);

        $this->assertSame($firstRenewal->id, $secondRenewal->renewed_from_membership_id);
        $this->assertSame('2026-03-03', $secondRenewal->start_date->toDateString());
        $this->assertSame('2026-04-03', $secondRenewal->end_date->toDateString());
        $this->assertDatabaseCount('memberships', 3);
        $this->assertDatabaseCount('transactions', 3);
    }

    public function test_unpaid_or_incomplete_membership_cannot_be_renewed(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $service = app(MembershipLifecycleService::class);
        $membership = Membership::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-08-02',
            'end_date' => '2026-09-02',
            'status' => 'active',
            'created_via' => 'test',
        ]);

        $this->expectException(ValidationException::class);

        $service->renew($membership, [
            'membership_plan_id' => $plan->id,
            'source' => 'user',
            'actor' => $user,
        ]);
    }

    public function test_transaction_exposes_stable_receipt_number(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $service = app(MembershipLifecycleService::class);

        $membership = $service->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-01-01',
            'source' => 'user',
            'actor' => $user,
        ]);

        $this->assertSame(
            'UBSC-'.str_pad((string) $membership->transaction->id, 6, '0', STR_PAD_LEFT),
            $membership->transaction->receipt_number,
        );
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
}
