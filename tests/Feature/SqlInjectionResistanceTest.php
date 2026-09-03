<?php

namespace Tests\Feature;

use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SqlInjectionResistanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_credentials_are_never_interpreted_as_sql(): void
    {
        User::factory()->create([
            'email' => 'admin@example.test',
        ]);

        $this->post('/login', [
            'email' => "admin@example.test' OR '1'='1",
            'password' => "' OR '1'='1' --",
        ])->assertSessionHasErrors('email');

        $this->assertGuest();
        $this->assertDatabaseCount('users', 1);
    }

    public function test_public_slug_lookup_treats_injection_payload_as_plain_data(): void
    {
        $category = FacilityCategory::create([
            'name' => 'Arena',
            'slug' => 'arena',
        ]);
        Facility::create([
            'facility_category_id' => $category->id,
            'name' => 'Arena Rahasia',
            'slug' => 'arena-rahasia',
            'is_active' => true,
        ]);

        $payload = rawurlencode("missing' OR '1'='1' --");

        $this->get('/facilities/'.$payload)->assertNotFound();
        $this->assertDatabaseCount('facilities', 1);
    }
}
