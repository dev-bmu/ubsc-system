<?php

namespace Tests\Feature;

use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class MembershipPlanImageUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    public function test_admin_uploads_a_landscape_image_and_admin_serializer_returns_its_public_url(): void
    {
        $admin = $this->memberAdmin();

        $this->actingAs($admin)
            ->post(route('admin.memberships.plans.store'), $this->planAttributes([
                'name' => 'Paket Favorit',
                'tier' => 'favorit',
                'card_image' => UploadedFile::fake()->image('favorit-landscape.jpg', 1200, 400),
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasNoErrors();

        $plan = MembershipPlan::where('name', 'Paket Favorit')->firstOrFail();
        $media = $plan->getFirstMedia('card_image');

        $this->assertNotNull($media);
        $this->assertSame('public', $media->disk);
        Storage::disk('public')->assertExists($media->getPathRelativeToRoot());
        $this->assertSame($media->getUrl(), $plan->cardImageUrl());

        $this->actingAs($admin)
            ->get(route('admin.memberships.plans.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/MembershipPlans/Index')
                ->has('plans', 1)
                ->where('plans.0.tier', 'favorit')
                ->where('plans.0.card_image_url', $plan->cardImageUrl()));

        auth()->logout();

        $this->get(route('pricing'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('PricingPage')
                ->has('membershipPlans', 1)
                ->where('membershipPlans.0.card_image_url', $plan->cardImageUrl()));

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('HomePage')
                ->has('membershipPlans', 1)
                ->where('membershipPlans.0.card_image_url', $plan->cardImageUrl()));
    }

    public function test_replacing_an_image_keeps_one_media_record_and_removes_the_old_file(): void
    {
        $admin = $this->memberAdmin();
        $plan = MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Performa',
            'tier' => 'performa',
        ]));
        $oldMedia = $plan
            ->addMedia(UploadedFile::fake()->image('old-landscape.jpg', 1200, 400))
            ->toMediaCollection('card_image');
        $oldPath = $oldMedia->getPathRelativeToRoot();

        Storage::disk('public')->assertExists($oldPath);

        $this->actingAs($admin)
            ->post(route('admin.memberships.plans.update', $plan), $this->planAttributes([
                '_method' => 'PATCH',
                'name' => $plan->name,
                'tier' => 'performa',
                'card_image' => UploadedFile::fake()->image('new-landscape.webp', 1440, 480),
            ]))
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $plan->refresh();
        $newMedia = $plan->getFirstMedia('card_image');

        $this->assertNotNull($newMedia);
        $this->assertNotSame($oldMedia->id, $newMedia->id);
        $this->assertCount(1, $plan->getMedia('card_image'));
        Storage::disk('public')->assertMissing($oldPath);
        Storage::disk('public')->assertExists($newMedia->getPathRelativeToRoot());
        $this->assertNull($plan->card_image_url);
        $this->assertSame($newMedia->getUrl(), $plan->cardImageUrl());
    }

    public function test_admin_accepts_a_real_avif_landscape_image(): void
    {
        $admin = $this->memberAdmin();
        $source = public_path('assets/images/poster-gym-konten-program-ub-sport-center.avif');

        $this->assertFileExists($source);

        $this->actingAs($admin)
            ->post(route('admin.memberships.plans.store'), $this->planAttributes([
                'name' => 'Paket AVIF',
                'tier' => 'eksklusif',
                'card_image' => UploadedFile::fake()->createWithContent(
                    'membership-landscape.avif',
                    file_get_contents($source),
                ),
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasNoErrors();

        $plan = MembershipPlan::where('name', 'Paket AVIF')->firstOrFail();
        $media = $plan->getFirstMedia('card_image');

        $this->assertNotNull($media);
        $this->assertSame('image/avif', $media->mime_type);
        Storage::disk('public')->assertExists($media->getPathRelativeToRoot());
    }

    public function test_admin_cannot_remove_an_image_without_a_replacement(): void
    {
        $admin = $this->memberAdmin();
        $plan = MembershipPlan::create($this->planAttributes([
            'name' => 'Paket Eksklusif',
            'tier' => 'eksklusif',
            'card_image_url' => 'https://legacy.example.test/membership.jpg',
        ]));
        $media = $plan
            ->addMedia(UploadedFile::fake()->image('exclusive-landscape.png', 1200, 400))
            ->toMediaCollection('card_image');
        $path = $media->getPathRelativeToRoot();

        $this->actingAs($admin)
            ->post(route('admin.memberships.plans.update', $plan), $this->planAttributes([
                '_method' => 'PATCH',
                'name' => $plan->name,
                'tier' => 'eksklusif',
                'remove_card_image' => true,
            ]))
            ->assertRedirect()
            ->assertSessionHasErrors('card_image');

        $plan->refresh();

        $this->assertCount(1, $plan->getMedia('card_image'));
        Storage::disk('public')->assertExists($path);
        $this->assertSame('https://legacy.example.test/membership.jpg', $plan->card_image_url);
        $this->assertSame($media->getUrl(), $plan->cardImageUrl());
    }

    public function test_admin_rejects_non_landscape_or_unsupported_membership_images(): void
    {
        $admin = $this->memberAdmin();

        $this->actingAs($admin)
            ->from(route('admin.memberships.plans.index'))
            ->post(route('admin.memberships.plans.store'), $this->planAttributes([
                'name' => 'Paket Gambar Kotak',
                'card_image' => UploadedFile::fake()->image('square.jpg', 800, 800),
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasErrors('card_image');

        $this->actingAs($admin)
            ->from(route('admin.memberships.plans.index'))
            ->post(route('admin.memberships.plans.store'), $this->planAttributes([
                'name' => 'Paket Gif',
                'card_image' => UploadedFile::fake()->image('animated.gif', 1200, 400),
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasErrors('card_image');

        $this->assertDatabaseMissing('membership_plans', ['name' => 'Paket Gambar Kotak']);
        $this->assertDatabaseMissing('membership_plans', ['name' => 'Paket Gif']);
    }

    public function test_admin_cannot_publish_a_zero_price_plan_as_a_payment_product(): void
    {
        $admin = $this->memberAdmin();

        $this->actingAs($admin)
            ->from(route('admin.memberships.plans.index'))
            ->post(route('admin.memberships.plans.store'), $this->planAttributes([
                'name' => 'Paket Gratis Aktif',
                'price' => 0,
                'card_image' => UploadedFile::fake()->image('gratis.jpg', 1200, 400),
            ]))
            ->assertRedirect(route('admin.memberships.plans.index'))
            ->assertSessionHasErrors('price');

        $this->assertDatabaseMissing('membership_plans', [
            'name' => 'Paket Gratis Aktif',
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function planAttributes(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Paket Hemat',
            'description' => 'Akses gym dengan jadwal fleksibel.',
            'tier' => 'hemat',
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
