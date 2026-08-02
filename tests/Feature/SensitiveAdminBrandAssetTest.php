<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SensitiveAdminBrandAssetTest extends TestCase
{
    use RefreshDatabase;

    public function test_sensitive_logo_is_not_available_from_the_public_web_root(): void
    {
        $this->assertFileDoesNotExist(public_path('UBSC PRO.png'));
        $this->assertFileExists(resource_path('private/admin/UBSC PRO.png'));

        $this->get('/UBSC%20PRO.png')->assertNotFound();
    }

    public function test_guest_and_regular_user_cannot_read_the_private_admin_logo(): void
    {
        $this->get(route('admin.brand.logo'))
            ->assertRedirect(route('ubsc-staff.login'));

        $this->actingAs(User::factory()->create())
            ->get(route('admin.brand.logo'))
            ->assertForbidden();
    }

    public function test_authorized_staff_can_render_the_private_admin_logo(): void
    {
        $administrator = Role::findOrCreate('Administrator', 'web');
        $user = User::factory()->create();
        $user->assignRole($administrator);

        $response = $this->actingAs($user)
            ->get(route('admin.brand.logo'));

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

        $this->assertStringContainsString(
            'private',
            (string) $response->headers->get('Cache-Control'),
        );
    }
}
