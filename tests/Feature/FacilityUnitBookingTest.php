<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\FacilityPrice;
use App\Models\User;
use App\Http\Resources\Public\FacilityResource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class FacilityUnitBookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_facility_unit_for_parent_facility(): void
    {
        $staff = $this->staffUser(['manage-facilities']);
        $facility = $this->facility();

        $this->actingAs($staff)
            ->post(route('admin.facilities.units.store', $facility), [
                'name' => 'Lapangan Tenis 1',
                'is_active' => true,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('facility_units', [
            'facility_id' => $facility->id,
            'name' => 'Lapangan Tenis 1',
            'is_active' => true,
        ]);
    }

    public function test_admin_can_save_custom_schedule_and_prices_for_unit(): void
    {
        $staff = $this->staffUser(['manage-facilities']);
        [$facility, $unit] = $this->facilityWithUnit();

        $this->actingAs($staff)
            ->put(route('admin.facility-units.update', $unit), [
                'name' => 'Lapangan Tenis Premium',
                'is_active' => true,
                'use_custom_schedule' => true,
                'active_slots' => [
                    'Monday' => ['10:00', '12:00'],
                    'Tuesday' => [],
                ],
                'use_custom_pricing' => true,
                'prices' => [
                    [
                        'user_category' => 'umum',
                        'label' => 'Reguler',
                        'price' => 175000,
                        'duration_minutes' => 90,
                        'schedule_type' => 'regular',
                        'sort_order' => 0,
                    ],
                ],
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('facility_units', [
            'id' => $unit->id,
            'facility_id' => $facility->id,
            'name' => 'Lapangan Tenis Premium',
            'use_custom_schedule' => true,
            'use_custom_pricing' => true,
        ]);

        $this->assertDatabaseHas('facility_unit_prices', [
            'facility_unit_id' => $unit->id,
            'user_category' => 'umum',
            'label' => 'Reguler',
            'price' => 175000,
            'duration_minutes' => 90,
        ]);
    }

    public function test_public_booking_slots_require_unit_when_facility_has_active_units(): void
    {
        [$facility, $unit] = $this->facilityWithUnit();
        $date = $this->openBookingDate();

        $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'date' => $date,
        ]))
            ->assertOk()
            ->assertJsonPath('requires_unit', true)
            ->assertJsonPath('slots', []);

        $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unit->id,
            'date' => $date,
        ]))
            ->assertOk()
            ->assertJsonPath('closed', false)
            ->assertJsonPath('requires_unit', false)
            ->assertJsonPath('slots.0.facility_unit_id', $unit->id);
    }

    public function test_unit_booking_collision_does_not_block_sibling_unit(): void
    {
        [$facility, $unitOne] = $this->facilityWithUnit('Lapangan Tenis 1');
        $unitTwo = $facility->units()->create([
            'name' => 'Lapangan Tenis 2',
            'is_active' => true,
        ]);
        $date = $this->openBookingDate();

        Booking::create([
            'user_id' => null,
            'customer_name' => 'Guest',
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitOne->id,
            'booking_date' => $date,
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);

        $unitOneSlots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitOne->id,
            'date' => $date,
        ]))->assertOk()->json('slots');

        $unitTwoSlots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unitTwo->id,
            'date' => $date,
        ]))->assertOk()->json('slots');

        $this->assertSame('booked', $this->slotStatus($unitOneSlots, '08:00 - 09:00'));
        $this->assertSame('available', $this->slotStatus($unitTwoSlots, '08:00 - 09:00'));
    }

    public function test_public_slots_use_custom_unit_schedule_and_price_when_enabled(): void
    {
        [$facility, $unit] = $this->facilityWithUnit();
        $date = $this->openBookingDateFor(Carbon::now()->next('Monday'));

        $unit->update([
            'use_custom_schedule' => true,
            'active_slots' => [
                'Monday' => ['10:00'],
                'Tuesday' => [],
                'Wednesday' => [],
                'Thursday' => [],
                'Friday' => [],
                'Saturday' => [],
                'Sunday' => [],
            ],
            'use_custom_pricing' => true,
        ]);

        $unit->prices()->create([
            'user_category' => 'umum',
            'label' => 'Reguler',
            'price' => 175000,
            'duration_minutes' => 90,
            'schedule_type' => 'regular',
            'sort_order' => 0,
        ]);

        $slots = $this->getJson(route('booking.slots', [
            'facility_id' => $facility->id,
            'facility_unit_id' => $unit->id,
            'date' => $date,
        ]))
            ->assertOk()
            ->assertJsonPath('requires_unit', false)
            ->json('slots');

        $this->assertCount(1, $slots);
        $this->assertSame('10:00 - 11:30', $slots[0]['label']);
        $this->assertSame('Rp 175.000', $slots[0]['price']);
    }

    public function test_facility_resource_only_exposes_units_when_relation_is_loaded(): void
    {
        [$facility] = $this->facilityWithUnit();

        $publicListingPayload = (new FacilityResource(
            Facility::with(['category', 'prices'])->findOrFail($facility->id)
        ))->resolve();

        $bookingPayload = (new FacilityResource(
            Facility::with(['category', 'prices', 'units.media'])->findOrFail($facility->id)
        ))->resolve();

        $this->assertArrayNotHasKey('units', $publicListingPayload);
        $this->assertArrayHasKey('units', $bookingPayload);
        $this->assertSame('Lapangan Tenis 1', $bookingPayload['units'][0]['name']);
    }

    public function test_unit_with_booking_history_cannot_be_deleted(): void
    {
        $staff = $this->staffUser(['manage-facilities']);
        [$facility, $unit] = $this->facilityWithUnit();
        $date = $this->openBookingDate();

        Booking::create([
            'user_id' => null,
            'customer_name' => 'Guest',
            'facility_id' => $facility->id,
            'facility_unit_id' => $unit->id,
            'booking_date' => $date,
            'start_time' => '08:00',
            'end_time' => '09:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);

        $this->actingAs($staff)
            ->delete(route('admin.facility-units.destroy', $unit))
            ->assertRedirect()
            ->assertSessionHas('error');

        $this->assertDatabaseHas('facility_units', [
            'id' => $unit->id,
            'name' => $unit->name,
        ]);
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

        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Tenis',
            'slug' => 'lapangan-tenis',
            'capacity' => 1,
            'is_active' => true,
        ]);

        FacilityPrice::create([
            'facility_id' => $facility->id,
            'user_category' => 'umum',
            'label' => 'Reguler',
            'price' => 100000,
            'duration_minutes' => 60,
            'schedule_type' => 'regular',
        ]);

        return $facility;
    }

    /**
     * @return array{0: Facility, 1: \App\Models\FacilityUnit}
     */
    private function facilityWithUnit(string $unitName = 'Lapangan Tenis 1'): array
    {
        $facility = $this->facility();

        $unit = $facility->units()->create([
            'name' => $unitName,
            'is_active' => true,
        ]);

        return [$facility, $unit];
    }

    private function openBookingDate(): string
    {
        return $this->openBookingDateFor(Carbon::now()->addDays(3));
    }

    private function openBookingDateFor(Carbon $date): string
    {
        BookingSchedule::create([
            'month' => $date->month,
            'year' => $date->year,
            'is_open' => true,
            'closed_dates' => [],
        ]);

        return $date->toDateString();
    }

    /**
     * @param array<int, array<string, mixed>> $slots
     */
    private function slotStatus(array $slots, string $label): ?string
    {
        foreach ($slots as $slot) {
            if (($slot['label'] ?? null) === $label) {
                return $slot['status'] ?? null;
            }
        }

        return null;
    }
}
