<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\AuthSessionCoordinator;
use App\Support\PublicReturnPath;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_route_opens_public_auth_modal(): void
    {
        $response = $this->get('/login');

        $response->assertRedirect('/?auth=login');
    }

    public function test_login_route_preserves_an_explicit_safe_return_target(): void
    {
        $returnTo = '/pricing?plan=3#membership';

        $this->get('/login?'.http_build_query(['return_to' => $returnTo]))
            ->assertRedirect(
                '/?auth=login&return_to=%2Fpricing%3Fplan%3D3%23membership',
            )
            ->assertSessionHas('url.intended', $returnTo);
    }

    public function test_login_route_sanitizes_the_framework_intended_url(): void
    {
        $returnTo = '/checkout/booking/42?step=payment';
        $absoluteIntended = rtrim((string) config('app.url'), '/').$returnTo;

        $this->withSession(['url.intended' => $absoluteIntended])
            ->get('/login')
            ->assertRedirect(
                '/?auth=login&return_to=%2Fcheckout%2Fbooking%2F42%3Fstep%3Dpayment',
            )
            ->assertSessionHas('url.intended', $returnTo);
    }

    public function test_login_route_discards_an_external_framework_intended_url(): void
    {
        $this->withSession([
            'url.intended' => 'https://example.com/phishing',
        ])->get('/login')
            ->assertRedirect('/?auth=login')
            ->assertSessionMissing('url.intended');
    }

    public function test_users_can_authenticate_using_the_public_login_flow(): void
    {
        $user = User::factory()->create();
        $this->get('/');
        $sessionIdBeforeLogin = session()->getId();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $this->assertNotSame($sessionIdBeforeLogin, session()->getId());
        $response->assertRedirect('/');
        $response->assertCookieNotExpired((string) config('session.cookie'));
        $response->assertSessionHas('inertia.clear_history', true);

        $pageResponse = $this->get('/');
        $page = $pageResponse->viewData('page');

        $this->assertTrue($page['encryptHistory']);
        $this->assertTrue($page['clearHistory']);
        $this->assertSame($user->id, $page['props']['auth']['user']['id']);
        $this->assertStringContainsString(
            'no-store',
            (string) $pageResponse->headers->get('Cache-Control')
        );
    }

    public function test_modal_login_returns_to_the_same_safe_public_path(): void
    {
        $user = User::factory()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
            'return_to' => '/pricing?plan=3#membership',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect('/pricing?plan=3#membership');
    }

    public function test_modal_login_rejects_an_external_return_target(): void
    {
        $user = User::factory()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
            'return_to' => 'https://example.com/phishing',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect('/');
    }

    public function test_public_return_paths_reject_malformed_or_ambiguous_targets(): void
    {
        $this->assertSame(
            '/pricing?plan=3#membership',
            PublicReturnPath::normalize('/pricing?plan=3#membership'),
        );

        foreach ([
            'https://example.com/phishing',
            '//example.com/phishing',
            '/%2Fexample.com/phishing',
            "/pricing\r\nLocation: https://example.com",
            '/pricing%0d%0aLocation:https://example.com',
            '/pricing%5cexample',
            str_repeat('/a', 1025),
        ] as $target) {
            $this->assertNull(
                PublicReturnPath::normalize($target),
                "Target berbahaya masih diterima: {$target}",
            );
        }

        $this->assertSame(
            '/pricing?plan=3#membership',
            PublicReturnPath::normalizeSameOrigin(
                rtrim((string) config('app.url'), '/').'/pricing?plan=3#membership',
            ),
        );
        $this->assertNull(
            PublicReturnPath::normalizeSameOrigin(
                'https://example.com/pricing?plan=3#membership',
            ),
        );
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $user = User::factory()->create();

        $this->post('/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_users_can_logout(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $sessionIdBeforeLogout = session()->getId();

        $response = $this->post('/logout');

        $this->assertGuest();
        $this->assertNotSame($sessionIdBeforeLogout, session()->getId());
        $response->assertRedirect('/');
        $response->assertSessionHas('inertia.clear_history', true);

        $page = $this->get('/')->viewData('page');

        $this->assertTrue($page['clearHistory']);
        $this->assertNull($page['props']['auth']['user']);
    }

    public function test_logout_returns_to_the_same_safe_public_location(): void
    {
        $user = User::factory()->create();
        $returnTo = '/booking?date=2026-08-02#booking-content';

        $response = $this->actingAs($user)->post('/logout', [
            'return_to' => $returnTo,
        ]);

        $this->assertGuest();
        $response
            ->assertRedirect($returnTo)
            ->assertSessionHas('inertia.clear_history', true);
    }

    #[DataProvider('invalidLogoutReturnTargets')]
    public function test_logout_rejects_an_unsafe_return_target(
        string $returnTo,
    ): void {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/logout', [
            'return_to' => $returnTo,
        ]);

        $this->assertGuest();
        $response->assertRedirect('/');
    }

    public static function invalidLogoutReturnTargets(): array
    {
        return [
            'external URL' => ['https://example.com/phishing'],
            'protocol-relative URL' => ['//example.com/phishing'],
            'backslash path' => ['/booking\\redirect'],
            'encoded protocol-relative path' => ['/%2Fexample.com'],
        ];
    }

    public function test_session_state_endpoint_is_server_authoritative_and_never_cached(): void
    {
        $guestResponse = $this->getJson('/auth/session-state');

        $guestResponse
            ->assertOk()
            ->assertExactJson([
                'authenticated' => false,
                'user_id' => null,
            ]);
        $this->assertStringContainsString(
            'no-store',
            (string) $guestResponse->headers->get('Cache-Control')
        );
        $this->assertSame('no-cache', $guestResponse->headers->get('Pragma'));
        $this->assertSame('0', $guestResponse->headers->get('Expires'));
        $this->assertStringContainsString(
            'Cookie',
            implode(', ', $guestResponse->headers->all('Vary')),
        );
        $guestResponse->assertCookieMissing((string) config('session.cookie'));
        $guestResponse->assertCookieMissing('XSRF-TOKEN');

        $user = User::factory()->create();

        $authenticatedResponse = $this->actingAs($user)
            ->getJson('/auth/session-state')
            ->assertOk()
            ->assertExactJson([
                'authenticated' => true,
                'user_id' => $user->id,
            ]);
        $authenticatedResponse->assertCookieMissing((string) config('session.cookie'));
        $authenticatedResponse->assertCookieMissing('XSRF-TOKEN');
        $this->assertStringContainsString(
            'Cookie',
            implode(', ', $authenticatedResponse->headers->all('Vary')),
        );
    }

    public function test_html_get_and_head_responses_never_cache_user_state(): void
    {
        $user = User::factory()->create();

        foreach ([
            $this->get('/'),
            $this->head('/'),
            $this->actingAs($user)->get('/'),
            $this->actingAs($user)->head('/'),
        ] as $response) {
            $response->assertOk();
            $this->assertStringContainsString(
                'no-store',
                (string) $response->headers->get('Cache-Control'),
            );
        }
    }

    public function test_a_retired_session_cannot_be_written_back_by_a_late_tab_response(): void
    {
        $sessionId = str_repeat('a', 40);
        $store = app('session')->driver();
        $store->setId($sessionId);
        $store->start();
        $store->put('race', 'old-tab');
        $store->save();

        Route::middleware('web')->get(
            '/_test/auth-session-race',
            function () use ($sessionId) {
                // This request began while the ID was still current. Another
                // tab retires it before the response returns.
                app(AuthSessionCoordinator::class)->retire($sessionId);

                return response()->json(['ok' => true]);
            },
        );

        $response = $this
            ->withCookie((string) config('session.cookie'), $sessionId)
            ->get('/_test/auth-session-race');

        $response
            ->assertOk()
            ->assertExactJson(['ok' => true])
            ->assertCookieMissing((string) config('session.cookie'))
            ->assertCookieMissing('XSRF-TOKEN');

        $this->assertSame('', $store->getHandler()->read($sessionId));
    }

    public function test_a_browser_with_a_retired_cookie_receives_a_fresh_csrf_session(): void
    {
        $cookieName = (string) config('session.cookie');
        $retiredSessionId = str_repeat('c', 40);
        $store = app('session')->driver();
        $store->setId($retiredSessionId);
        $store->start();
        $store->put('_token', 'retired-csrf-token');
        $store->save();

        app(AuthSessionCoordinator::class)->retire($retiredSessionId);

        Route::middleware('web')->get(
            '/_test/auth-session-recovery',
            fn (Request $request) => response()->json([
                'session_id' => $request->session()->getId(),
                'csrf_token' => $request->session()->token(),
            ]),
        );
        Route::middleware('web')->post(
            '/_test/auth-session-recovery',
            fn () => response()->json(['accepted' => true]),
        );

        $recovery = $this
            ->withCookie($cookieName, $retiredSessionId)
            ->get('/_test/auth-session-recovery')
            ->assertOk();
        $freshSessionId = (string) $recovery->json('session_id');
        $freshCsrfToken = (string) $recovery->json('csrf_token');

        $this->assertNotSame($retiredSessionId, $freshSessionId);
        $this->assertNotSame('retired-csrf-token', $freshCsrfToken);
        $recovery->assertCookieNotExpired($cookieName);

        $this
            ->withCookie($cookieName, $freshSessionId)
            ->withHeader('X-CSRF-TOKEN', $freshCsrfToken)
            ->post('/_test/auth-session-recovery')
            ->assertOk()
            ->assertExactJson(['accepted' => true]);
    }

    public function test_session_state_probe_can_heal_a_retired_browser_cookie(): void
    {
        $cookieName = (string) config('session.cookie');
        $retiredSessionId = str_repeat('d', 40);
        $store = app('session')->driver();
        $store->setId($retiredSessionId);
        $store->start();
        $store->save();

        app(AuthSessionCoordinator::class)->retire($retiredSessionId);

        $this
            ->withCredentials()
            ->withCookie($cookieName, $retiredSessionId)
            ->getJson('/auth/session-state')
            ->assertOk()
            ->assertExactJson([
                'authenticated' => false,
                'user_id' => null,
            ])
            ->assertCookieNotExpired($cookieName)
            ->assertCookieNotExpired('XSRF-TOKEN');
    }

    public function test_auth_session_boundary_retires_the_exact_previous_id(): void
    {
        $sessionId = str_repeat('b', 40);
        $store = app('session')->driver();
        $store->setId($sessionId);
        $store->start();

        $request = Request::create('/login', 'POST');
        $request->setLaravelSession($store);

        $coordinator = app(AuthSessionCoordinator::class);
        $coordinator->regenerate($request);

        $this->assertNotSame($sessionId, $store->getId());
        $this->assertTrue($coordinator->isRetired($sessionId));
        $this->assertTrue($coordinator->isBoundaryRequest($request));
    }

    public function test_staff_rejected_from_public_login_does_not_leave_stale_history(): void
    {
        Role::firstOrCreate([
            'name' => 'Administrator',
            'guard_name' => 'web',
        ]);
        $staff = User::factory()->create();
        $staff->assignRole('Administrator');

        $response = $this->post('/login', [
            'email' => $staff->email,
            'password' => 'password',
        ]);

        $this->assertGuest();
        $response->assertSessionHasErrors('email');
        $response->assertSessionHas('inertia.clear_history', true);
    }
}
