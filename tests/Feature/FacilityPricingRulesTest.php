<?php

namespace Tests\Feature;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class FacilityPricingRulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_pricing_rules_are_stored_with_schedule_details(): void
    {
        $staff = $this->staffUser(['manage-pricing']);
        $facility = $this->facility();

        $this->actingAs($staff)
            ->post(route('admin.facilities.pricing.sync', $facility), [
                'prices' => [
                    [
                        'user_category' => 'umum',
                        'label' => 'Reguler',
                        'price' => 100000,
                        'duration_minutes' => 60,
                        'schedule_type' => 'regular',
                        'sort_order' => 0,
                    ],
                    [
                        'user_category' => 'umum',
                        'label' => 'Tarif Jumat Pagi',
                        'price' => 75000,
                        'duration_minutes' => 60,
                        'schedule_type' => 'weekly',
                        'applicable_days' => ['Friday'],
                        'starts_at' => '08:00',
                        'ends_at' => '12:00',
                        'notes' => 'Jam sepi',
                        'sort_order' => 10,
                    ],
                ],
            ])
            ->assertRedirect();

        $special = $facility->prices()->where('label', 'Tarif Jumat Pagi')->firstOrFail();

        $this->assertSame('weekly', $special->schedule_type);
        $this->assertSame(['Friday'], $special->applicable_days);
        $this->assertSame('08:00', substr((string) $special->starts_at, 0, 5));
        $this->assertSame('12:00', substr((string) $special->ends_at, 0, 5));
        $this->assertSame('Jam sepi', $special->notes);
    }

    public function test_weekly_pricing_rule_requires_at_least_one_day(): void
    {
        $staff = $this->staffUser(['manage-pricing']);
        $facility = $this->facility();

        $this->actingAs($staff)
            ->from(route('admin.facilities.pricing', $facility))
            ->post(route('admin.facilities.pricing.sync', $facility), [
                'prices' => [[
                    'user_category' => 'umum',
                    'label' => 'Tarif Mingguan',
                    'price' => 75000,
                    'duration_minutes' => 60,
                    'schedule_type' => 'weekly',
                    'applicable_days' => [],
                ]],
            ])
            ->assertRedirect(route('admin.facilities.pricing', $facility))
            ->assertSessionHasErrors('prices.0.applicable_days');
    }

    /**
     * @param array<int, string> $permissions
     */
    private function staffUser(array $permissions): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $role = Role::firstOrCreate(['name' => 'Staff Central', 'guard_name' => 'web']);
        $role->syncPermissions($permissions);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole('Staff Central');

        return $user;
    }

    private function facility(): Facility
    {
        $category = FacilityCategory::create([
            'name' => 'Lapangan',
            'slug' => 'lapangan',
        ]);

        return Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Utama',
            'slug' => 'lapangan-utama',
            'is_active' => true,
        ]);
    }
}
