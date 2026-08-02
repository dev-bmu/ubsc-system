<?php

namespace Tests\Feature;

use App\Models\MembershipPlan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MembershipPlanPricingTest extends TestCase
{
    use RefreshDatabase;

    public function test_discount_percentage_is_derived_from_normal_and_membership_prices(): void
    {
        $plan = MembershipPlan::create([
            'name' => 'Gym Monthly',
            'price' => 150000,
            'compare_at_price' => 187500,
            'duration_months' => 1,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $this->assertSame(20, $plan->discountPercentage());
    }

    public function test_discount_percentage_is_absent_without_a_higher_normal_price(): void
    {
        $plan = MembershipPlan::create([
            'name' => 'Gym Monthly',
            'price' => 150000,
            'compare_at_price' => null,
            'duration_months' => 1,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $this->assertNull($plan->discountPercentage());

        $plan->compare_at_price = 150000;

        $this->assertNull($plan->discountPercentage());
    }
}
