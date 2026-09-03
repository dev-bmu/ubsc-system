<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\EnforceCanonicalHost;
use App\Models\User;
use App\Services\AdminPresenceService;
use App\Services\AdminSessionSecurity;
use App\Support\AdminSessionRoutePolicy;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Collection;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AdminPresenceTest extends TestCase
{
    use RefreshDatabase;

    private const TAB_A = '11111111-1111-4111-8111-111111111111';

    private const TAB_B = '22222222-2222-4222-8222-222222222222';

    private const TAB_C = '33333333-3333-4333-8333-333333333333';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'security.admin_presence.online_ttl_seconds' => 90,
            'security.admin_presence.last_seen_write_seconds' => 60,
        ]);

        foreach (['Administrator', 'Manager', 'Finance', 'Staff Central', 'Staff Front Office'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    public function test_heartbeat_is_available_only_to_authenticated_staff(): void
    {
        $this->postJson(
            route('admin.presence.heartbeat'),
            $this->heartbeatPayload(AdminPresenceService::ONLINE),
        )->assertUnauthorized();

        $publicUser = User::factory()->create();

        $this->actingAs($publicUser)
            ->postJson(
                route('admin.presence.heartbeat'),
                $this->heartbeatPayload(AdminPresenceService::ONLINE),
            )
            ->assertForbidden();
    }

    public function test_heartbeat_uses_server_identity_and_rejects_unsupported_state(): void
    {
        $actor = $this->staff('Manager');
        $target = $this->staff('Finance');

        $this->actingAs($actor)
            ->withSession([AdminSessionSecurity::SESSION_INSTANCE => 'actor-session'])
            ->postJson(route('admin.presence.heartbeat'), [
                ...$this->heartbeatPayload(AdminPresenceService::IDLE),
                'user_id' => $target->getKey(),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_id');

        $invalidResponse = $this->postJson(
            route('admin.presence.heartbeat'),
            $this->heartbeatPayload('busy'),
        )->assertUnprocessable()
            ->assertJsonValidationErrors('state');
        $this->assertStringContainsString(
            'no-store',
            (string) $invalidResponse->headers->get('Cache-Control'),
        );

        $this->postJson(route('admin.presence.heartbeat'), [
            ...$this->heartbeatPayload(AdminPresenceService::ONLINE),
            'tab_id' => 'not-a-browser-tab-uuid',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('tab_id');

        $snapshots = app(AdminPresenceService::class)->snapshotsFor([
            $actor->refresh(),
            $target->refresh(),
        ]);

        $this->assertSame(AdminPresenceService::OFFLINE, $snapshots[$actor->id]['status']);
        $this->assertSame(AdminPresenceService::OFFLINE, $snapshots[$target->id]['status']);
    }

    public function test_online_heartbeat_is_no_store_and_does_not_extend_admin_idle_activity(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-08-11 10:00:00 UTC'));
        $staff = $this->staff('Manager');
        $this->actingAs($staff)->withSession([
            AdminSessionSecurity::SESSION_INSTANCE => 'manager-session',
        ]);
        $lastActivityAt = (int) session(AdminSessionSecurity::LAST_ACTIVITY_AT);

        $this->travel(10)->seconds();
        $response = $this->postJson(
            route('admin.presence.heartbeat'),
            $this->heartbeatPayload(AdminPresenceService::ONLINE),
        );

        $response->assertNoContent();
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertSame(
            $lastActivityAt,
            (int) session(AdminSessionSecurity::LAST_ACTIVITY_AT),
        );
        $this->assertTrue(AdminSessionRoutePolicy::routeIsReadOnly(
            $this->heartbeatRoute(),
        ));

        $staff->refresh();
        $this->assertSame(now()->timestamp, $staff->staff_last_seen_at?->timestamp);
        $snapshot = app(AdminPresenceService::class)->snapshotsFor([$staff])[$staff->id];
        $this->assertSame(AdminPresenceService::ONLINE, $snapshot['status']);
        $this->assertTrue($snapshot['is_online']);
        $this->assertSame(now()->utc()->toISOString(), $snapshot['last_seen_at']);
    }

    public function test_same_session_tabs_are_independent_and_any_online_tab_wins(): void
    {
        $presence = app(AdminPresenceService::class);
        $staff = $this->staff('Manager');
        $firstSeen = CarbonImmutable::parse('2026-08-11 11:00:00 UTC');
        $this->travelTo($firstSeen);

        $presence->heartbeat(
            $staff,
            'shared-session',
            self::TAB_A,
            1,
            AdminPresenceService::ONLINE,
        );
        $presence->heartbeat(
            $staff,
            'shared-session',
            self::TAB_B,
            1,
            AdminPresenceService::IDLE,
        );
        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::ONLINE, $snapshot['status']);

        $this->travel(30)->seconds();
        $presence->heartbeat(
            $staff,
            'shared-session',
            self::TAB_A,
            2,
            AdminPresenceService::IDLE,
        );
        $staff->refresh();
        $snapshot = $presence->snapshotsFor([$staff])[$staff->id];

        $this->assertSame(AdminPresenceService::IDLE, $snapshot['status']);
        $this->assertFalse($snapshot['is_online']);
        $this->assertSame($firstSeen->timestamp, $staff->staff_last_seen_at?->timestamp);
        $this->assertSame($firstSeen->toISOString(), $snapshot['last_seen_at']);
    }

    public function test_out_of_order_heartbeat_cannot_regress_state_timestamp_or_ttl(): void
    {
        $presence = app(AdminPresenceService::class);
        $staff = $this->staff('Manager');
        $firstSeen = CarbonImmutable::parse('2026-08-11 11:30:00 UTC');
        $this->travelTo($firstSeen);

        $presence->heartbeat(
            $staff,
            'ordered-session',
            self::TAB_A,
            1,
            AdminPresenceService::ONLINE,
        );

        $this->travel(10)->seconds();
        $presence->heartbeat(
            $staff,
            'ordered-session',
            self::TAB_A,
            3,
            AdminPresenceService::IDLE,
        );

        $this->travel(85)->seconds();
        $presence->heartbeat(
            $staff,
            'ordered-session',
            self::TAB_A,
            2,
            AdminPresenceService::ONLINE,
        );

        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::IDLE, $snapshot['status']);
        $this->assertSame($firstSeen->toISOString(), $snapshot['last_seen_at']);
        $this->assertSame($firstSeen->timestamp, $staff->staff_last_seen_at?->timestamp);

        // The delayed request arrived at T+95 but must not extend the accepted
        // idle slot written at T+10, whose 90-second lifetime is now over.
        $this->travel(6)->seconds();
        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::OFFLINE, $snapshot['status']);
    }

    public function test_last_seen_writes_are_throttled_and_presence_expires_to_offline(): void
    {
        $presence = app(AdminPresenceService::class);
        $staff = $this->staff('Manager');
        $firstSeen = CarbonImmutable::parse('2026-08-11 12:00:00 UTC');
        $this->travelTo($firstSeen);

        $presence->heartbeat(
            $staff,
            'session-a',
            self::TAB_A,
            1,
            AdminPresenceService::ONLINE,
        );
        $this->travel(30)->seconds();
        $presence->heartbeat(
            $staff,
            'session-a',
            self::TAB_A,
            2,
            AdminPresenceService::ONLINE,
        );
        $this->assertSame($firstSeen->timestamp, $staff->refresh()->staff_last_seen_at?->timestamp);

        $this->travel(31)->seconds();
        $presence->heartbeat(
            $staff,
            'session-a',
            self::TAB_A,
            3,
            AdminPresenceService::ONLINE,
        );
        $persistedAt = now()->timestamp;
        $this->assertSame($persistedAt, $staff->refresh()->staff_last_seen_at?->timestamp);

        $this->travel(91)->seconds();
        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];

        $this->assertSame(AdminPresenceService::OFFLINE, $snapshot['status']);
        $this->assertFalse($snapshot['is_online']);
        $this->assertSame(
            CarbonImmutable::createFromTimestampUTC($persistedAt)->toISOString(),
            $snapshot['last_seen_at'],
        );
    }

    public function test_expired_admin_session_cannot_publish_presence(): void
    {
        $staff = $this->staff('Manager');
        $this->actingAs($staff)->withSession([
            AdminSessionSecurity::ISSUED_AT => now()->subHour()->timestamp,
            AdminSessionSecurity::LAST_ACTIVITY_AT => now()->subMinutes(31)->timestamp,
            AdminSessionSecurity::ROTATED_AT => now()->subMinutes(10)->timestamp,
            AdminSessionSecurity::MFA_VERIFIED_AT => now()->subHour()->timestamp,
            AdminSessionSecurity::SESSION_INSTANCE => 'expired-session',
        ]);

        $this->postJson(
            route('admin.presence.heartbeat'),
            $this->heartbeatPayload(AdminPresenceService::ONLINE),
        )->assertUnauthorized();

        $snapshot = app(AdminPresenceService::class)
            ->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::OFFLINE, $snapshot['status']);
        $this->assertNull($staff->staff_last_seen_at);
    }

    public function test_internal_users_and_role_counts_share_the_same_presence_source(): void
    {
        $admin = $this->staff('Administrator');
        $manager = $this->staff('Manager');
        $finance = $this->staff('Finance');
        $central = $this->staff('Staff Central');
        $presence = app(AdminPresenceService::class);

        $presence->heartbeat(
            $manager,
            'manager-session',
            self::TAB_A,
            1,
            AdminPresenceService::ONLINE,
        );
        $presence->heartbeat(
            $finance,
            'finance-session',
            self::TAB_B,
            1,
            AdminPresenceService::IDLE,
        );

        $this->actingAs($admin)
            ->get(route('admin.settings.users'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Settings/Users/Index')
                ->where('users', function (Collection $users) use ($manager, $finance, $central): bool {
                    $byId = $users->keyBy('id');

                    return $byId->get($manager->id)['presence']['status'] === AdminPresenceService::ONLINE
                        && $byId->get($manager->id)['presence']['is_online'] === true
                        && $byId->get($finance->id)['presence']['status'] === AdminPresenceService::IDLE
                        && $byId->get($finance->id)['presence']['is_online'] === false
                        && $byId->get($central->id)['presence']['status'] === AdminPresenceService::OFFLINE;
                }));

        $this->get(route('admin.settings.roles'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Settings/Roles')
                ->where('roles', function (Collection $roles): bool {
                    $byName = $roles->keyBy('name');

                    return $byName->get('Manager')['online_users_count'] === 1
                        && $byName->get('Finance')['online_users_count'] === 0
                        && $byName->get('Staff Central')['online_users_count'] === 0;
                }));
    }

    public function test_heartbeat_has_a_per_account_rate_limit(): void
    {
        $staff = $this->staff('Manager');
        $this->actingAs($staff)->withSession([
            AdminSessionSecurity::SESSION_INSTANCE => 'rate-limited-session',
        ]);

        for ($attempt = 1; $attempt <= 12; $attempt++) {
            $this->postJson(
                route('admin.presence.heartbeat'),
                $this->heartbeatPayload(
                    AdminPresenceService::IDLE,
                    sequence: $attempt,
                ),
            )->assertNoContent();
        }

        $response = $this->postJson(
            route('admin.presence.heartbeat'),
            $this->heartbeatPayload(
                AdminPresenceService::IDLE,
                sequence: 13,
            ),
        )->assertTooManyRequests();
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
    }

    public function test_heartbeat_requires_csrf_outside_the_test_environment(): void
    {
        $staff = $this->staff('Manager');
        $this->actingAs($staff)->withSession([
            AdminSessionSecurity::SESSION_INSTANCE => 'csrf-session',
        ]);
        $this->withoutMiddleware(EnforceCanonicalHost::class);
        $this->app->detectEnvironment(fn (): string => 'production');

        $this->post(
            route('admin.presence.heartbeat'),
            $this->heartbeatPayload(AdminPresenceService::ONLINE),
        )->assertStatus(419);

        $this->withSession(['_token' => 'known-presence-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'known-presence-csrf-token')
            ->post(
                route('admin.presence.heartbeat'),
                $this->heartbeatPayload(AdminPresenceService::ONLINE),
            )
            ->assertNoContent();
    }

    public function test_explicit_logout_clears_all_tabs_for_only_that_server_session(): void
    {
        $presence = app(AdminPresenceService::class);
        $staff = $this->staff('Manager');

        $presence->heartbeat(
            $staff,
            'session-being-logged-out',
            self::TAB_A,
            1,
            AdminPresenceService::ONLINE,
        );
        $presence->heartbeat(
            $staff,
            'session-being-logged-out',
            self::TAB_B,
            1,
            AdminPresenceService::ONLINE,
        );
        $presence->heartbeat(
            $staff,
            'other-device-session',
            self::TAB_C,
            1,
            AdminPresenceService::IDLE,
        );

        $this->actingAs($staff)
            ->withSession([
                AdminSessionSecurity::SESSION_INSTANCE => 'session-being-logged-out',
            ])
            ->post(route('ubsc-staff.logout'))
            ->assertRedirect(route('ubsc-staff.login'));

        $this->assertGuest();
        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::IDLE, $snapshot['status']);

        // A heartbeat request that was already in flight when logout happened
        // cannot recreate any tab belonging to the revoked server session.
        $presence->heartbeat(
            $staff,
            'session-being-logged-out',
            self::TAB_A,
            2,
            AdminPresenceService::ONLINE,
        );
        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::IDLE, $snapshot['status']);

        // Another independently authenticated session for this account is
        // still allowed to update its own slot.
        $presence->heartbeat(
            $staff,
            'other-device-session',
            self::TAB_C,
            2,
            AdminPresenceService::ONLINE,
        );
        $snapshot = $presence->snapshotsFor([$staff->refresh()])[$staff->id];
        $this->assertSame(AdminPresenceService::ONLINE, $snapshot['status']);
    }

    private function staff(string $role): User
    {
        $user = User::factory()->create();
        $user->assignRole($role);

        return $user;
    }

    /** @return array{state: string, tab_id: string, sequence: int} */
    private function heartbeatPayload(
        string $state,
        string $tabId = self::TAB_A,
        int $sequence = 1,
    ): array {
        return [
            'state' => $state,
            'tab_id' => $tabId,
            'sequence' => $sequence,
        ];
    }

    private function heartbeatRoute(): Route
    {
        $route = app('router')->getRoutes()->getByName('admin.presence.heartbeat');
        $this->assertInstanceOf(Route::class, $route);

        return $route;
    }
}
