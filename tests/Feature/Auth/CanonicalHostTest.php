<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CanonicalHostTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_loopback_aliases_are_normalized_to_one_cookie_origin(): void
    {
        config()->set('app.url', 'http://localhost:8000');

        $this
            ->get('http://127.0.0.1:8000/booking?from=tab#calendar')
            ->assertStatus(307)
            ->assertRedirect('http://localhost:8000/booking?from=tab');
    }

    public function test_non_loopback_preview_hosts_are_not_rewritten_in_local_environment(): void
    {
        config()->set('app.url', 'http://localhost:8000');

        $this
            ->withServerVariables(['HTTP_HOST' => 'preview.test'])
            ->get('/')
            ->assertOk();
    }
}
