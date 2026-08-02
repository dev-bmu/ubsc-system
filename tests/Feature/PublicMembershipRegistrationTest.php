<?php

namespace Tests\Feature;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use App\Services\MembershipRegistrationService;
use App\Services\Payments\PaymentAttemptService;
use App\Services\ServiceLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PublicMembershipRegistrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-07-28 10:00:00');
        config([
            'services.payment.mock' => true,
            'services.payment.membership_window_hours' => 24,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_public_registration_requires_a_verified_user(): void
    {
        $plan = $this->plan();

        $this->postJson(
            route('membership.registrations.store'),
            $this->payload(User::factory()->make(), $plan),
        )->assertUnauthorized();

        $unverified = User::factory()->unverified()->create();

        $this->actingAs($unverified)
            ->postJson(
                route('membership.registrations.store'),
                $this->payload($unverified, $plan),
            )
            ->assertForbidden();
    }

    public function test_active_zero_price_plan_is_not_a_public_payment_product(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan(['price' => 0]);

        $this->actingAs($user)
            ->postJson(
                route('membership.registrations.store'),
                $this->payload($user, $plan),
            )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('membership_plan_id');

        $this->assertDatabaseCount('memberships', 0);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_registration_service_also_rejects_zero_price_plan_when_http_validation_is_bypassed(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan(['price' => 0]);

        try {
            app(MembershipRegistrationService::class)->register(
                $user,
                $this->payload($user, $plan),
            );
            $this->fail('The registration service accepted a zero-price payment product.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey(
                'membership_plan_id',
                $exception->errors(),
            );
        }

        $this->assertDatabaseCount('memberships', 0);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_registration_uses_server_plan_values_and_is_visible_in_admin(): void
    {
        $user = User::factory()->create([
            'name' => 'Nama Akun Tetap',
            'phone_number' => '081111111111',
        ]);
        $plan = $this->plan([
            'name' => 'Performa Tiga Bulan',
            'tier' => 'performa',
            'price' => 275000,
            'duration_months' => 3,
        ]);
        $payload = $this->payload($user, $plan, [
            'full_name' => 'Nama Pendaftar',
            'whatsapp' => '081234567890',
            'price' => 1,
            'duration_months' => 99,
        ]);

        $response = $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), $payload)
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending_payment')
            ->assertJsonPath('data.plan.id', $plan->id)
            ->assertJsonPath('data.plan.tier', 'performa')
            ->assertJsonPath('data.plan.price', 275000)
            ->assertJsonPath('data.plan.duration_months', 3)
            ->assertJsonPath('data.plan.duration_label', '3 bulan')
            ->assertJsonPath('data.transaction.amount', 275000)
            ->assertJsonPath('data.transaction.payment_status', 'UNPAID')
            ->assertJsonPath('data.payment.payable', true)
            ->assertJsonPath('data.payment.mock_enabled', true)
            ->assertJsonPath(
                'data.payment.poll_url',
                fn ($value) => is_string($value)
                    && str_contains($value, '/membership/registrations/'),
            )
            ->assertJsonPath('data.payment.server_now', fn ($value) => is_string($value) && $value !== '')
            ->assertJsonPath('data.payment.expires_at', fn ($value) => is_string($value) && $value !== '');

        $membershipId = (int) $response->json('data.id');
        $membership = Membership::with('transaction')->findOrFail($membershipId);

        $this->assertSame('2026-07-28', $membership->start_date->toDateString());
        $this->assertSame('2026-10-28', $membership->end_date->toDateString());
        $this->assertSame('Nama Pendaftar', $membership->customer_name);
        $this->assertSame('081234567890', $membership->registration_phone);
        $this->assertSame(275000, $membership->transaction->amount);
        $this->assertSame(3, $membership->transaction->service_snapshot['duration_months']);
        $this->assertSame('Nama Akun Tetap', $user->fresh()->name);
        $this->assertSame('081111111111', $user->fresh()->phone_number);
        $this->assertDatabaseHas('membership_histories', [
            'membership_id' => $membership->id,
            'action' => 'registration_submitted',
            'payment_status' => 'UNPAID',
        ]);

        $this->actingAs($user)
            ->getJson(route('user.transactions'))
            ->assertOk()
            ->assertJsonPath('data.0.type', 'membership')
            ->assertJsonPath('data.0.service_status', 'awaiting_payment')
            ->assertJsonPath('data.0.payment_status', 'UNPAID')
            ->assertJsonPath('data.0.checkout_url', $membership->transaction->checkout_url)
            ->assertJsonPath('meta.awaiting_payment', 1);

        $admin = $this->staffUser('Finance', ['view-members']);
        $this->actingAs($admin)
            ->get(route('admin.memberships.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Memberships/Index')
                ->where('memberships.0.id', $membership->id)
                ->where('memberships.0.status', 'pending_payment')
                ->where('memberships.0.plan_tier', 'performa')
                ->where('memberships.0.registration.phone', '081234567890'));
    }

    public function test_registration_is_idempotent_and_new_submission_supersedes_old_pending(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $payload = $this->payload($user, $plan);

        $first = $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), $payload)
            ->assertCreated();
        $firstId = (int) $first->json('data.id');

        $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), $payload)
            ->assertOk()
            ->assertJsonPath('data.id', $firstId)
            ->assertJsonPath('data.replayed', true);

        $this->assertDatabaseCount('memberships', 1);
        $this->assertDatabaseCount('transactions', 1);

        $firstMembership = Membership::query()
            ->with('transaction')
            ->findOrFail($firstId);
        $supersededAttempt = app(PaymentAttemptService::class)->createOrResume(
            $firstMembership->transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'membership-superseded-open-attempt'),
        );

        $secondPayload = $this->payload($user, $plan);
        $secondId = (int) $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), $secondPayload)
            ->assertCreated()
            ->json('data.id');

        $this->assertNotSame($firstId, $secondId);
        $this->assertDatabaseHas('memberships', [
            'id' => $firstId,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('transactions', [
            'transactionable_id' => $firstId,
            'transactionable_type' => Membership::class,
            'payment_status' => 'FAILED',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $supersededAttempt->id,
            'status' => PaymentAttemptStatus::Cancelled->value,
        ]);
        $this->assertSame(
            1,
            Membership::query()->where('status', 'pending_payment')->count(),
        );
    }

    public function test_new_registration_cannot_supersede_a_paid_attempt_split_state(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $attempts = app(PaymentAttemptService::class);
        $attempt = $attempts->createOrResume(
            $membership->transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'membership-paid-split-supersede'),
        );
        $attempt = $attempts->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );
        $attempt = $attempts->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $membership->transaction->amount,
                currency: 'IDR',
                providerReference: 'split-'.$attempt->public_id,
            ),
        );

        $this->actingAs($user)
            ->postJson(
                route('membership.registrations.store'),
                $this->payload($user, $plan),
            )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('membership_plan_id');

        $this->assertDatabaseCount('memberships', 1);
        $this->assertDatabaseHas('memberships', [
            'id' => $membership->id,
            'status' => 'pending_payment',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $membership->transaction->id,
            'payment_status' => 'UNPAID',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => PaymentAttemptStatus::Paid->value,
        ]);
    }

    public function test_an_idempotency_key_cannot_be_reused_for_other_data(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $otherPlan = $this->plan(['name' => 'Paket Lain', 'sort_order' => 2]);
        $payload = $this->payload($user, $plan);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), $payload)
            ->assertCreated();

        $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), [
                ...$payload,
                'membership_plan_id' => $otherPlan->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('idempotency_key');

        $this->assertDatabaseCount('memberships', 1);
    }

    public function test_an_idempotency_key_cannot_silently_replay_a_different_name(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $payload = $this->payload($user, $plan, [
            'full_name' => 'Nama Pertama',
        ]);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), $payload)
            ->assertCreated();

        $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), [
                ...$payload,
                'full_name' => 'Nama Berbeda',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('idempotency_key');

        $this->assertDatabaseCount('memberships', 1);
        $this->assertDatabaseHas('memberships', [
            'customer_name' => 'Nama Pertama',
        ]);
    }

    public function test_warga_ub_category_requires_a_verified_campus_identity(): void
    {
        $plan = $this->plan();
        $general = User::factory()->create(['identity_category' => 'umum']);

        $this->actingAs($general)
            ->postJson(route('membership.registrations.store'), $this->payload(
                $general,
                $plan,
                ['category' => 'warga_ub'],
            ))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('category');

        $verifiedCampus = User::factory()->create([
            'identity_category' => 'warga_kampus',
            'identity_status' => 'verified',
        ]);

        $this->actingAs($verifiedCampus)
            ->postJson(route('membership.registrations.store'), $this->payload(
                $verifiedCampus,
                $plan,
                ['category' => 'warga_ub'],
            ))
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending_payment');
    }

    public function test_payment_is_owner_only_and_idempotently_activates_membership(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $plan = $this->plan();
        $registration = $this->actingAs($user)
            ->postJson(
                route('membership.registrations.store'),
                $this->payload($user, $plan),
            )
            ->assertCreated();
        $membership = Membership::findOrFail($registration->json('data.id'));

        $this->actingAs($other)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'qris',
            ])
            ->assertForbidden();

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'qris',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.transaction.payment_status', 'PAID')
            ->assertJsonPath('data.transaction.payment_method', 'qris')
            ->assertJsonPath('data.payment.payable', false);

        $membership->refresh()->load('transaction');
        $this->assertDatabaseHas('payment_attempts', [
            'transaction_id' => $membership->transaction->id,
            'idempotency_key' => $membership->registration_token,
            'amount' => $membership->transaction->amount,
            'currency' => 'IDR',
            'status' => 'paid',
            'provider' => 'local_mock',
        ]);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'qris',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->assertSame(1, $membership->histories()
            ->where('action', 'payment_confirmed')
            ->count());
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_payment_preserves_quote_and_reschedules_after_existing_membership(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan(['price' => 150000, 'duration_months' => 1]);
        $registration = $this->actingAs($user)
            ->postJson(
                route('membership.registrations.store'),
                $this->payload($user, $plan),
            )
            ->assertCreated();
        $pending = Membership::findOrFail($registration->json('data.id'));

        $existing = Membership::create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => '2026-07-01',
            'end_date' => '2026-09-10',
            'status' => 'active',
            'created_via' => 'admin',
        ]);
        $existing->transaction()->create([
            'user_id' => $user->id,
            'amount' => 150000,
            'payment_status' => 'PAID',
            'paid_at' => now(),
        ]);

        $plan->update(['price' => 999999, 'duration_months' => 12]);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $pending), [
                'payment_method' => 'bca_va',
            ])
            ->assertOk()
            ->assertJsonPath('data.plan.price', 150000)
            ->assertJsonPath('data.plan.duration_months', 1)
            ->assertJsonPath('data.start_date', '2026-09-11')
            ->assertJsonPath('data.end_date', '2026-10-11');

        $pending->refresh()->load('transaction');
        $this->assertSame(150000, $pending->transaction->amount);
        $this->assertSame(1, $pending->transaction->service_snapshot['duration_months']);
    }

    public function test_month_end_memberships_never_overflow_and_handle_leap_years(): void
    {
        foreach ([
            ['2027-01-31 10:00:00', '2027-02-28'],
            ['2028-01-31 10:00:00', '2028-02-29'],
        ] as $index => [$now, $expectedEnd]) {
            Carbon::setTestNow($now);
            $user = User::factory()->create();
            $plan = $this->plan([
                'name' => 'Paket Akhir Bulan '.($index + 1),
                'sort_order' => 20 + $index,
            ]);
            $membership = $this->register($user, $plan);

            $this->assertSame($expectedEnd, $membership->end_date->toDateString());

            $this->actingAs($user)
                ->postJson(route('membership.registrations.pay', $membership), [
                    'payment_method' => 'qris',
                ])
                ->assertOk()
                ->assertJsonPath('data.end_date', $expectedEnd);

            $this->assertSame(
                $expectedEnd,
                $membership->fresh()->end_date->toDateString(),
            );
        }
    }

    public function test_inactive_plan_or_elapsed_deadline_expires_pending_payment(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);

        $plan->update(['is_active' => false]);

        $this->actingAs($user)
            ->getJson(route('membership.registrations.show', $membership))
            ->assertOk()
            ->assertJsonPath('data.payment.payable', false);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'card',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.transaction.payment_status', 'EXPIRED');

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'card',
            ])
            ->assertUnprocessable();
        $this->assertSame(1, $membership->histories()
            ->where('action', 'payment_expired')
            ->count());

        $plan->update(['is_active' => true]);
        $expiredByTime = $this->register($user, $plan);
        $expiredByTime->load('transaction');
        $expiringAttempt = app(PaymentAttemptService::class)->createOrResume(
            $expiredByTime->transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'expiring-membership-attempt'),
        );
        $expiredByTime->update(['registration_expires_at' => now()->subMinute()]);

        $first = app(ServiceLifecycleService::class)->reconcileForUser($user->id);
        $second = app(ServiceLifecycleService::class)->reconcileForUser($user->id);

        $this->assertSame(1, $first['membership_payments_expired']);
        $this->assertSame(0, $second['membership_payments_expired']);
        $this->assertDatabaseHas('memberships', [
            'id' => $expiredByTime->id,
            'status' => 'cancelled',
        ]);
        $this->assertDatabaseHas('transactions', [
            'transactionable_id' => $expiredByTime->id,
            'transactionable_type' => Membership::class,
            'payment_status' => 'EXPIRED',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $expiringAttempt->id,
            'status' => 'expired',
        ]);
    }

    public function test_admin_simulate_payment_reuses_membership_activation_rules(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $admin = $this->staffUser('Finance', ['manage-payment-links']);

        $this->actingAs($admin)
            ->post(route(
                'admin.transactions.simulate-pay',
                $membership->transaction,
            ))
            ->assertRedirect();

        $membership->refresh()->load('transaction');
        $this->assertSame('active', $membership->status);
        $this->assertSame('PAID', $membership->transaction->payment_status);
        $this->assertSame('admin_confirmation', $membership->transaction->payment_method);
        $this->assertDatabaseHas('membership_histories', [
            'membership_id' => $membership->id,
            'action' => 'payment_confirmed',
            'actor_id' => $admin->id,
            'actor_type' => 'admin',
        ]);
    }

    public function test_admin_cannot_confirm_an_elapsed_registration(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $membership->update(['registration_expires_at' => now()->subMinute()]);
        $admin = $this->staffUser('Finance', ['manage-payment-links']);

        $this->actingAs($admin)
            ->from(route('admin.memberships.index'))
            ->post(route(
                'admin.transactions.simulate-pay',
                $membership->transaction,
            ))
            ->assertRedirect(route('admin.memberships.index'))
            ->assertSessionHasErrors('membership');

        $membership->refresh()->load('transaction');
        $this->assertSame('cancelled', $membership->status);
        $this->assertSame('EXPIRED', $membership->transaction->payment_status);
        $this->assertSame(0, $membership->histories()
            ->where('action', 'payment_confirmed')
            ->count());
        $this->assertSame(1, $membership->histories()
            ->where('action', 'payment_expired')
            ->count());
    }

    public function test_admin_cannot_reactivate_a_processed_membership_by_status_patch(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'qris',
            ])
            ->assertOk();

        $membership->update(['status' => 'expired']);
        $admin = $this->staffUser('Manager', ['manage-members']);

        $this->actingAs($admin)
            ->from(route('admin.memberships.index'))
            ->patch(route('admin.memberships.update', $membership), [
                'status' => 'active',
            ])
            ->assertRedirect(route('admin.memberships.index'))
            ->assertSessionHasErrors('status');

        $this->assertSame('expired', $membership->fresh()->status);
    }

    public function test_booking_permission_cannot_mutate_or_confirm_membership_records(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $bookingStaff = $this->staffUser('Staff Central', ['manage-bookings']);

        $this->actingAs($bookingStaff)
            ->patch(route('admin.memberships.update', $membership), [
                'status' => 'cancelled',
            ])
            ->assertForbidden();

        $this->actingAs($bookingStaff)
            ->delete(route('admin.memberships.destroy', $membership))
            ->assertForbidden();

        $this->actingAs($bookingStaff)
            ->post(route(
                'admin.transactions.simulate-pay',
                $membership->transaction,
            ))
            ->assertForbidden();

        $membership->refresh()->load('transaction');
        $this->assertSame('pending_payment', $membership->status);
        $this->assertSame('UNPAID', $membership->transaction->payment_status);
    }

    public function test_admin_cancellation_updates_membership_transaction_and_history_atomically(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $attempt = app(PaymentAttemptService::class)->createOrResume(
            $membership->transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'membership-admin-cancel-open-attempt'),
        );
        $admin = $this->staffUser('Manager', ['manage-members']);

        $this->actingAs($admin)
            ->delete(route('admin.memberships.destroy', $membership))
            ->assertRedirect();

        $membership->refresh()->load('transaction');
        $this->assertSame('cancelled', $membership->status);
        $this->assertSame('FAILED', $membership->transaction->payment_status);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => PaymentAttemptStatus::Cancelled->value,
        ]);
        $this->assertDatabaseHas('membership_histories', [
            'membership_id' => $membership->id,
            'action' => 'cancelled',
            'payment_status' => 'FAILED',
            'actor_id' => $admin->id,
        ]);

        $this->actingAs($user)
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'qris',
            ])
            ->assertUnprocessable();
    }

    public function test_admin_cannot_cancel_membership_during_a_paid_attempt_split_state(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $attempts = app(PaymentAttemptService::class);
        $attempt = $attempts->createOrResume(
            $membership->transaction,
            $user,
            (string) Str::uuid(),
            hash('sha256', 'membership-admin-cancel-paid-split'),
        );
        $attempt = $attempts->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );
        $attempt = $attempts->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $membership->transaction->amount,
                currency: 'IDR',
                providerReference: 'split-'.$attempt->public_id,
            ),
        );
        $admin = $this->staffUser('Manager', ['manage-members']);

        $this->actingAs($admin)
            ->from(route('admin.memberships.index'))
            ->delete(route('admin.memberships.destroy', $membership))
            ->assertRedirect(route('admin.memberships.index'))
            ->assertSessionHasErrors('status');

        $this->assertDatabaseHas('memberships', [
            'id' => $membership->id,
            'status' => 'pending_payment',
        ]);
        $this->assertDatabaseHas('transactions', [
            'id' => $membership->transaction->id,
            'payment_status' => 'UNPAID',
        ]);
        $this->assertDatabaseHas('payment_attempts', [
            'id' => $attempt->id,
            'status' => PaymentAttemptStatus::Paid->value,
        ]);
        $this->assertDatabaseMissing('membership_histories', [
            'membership_id' => $membership->id,
            'action' => 'cancelled',
        ]);
    }

    public function test_public_mock_membership_payment_is_unavailable_in_production(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);

        config(['services.payment.mock' => true]);
        $this->withoutMiddleware(\App\Http\Middleware\EnforceCanonicalHost::class);
        $this->app->detectEnvironment(fn () => 'production');

        $this->actingAs($user)
            ->withSession(['_token' => 'production-mock-guard'])
            ->withHeader('X-CSRF-TOKEN', 'production-mock-guard')
            ->postJson(route('membership.registrations.pay', $membership), [
                'payment_method' => 'qris',
            ])
            ->assertNotFound();

        $membership->refresh()->load('transaction');
        $this->assertSame('pending_payment', $membership->status);
        $this->assertSame('UNPAID', $membership->transaction->payment_status);
    }

    private function register(User $user, MembershipPlan $plan): Membership
    {
        $response = $this->actingAs($user)
            ->postJson(
                route('membership.registrations.store'),
                $this->payload($user, $plan),
            )
            ->assertCreated();

        return Membership::with('transaction')->findOrFail($response->json('data.id'));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(
        User $user,
        MembershipPlan $plan,
        array $overrides = [],
    ): array {
        return [
            'full_name' => $user->name ?: 'Member UBSC',
            'email' => $user->email ?: 'member@example.test',
            'gender' => 'L',
            'whatsapp' => '081234567890',
            'category' => 'umum',
            'membership_plan_id' => $plan->id,
            'idempotency_key' => (string) Str::uuid(),
            ...$overrides,
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function plan(array $overrides = []): MembershipPlan
    {
        return MembershipPlan::create([
            'name' => 'Membership Bulanan',
            'tier' => 'favorit',
            'price' => 150000,
            'duration_months' => 1,
            'is_active' => true,
            'sort_order' => 1,
            ...$overrides,
        ]);
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function staffUser(string $roleName, array $permissions): User
    {
        foreach ($permissions as $permission) {
            Permission::firstOrCreate([
                'name' => $permission,
                'guard_name' => 'web',
            ]);
        }

        $role = Role::firstOrCreate([
            'name' => $roleName,
            'guard_name' => 'web',
        ]);
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $user = User::factory()->create();
        $user->assignRole($roleName);

        return $user;
    }
}
