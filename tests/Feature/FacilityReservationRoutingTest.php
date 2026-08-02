<?php

namespace Tests\Feature;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use App\Support\FacilityReservationLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class FacilityReservationRoutingTest extends TestCase
{
    use RefreshDatabase;

    public function test_website_mode_opens_the_exact_booking_panel_even_without_a_price(): void
    {
        $facility = $this->facility([
            'reservation_method' => 'website',
        ]);

        $destination = FacilityReservationLink::resolve(
            $facility->fresh()->load('prices'),
        );

        $this->assertSame('website', $destination['method']);
        $this->assertSame(
            '/booking?facility=lapangan-basket',
            $destination['href'],
        );
        $this->assertSame('_self', $destination['target']);
        $this->assertTrue(
            Facility::visibleInBookingDirectory()
                ->whereKey($facility)
                ->exists(),
        );
    }

    public function test_whatsapp_mode_builds_a_ready_to_send_message(): void
    {
        $facility = $this->facility([
            'reservation_method' => 'whatsapp',
            'reservation_phone' => '0812 3456 7890',
            'reservation_message' => "Halo,\nSaya ingin reservasi {facility_name} di {location}.",
        ]);

        $destination = FacilityReservationLink::resolve(
            $facility->fresh()->load('prices'),
        );
        parse_str((string) parse_url($destination['href'], PHP_URL_QUERY), $query);

        $this->assertSame('whatsapp', $destination['method']);
        $this->assertSame('_blank', $destination['target']);
        $this->assertFalse($destination['automatic_fallback']);
        $this->assertSame('6281234567890', $query['phone']);
        $this->assertSame(
            "Halo,\nSaya ingin reservasi Lapangan Basket di Dieng.",
            $query['text'],
        );
    }

    public function test_whatsapp_facility_is_not_in_the_booking_directory(): void
    {
        $facility = $this->facility([
            'reservation_method' => 'whatsapp',
        ]);

        $destination = FacilityReservationLink::resolve($facility);

        $this->assertSame('whatsapp', $destination['method']);
        $this->assertFalse(
            Facility::visibleInBookingDirectory()
                ->whereKey($facility)
                ->exists(),
        );
    }

    public function test_external_reservation_uses_the_admin_url_in_a_new_tab(): void
    {
        $facility = $this->facility([
            'reservation_method' => 'external',
            'reservation_url' => 'https://docs.google.com/forms/d/example/viewform',
        ]);

        $destination = FacilityReservationLink::resolve($facility);

        $this->assertSame('external', $destination['method']);
        $this->assertSame(
            'https://docs.google.com/forms/d/example/viewform',
            $destination['href'],
        );
        $this->assertSame('_blank', $destination['target']);
    }

    public function test_admin_can_manage_the_reservation_destination_and_unsafe_urls_are_rejected(): void
    {
        $staff = $this->staffUser();
        $facility = $this->facility();
        $payload = [
            'facility_category_id' => $facility->facility_category_id,
            'name' => $facility->name,
            'slug' => $facility->slug,
            'location' => $facility->location,
            'venue_type' => $facility->venue_type,
            'capacity' => 1,
            'rating' => 5,
            'is_active' => true,
            'sort_order' => 1,
            'reservation_method' => 'external',
        ];

        $this->actingAs($staff)
            ->from(route('admin.facilities.edit', $facility))
            ->put(route('admin.facilities.update', $facility), [
                ...$payload,
                'reservation_url' => 'javascript:alert(1)',
            ])
            ->assertRedirect(route('admin.facilities.edit', $facility))
            ->assertSessionHasErrors('reservation_url');

        $this->assertNotSame(
            'javascript:alert(1)',
            $facility->fresh()->reservation_url,
        );

        $this->actingAs($staff)
            ->put(route('admin.facilities.update', $facility), [
                ...$payload,
                'reservation_url' => 'https://forms.gle/example',
            ])
            ->assertRedirect(route('admin.facilities.index'));

        $facility->refresh();
        $this->assertSame('external', $facility->reservation_method);
        $this->assertSame(
            'https://forms.gle/example',
            $facility->reservation_url,
        );
    }

    private function facility(array $overrides = []): Facility
    {
        $category = FacilityCategory::firstOrCreate(
            ['slug' => 'lapangan-arena'],
            ['name' => 'Lapangan & Arena'],
        );

        return Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Basket',
            'slug' => 'lapangan-basket',
            'location' => 'Dieng',
            'venue_type' => 'Arena Luar',
            'is_active' => true,
            ...$overrides,
        ]);
    }

    private function staffUser(): User
    {
        Permission::firstOrCreate([
            'name' => 'manage-facilities',
            'guard_name' => 'web',
        ]);

        $role = Role::firstOrCreate([
            'name' => 'Administrator',
            'guard_name' => 'web',
        ]);
        $role->syncPermissions(['manage-facilities']);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }
}
