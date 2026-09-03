<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\EnforceCanonicalHost;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class CsrfProtectionTest extends TestCase
{
    public function test_web_mutation_rejects_missing_token_and_accepts_matching_token(): void
    {
        Route::middleware('web')->post(
            '/_test/csrf-protection',
            fn () => response()->json(['accepted' => true]),
        );

        $this->withoutMiddleware(EnforceCanonicalHost::class);
        $this->app->detectEnvironment(fn (): string => 'production');

        $this->post('/_test/csrf-protection')->assertStatus(419);

        $this->withSession(['_token' => 'known-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'known-csrf-token')
            ->post('/_test/csrf-protection')
            ->assertOk()
            ->assertExactJson(['accepted' => true]);
    }
}
