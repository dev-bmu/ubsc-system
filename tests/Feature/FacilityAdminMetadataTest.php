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

class FacilityAdminMetadataTest extends TestCase
{
    use RefreshDatabase;

    public function test_updating_public_details_preserves_legacy_and_system_metadata(): void
    {
        $staff = $this->staffUser();
        $category = $this->category();
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Basket',
            'slug' => 'lapangan-basket',
            'venue_type' => 'Arena Luar',
            'is_active' => true,
        ]);

        $metadata = [
            'public_image_path' => '/assets/images/basket.avif',
            'periods' => [
                ['label' => 'Legacy', 'harga' => 'Rp100.000'],
            ],
            'additionalDetails' => [
                ['key' => ' Kapasitas ', 'value' => ' 22 pemain '],
                ['key' => '', 'value' => ''],
            ],
        ];

        $this->actingAs($staff)
            ->put(route('admin.facilities.update', $facility), [
                'facility_category_id' => $category->id,
                'name' => $facility->name,
                'slug' => $facility->slug,
                'description' => '',
                'location' => 'Dieng',
                'venue_type' => 'Arena Luar',
                'capacity' => 22,
                'class_code' => 'Terbuka 002',
                'rating' => 5,
                'display_metadata' => json_encode($metadata, JSON_THROW_ON_ERROR),
                'is_active' => true,
                'sort_order' => 2,
            ])
            ->assertRedirect(route('admin.facilities.index'));

        $saved = $facility->fresh()->display_metadata;

        $this->assertSame('/assets/images/basket.avif', $saved['public_image_path']);
        $this->assertSame('Legacy', $saved['periods'][0]['label']);
        $this->assertSame([
            ['key' => 'Kapasitas', 'value' => '22 pemain'],
        ], $saved['additionalDetails']);
    }

    public function test_invalid_public_metadata_is_rejected_without_overwriting_existing_data(): void
    {
        $staff = $this->staffUser();
        $category = $this->category();
        $facility = Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Lapangan Volly',
            'slug' => 'lapangan-volly',
            'display_metadata' => [
                'public_image_path' => '/assets/images/volly.avif',
            ],
            'is_active' => true,
        ]);

        $this->actingAs($staff)
            ->from(route('admin.facilities.edit', $facility))
            ->put(route('admin.facilities.update', $facility), [
                'facility_category_id' => $category->id,
                'name' => $facility->name,
                'slug' => $facility->slug,
                'display_metadata' => '{invalid-json',
                'is_active' => true,
                'sort_order' => 1,
            ])
            ->assertRedirect(route('admin.facilities.edit', $facility))
            ->assertSessionHasErrors('display_metadata');

        $this->assertSame(
            '/assets/images/volly.avif',
            $facility->fresh()->display_metadata['public_image_path'],
        );
    }

    public function test_new_facility_continues_directly_to_the_single_pricing_editor(): void
    {
        $staff = $this->staffUser();
        $category = $this->category();

        $response = $this->actingAs($staff)
            ->post(route('admin.facilities.store'), [
                'facility_category_id' => $category->id,
                'name' => 'Lapangan Baru',
                'slug' => 'lapangan-baru',
                'venue_type' => 'Arena Dalam',
                'capacity' => 1,
                'rating' => 5,
                'is_active' => true,
                'sort_order' => 1,
            ]);

        $facility = Facility::where('slug', 'lapangan-baru')->firstOrFail();

        $response
            ->assertRedirect(route('admin.facilities.pricing', $facility))
            ->assertSessionHas('success');
    }

    public function test_unsafe_description_and_map_metadata_are_rejected_or_sanitized(): void
    {
        $staff = $this->staffUser();
        $category = $this->category();

        $this->actingAs($staff)
            ->post(route('admin.facilities.store'), [
                'facility_category_id' => $category->id,
                'name' => 'Arena Aman',
                'slug' => 'arena-aman',
                'description' => '<p onclick="alert(1)">Arena<script>alert(2)</script></p>',
                'display_metadata' => json_encode([
                    'map_url' => 'javascript:alert(3)',
                ], JSON_THROW_ON_ERROR),
                'is_active' => true,
                'sort_order' => 1,
            ])
            ->assertSessionHasErrors('display_metadata');

        $this->assertDatabaseMissing('facilities', ['slug' => 'arena-aman']);

        $this->actingAs($staff)
            ->post(route('admin.facilities.store'), [
                'facility_category_id' => $category->id,
                'name' => 'Arena Aman',
                'slug' => 'arena-aman',
                'description' => '<p onclick="alert(1)">Arena<script>alert(2)</script></p>',
                'display_metadata' => json_encode([
                    'map_url' => 'https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8',
                ], JSON_THROW_ON_ERROR),
                'is_active' => true,
                'sort_order' => 1,
            ])
            ->assertRedirect();

        $description = Facility::where('slug', 'arena-aman')->value('description');
        $this->assertSame('<p>Arena</p>', $description);
    }

    private function category(): FacilityCategory
    {
        return FacilityCategory::create([
            'name' => 'Lapangan & Arena',
            'slug' => 'lapangan-arena',
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
