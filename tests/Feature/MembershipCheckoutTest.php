<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use App\Services\MembershipInvoiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MembershipCheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-07-28 10:00:00');
        Storage::fake('invoice-pdf');
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

    public function test_owner_receives_private_checkout_contract_and_legacy_urls_are_normalized(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $membership->transaction->update([
            'checkout_url' => route('pricing', [
                'membership_registration' => $membership->id,
            ]),
        ]);
        $expectedCheckout = route(
            'checkout.membership.show',
            $membership,
            absolute: false,
        );

        $response = $this->actingAs($user)
            ->get(route('checkout.membership.show', $membership));

        $response
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertInertia(fn (Assert $page) => $page
                ->component('Checkout/MembershipCheckoutPage')
                ->where('membership.id', $membership->id)
                ->where('membership.plan.name', 'Membership Favorit')
                ->where('membership.plan.price', 150000)
                ->where('membership.plan.compare_at_price', 187500)
                ->where('membership.plan.discount_amount', 37500)
                ->where('membership.plan.is_active', true)
                ->where('membership.registration.email', $user->email)
                ->where('membership.transaction.checkout_url', $expectedCheckout)
                ->where('membership.payment.checkout_url', $expectedCheckout)
                ->where('membership.payment.payable', true)
                ->where('membership.payment.pay_url', route(
                    'checkout.membership.pay',
                    $membership,
                    absolute: false,
                ))
                ->where('membership.payment.poll_url', route(
                    'membership.registrations.show',
                    $membership,
                    absolute: false,
                ))
                ->where('membership.payment.success_url', route(
                    'checkout.membership.success',
                    $membership,
                    absolute: false,
                ))
                ->where('completed', false));

        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );

        $this->actingAs($user)
            ->getJson(route('user.transactions'))
            ->assertOk()
            ->assertJsonPath('data.0.checkout_url', $expectedCheckout);
    }

    public function test_checkout_and_success_are_strictly_owner_only(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $membership = $this->register($owner, $this->plan());

        $this->actingAs($other)
            ->get(route('checkout.membership.show', $membership))
            ->assertForbidden();

        $this->actingAs($other)
            ->post(route('checkout.membership.pay', $membership), $this->payment())
            ->assertForbidden();

        $this->actingAs($other)
            ->get(route('checkout.membership.success', $membership))
            ->assertForbidden();

        $this->actingAs($other)
            ->get(route('checkout.membership.invoice', $membership))
            ->assertForbidden();
    }

    public function test_checkout_payment_updates_only_mutable_contact_fields_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $originalEmail = $membership->registration_email;
        $originalCategory = $membership->registration_category;
        $payment = $this->payment();

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), [
                ...$this->payment(),
                'whatsapp_number' => 'nomor-tidak-valid',
            ])
            ->assertSessionHasErrors('whatsapp_number');

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), $payment)
            ->assertRedirect(route('checkout.membership.success', $membership));

        $membership->refresh()->load('transaction');
        $this->assertSame('active', $membership->status);
        $this->assertSame('Nama Checkout', $membership->customer_name);
        $this->assertSame('081298765432', $membership->registration_phone);
        $this->assertSame($originalEmail, $membership->registration_email);
        $this->assertSame($originalCategory, $membership->registration_category);
        $this->assertSame($plan->id, $membership->membership_plan_id);
        $this->assertSame('PAID', $membership->transaction->payment_status);
        $this->assertSame('qris', $membership->transaction->payment_method);
        $this->assertDatabaseHas('payment_attempts', [
            'transaction_id' => $membership->transaction->id,
            'idempotency_key' => $payment['idempotency_key'],
            'amount' => $membership->transaction->amount,
            'currency' => 'IDR',
            'status' => 'paid',
            'provider' => 'local_mock',
        ]);
        $this->assertSame(
            'Nama Checkout',
            $membership->transaction->service_snapshot['registration']['full_name'],
        );
        $this->assertSame(
            '081298765432',
            $membership->transaction->service_snapshot['registration']['whatsapp'],
        );

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), [
                ...$payment,
                'customer_name' => 'Tidak Boleh Menimpa',
            ])
            ->assertRedirect(route('checkout.membership.success', $membership));

        $this->assertSame('Nama Checkout', $membership->fresh()->customer_name);
        $this->assertSame(
            1,
            $membership->histories()
                ->where('action', 'payment_confirmed')
                ->count(),
        );
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_elapsed_checkout_is_reconciled_once_and_cannot_be_paid(): void
    {
        $user = User::factory()->create();
        $membership = $this->register($user, $this->plan());
        $membership->update([
            'registration_expires_at' => now()->subSecond(),
        ]);

        $this->actingAs($user)
            ->get(route('checkout.membership.show', $membership))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('membership.status', 'cancelled')
                ->where('membership.transaction.payment_status', 'EXPIRED')
                ->where('membership.payment.payable', false));

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), $this->payment())
            ->assertRedirect(route('checkout.membership.show', $membership))
            ->assertSessionHasErrors('payment_method');

        $this->actingAs($user)
            ->get(route('checkout.membership.success', $membership))
            ->assertRedirect(route('checkout.membership.show', $membership));

        $this->assertSame(
            1,
            $membership->histories()
                ->where('action', 'payment_expired')
                ->count(),
        );
    }

    public function test_inactive_plan_is_non_payable_and_payment_expires_the_quote(): void
    {
        $user = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);
        $plan->update(['is_active' => false]);

        $this->actingAs($user)
            ->get(route('checkout.membership.show', $membership))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('membership.plan.is_active', false)
                ->where('membership.payment.payable', false)
                ->where(
                    'membership.payment.unavailable_reason',
                    'Paket membership sudah tidak tersedia. Pilih paket aktif lainnya.',
                ));

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), $this->payment())
            ->assertRedirect(route('checkout.membership.show', $membership))
            ->assertSessionHasErrors('payment_method');

        $membership->refresh()->load('transaction');
        $this->assertSame('cancelled', $membership->status);
        $this->assertSame('EXPIRED', $membership->transaction->payment_status);
    }

    public function test_paid_success_uses_dedicated_page_and_exposes_invoice(): void
    {
        $user = User::factory()->create();
        $membership = $this->register($user, $this->plan());

        $this->actingAs($user)
            ->get(route('checkout.membership.success', $membership))
            ->assertRedirect(route('checkout.membership.show', $membership));

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), $this->payment())
            ->assertRedirect(route('checkout.membership.success', $membership));

        $response = $this->actingAs($user)
            ->get(route('checkout.membership.success', $membership));

        $response
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Checkout/MembershipSuccessPage')
                ->where('membership.status', 'active')
                ->where('membership.transaction.payment_status', 'PAID')
                ->where('invoiceUrl', route(
                    'checkout.membership.invoice',
                    $membership,
                    absolute: false,
                )));

        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
    }

    public function test_membership_invoice_is_private_paid_only_and_verifiable(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $plan = $this->plan();
        $membership = $this->register($user, $plan);

        $this->actingAs($user)
            ->get(route('checkout.membership.invoice', $membership))
            ->assertStatus(409);

        $this->actingAs($user)
            ->post(route('checkout.membership.pay', $membership), $this->payment())
            ->assertRedirect();

        $plan->update([
            'name' => 'Nama Paket Baru',
            'price' => 999999,
            'compare_at_price' => 1000000,
            'duration_months' => 12,
        ]);
        $membership->refresh()->load(['plan', 'transaction', 'user']);

        $document = app(MembershipInvoiceService::class)->document($membership);
        $this->assertSame('Membership Favorit', $document['items'][0]['facility_name']);
        $this->assertSame(150000, $document['pricing']['total']);
        $this->assertSame(187500, $document['pricing']['regular_subtotal']);
        $this->assertSame(37500, $document['pricing']['discount']);
        $this->assertStringContainsString(
            '1 bulan',
            $document['items'][0]['details'][0],
        );

        $response = $this->actingAs($user)
            ->get(route('checkout.membership.invoice', $membership));

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString(
            'no-store',
            (string) $response->headers->get('Cache-Control'),
        );
        $this->assertStringStartsWith('%PDF-', $response->streamedContent());

        $membership->update(['status' => 'expired']);
        $this->actingAs($user)
            ->get(route('checkout.membership.invoice', $membership))
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        $this->actingAs($other)
            ->get(route('checkout.membership.invoice', $membership))
            ->assertForbidden();

        $verification = $this->get($document['verification_url']);
        $verification
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
            ->assertSee($document['receipt'])
            ->assertSee('Invoice terverifikasi')
            ->assertDontSee($membership->customer_name)
            ->assertDontSee($membership->registration_phone);

        $tamperedUrl = preg_replace(
            '/code=[^&]+/',
            'code=TAMPERED',
            $document['verification_url'],
        );
        $this->get($tamperedUrl)->assertForbidden();
    }

    public function test_production_checkout_is_readable_but_mock_payment_is_unavailable(): void
    {
        $user = User::factory()->create();
        $membership = $this->register($user, $this->plan());

        config(['services.payment.mock' => true]);
        $this->withoutMiddleware(\App\Http\Middleware\EnforceCanonicalHost::class);
        $this->app->detectEnvironment(fn () => 'production');

        $this->actingAs($user)
            ->get(route('checkout.membership.show', $membership))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('membership.payment.payable', true)
                ->where('membership.payment.pay_url', null)
                ->where('paymentAction', null)
                ->where('mockPayment', false));

        $this->actingAs($user)
            ->withSession(['_token' => 'membership-production-guard'])
            ->withHeader('X-CSRF-TOKEN', 'membership-production-guard')
            ->post(route(
                'checkout.membership.pay',
                $membership,
            ), $this->payment())
            ->assertNotFound();

        $membership->refresh()->load('transaction');
        $this->assertSame('pending_payment', $membership->status);
        $this->assertSame('UNPAID', $membership->transaction->payment_status);
    }

    /**
     * @return array<string, string>
     */
    private function payment(): array
    {
        return [
            'customer_name' => 'Nama Checkout',
            'whatsapp_number' => '0812 9876 5432',
            'payment_method' => 'qris',
            'idempotency_key' => (string) \Illuminate\Support\Str::uuid(),
        ];
    }

    private function register(
        User $user,
        MembershipPlan $plan,
    ): Membership {
        $response = $this->actingAs($user)
            ->postJson(route('membership.registrations.store'), [
                'full_name' => $user->name,
                'email' => $user->email,
                'gender' => 'L',
                'whatsapp' => '081234567890',
                'category' => 'umum',
                'membership_plan_id' => $plan->id,
                'idempotency_key' => (string) Str::uuid(),
            ])
            ->assertCreated();

        return Membership::with(['plan', 'transaction', 'user'])
            ->findOrFail($response->json('data.id'));
    }

    private function plan(): MembershipPlan
    {
        return MembershipPlan::create([
            'name' => 'Membership Favorit',
            'description' => 'Latihan konsisten dan fleksibel.',
            'tier' => MembershipPlan::TIER_FAVORIT,
            'price' => 150000,
            'compare_at_price' => 187500,
            'duration_months' => 1,
            'is_active' => true,
            'sort_order' => 1,
        ]);
    }
}
