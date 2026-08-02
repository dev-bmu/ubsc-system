<?php

namespace Tests\Feature;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Payments\PaymentAttemptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Recovery probes for process-death boundaries.
 *
 * Each fixture deliberately persists the exact split state that would remain
 * if PHP stopped after one committed phase. The recovery command is then
 * resolved from a fresh container instance and executed twice. This exercises
 * durable database recovery, not an in-memory continuation of checkout code.
 */
class PaymentRestartRecoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-08-02 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_restart_after_provider_paid_recovers_booking_exactly_once(): void
    {
        [$order, $booking, $transaction] = $this->pendingBookingAggregate();
        $attempt = $this->paidAttempt($transaction, 'booking-crash-after-provider-paid');

        // Crash boundary: the provider result was durably recorded, but the
        // legacy transaction, order and reservation benefit were not updated.
        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('pending', $booking->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $transaction = $transaction->fresh();
        $firstPaidAt = $transaction->paid_at?->toISOString();
        $firstAttemptVersion = $attempt->fresh()->lock_version;

        $this->assertSame('PAID', $transaction->payment_status);
        $this->assertNotNull($firstPaidAt);
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame('confirmed', $booking->fresh()->status);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame($firstPaidAt, $transaction->fresh()->paid_at?->toISOString());
        $this->assertSame($firstAttemptVersion, $attempt->fresh()->lock_version);
        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_restart_after_provider_paid_activates_membership_exactly_once(): void
    {
        [$membership, $transaction] = $this->pendingMembershipAggregate();
        $attempt = $this->paidAttempt($transaction, 'membership-crash-after-provider-paid');

        // The process remains down beyond the checkout deadline. Settlement
        // occurred before expiry, so recovery must still grant the benefit.
        Carbon::setTestNow(now()->addHours(2));

        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertSame('pending_payment', $membership->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $membership = $membership->fresh();
        $transaction = $transaction->fresh();
        $firstPaidAt = $transaction->paid_at?->toISOString();
        $firstEndDate = $membership->end_date->toDateString();
        $firstAttemptVersion = $attempt->fresh()->lock_version;

        $this->assertSame('PAID', $transaction->payment_status);
        $this->assertNotNull($firstPaidAt);
        $this->assertSame('active', $membership->status);
        $this->assertNull($membership->registration_expires_at);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);
        $this->assertDatabaseHas('membership_histories', [
            'membership_id' => $membership->id,
            'transaction_id' => $transaction->id,
            'action' => 'payment_confirmed',
            'actor_type' => 'system',
        ]);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame($firstPaidAt, $transaction->fresh()->paid_at?->toISOString());
        $this->assertSame($firstEndDate, $membership->fresh()->end_date->toDateString());
        $this->assertSame($firstAttemptVersion, $attempt->fresh()->lock_version);
        $this->assertSame(
            1,
            $membership->histories()->where('action', 'payment_confirmed')->count(),
        );
        $this->assertDatabaseCount('memberships', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_restart_after_transaction_settled_confirms_booking_without_rewriting_paid_time(): void
    {
        [$order, $booking, $transaction] = $this->pendingBookingAggregate();
        $attempt = $this->paidAttempt($transaction, 'booking-crash-after-transaction-paid');
        $settledAt = now()->subSeconds(20);
        $transaction->update([
            'payment_status' => 'PAID',
            'payment_method' => 'qris',
            'paid_at' => $settledAt,
        ]);

        // Crash boundary: financial settlement committed, domain benefit did
        // not. Recovery must never ask the customer to pay again.
        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('pending', $booking->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame('PAID', $transaction->fresh()->payment_status);
        $this->assertSame($settledAt->toISOString(), $transaction->fresh()->paid_at?->toISOString());
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame('confirmed', $booking->fresh()->status);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame($settledAt->toISOString(), $transaction->fresh()->paid_at?->toISOString());
        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_restart_after_transaction_settled_activates_membership_without_duplicate_entitlement(): void
    {
        [$membership, $transaction] = $this->pendingMembershipAggregate();
        $attempt = $this->paidAttempt($transaction, 'membership-crash-after-transaction-paid');
        $settledAt = now()->subSeconds(20);
        $transaction->update([
            'payment_status' => 'PAID',
            'payment_method' => 'qris',
            'paid_at' => $settledAt,
        ]);

        $this->assertSame('pending_payment', $membership->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $membership = $membership->fresh();
        $firstEndDate = $membership->end_date->toDateString();

        $this->assertSame('PAID', $transaction->fresh()->payment_status);
        $this->assertSame($settledAt->toISOString(), $transaction->fresh()->paid_at?->toISOString());
        $this->assertSame('active', $membership->status);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);
        $this->assertSame(
            1,
            $membership->histories()->where('action', 'payment_confirmed')->count(),
        );

        $this->runRecoveryAsFreshWorker();

        $this->assertSame($settledAt->toISOString(), $transaction->fresh()->paid_at?->toISOString());
        $this->assertSame($firstEndDate, $membership->fresh()->end_date->toDateString());
        $this->assertSame(
            1,
            $membership->histories()->where('action', 'payment_confirmed')->count(),
        );
        $this->assertDatabaseCount('memberships', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_restart_moves_a_stale_unbound_creating_attempt_to_reconciling_without_granting_benefit(): void
    {
        [$order, $booking, $transaction] = $this->pendingBookingAggregate();
        $attempt = $this->openAttempt(
            $transaction,
            'booking-crash-before-provider-response',
            now()->addHour(),
        );
        $attempt = app(PaymentAttemptService::class)->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );
        DB::table('payment_attempts')->where('id', $attempt->id)->update([
            'updated_at' => now()->subDay(),
        ]);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame(PaymentAttemptStatus::Reconciling, $attempt->fresh()->status);
        $this->assertNull($attempt->fresh()->paid_at);
        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('pending', $booking->fresh()->status);
        $firstVersion = $attempt->fresh()->lock_version;

        $this->runRecoveryAsFreshWorker();

        $this->assertSame(PaymentAttemptStatus::Reconciling, $attempt->fresh()->status);
        $this->assertSame($firstVersion, $attempt->fresh()->lock_version);
        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_restart_expires_a_due_unbound_attempt_and_releases_its_booking_hold_idempotently(): void
    {
        [$order, $booking, $transaction] = $this->pendingBookingAggregate(
            expiresAt: now()->addMinute(),
        );
        $attempt = $this->openAttempt(
            $transaction,
            'booking-crash-before-expiry',
            now()->addMinute(),
        );
        $attempt = app(PaymentAttemptService::class)->transition(
            $attempt,
            PaymentAttemptStatus::Creating,
        );

        Carbon::setTestNow(now()->addMinutes(2));
        DB::table('payment_attempts')->where('id', $attempt->id)->update([
            'updated_at' => now()->subDay(),
        ]);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame(PaymentAttemptStatus::Expired, $attempt->fresh()->status);
        $this->assertSame('EXPIRED', $transaction->fresh()->payment_status);
        $this->assertSame('expired', $order->fresh()->status);
        $this->assertSame('cancelled', $booking->fresh()->status);
        $firstVersion = $attempt->fresh()->lock_version;

        $this->runRecoveryAsFreshWorker();

        $this->assertSame(PaymentAttemptStatus::Expired, $attempt->fresh()->status);
        $this->assertSame($firstVersion, $attempt->fresh()->lock_version);
        $this->assertDatabaseCount('booking_orders', 1);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_due_provider_bound_attempt_fails_closed_until_provider_reconciliation(): void
    {
        [$order, $booking, $transaction] = $this->pendingBookingAggregate(
            expiresAt: now()->addMinute(),
        );
        $attempt = $this->openAttempt(
            $transaction,
            'provider-bound-lost-response',
            now()->addMinute(),
        );
        $service = app(PaymentAttemptService::class);
        $attempt = $service->transition($attempt, PaymentAttemptStatus::Creating);
        $attempt = $service->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'future_provider',
                status: PaymentAttemptStatus::Pending,
                amount: (int) $transaction->amount,
                currency: 'IDR',
                providerReference: 'provider-'.$attempt->public_id,
                providerTransactionId: 'remote-'.$attempt->public_id,
                expiresAt: now()->addMinute(),
            ),
        );

        Carbon::setTestNow(now()->addMinutes(2));
        $this->runRecoveryAsFreshWorker();

        $this->assertSame(PaymentAttemptStatus::Pending, $attempt->fresh()->status);
        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('pending', $booking->fresh()->status);
    }

    public function test_one_poisoned_candidate_does_not_starve_later_recoverable_payment(): void
    {
        [$poisonedOrder, $poisonedBooking, $poisonedTransaction] = $this->pendingBookingAggregate();
        $this->paidAttempt($poisonedTransaction, 'paid-after-hold-deadline');
        $poisonedOrder->update(['expires_at' => now()->subMinute()]);

        [$validOrder, $validBooking, $validTransaction] = $this->pendingBookingAggregate();
        $this->paidAttempt($validTransaction, 'valid-payment-after-poisoned-row');

        $exitCode = Artisan::call('payments:recover', ['--limit' => 1]);

        $this->assertSame(1, $exitCode, Artisan::output());
        $this->assertSame('UNPAID', $poisonedTransaction->fresh()->payment_status);
        $this->assertSame('pending_payment', $poisonedOrder->fresh()->status);
        $this->assertSame('pending', $poisonedBooking->fresh()->status);
        $this->assertSame('PAID', $validTransaction->fresh()->payment_status);
        $this->assertSame('paid', $validOrder->fresh()->status);
        $this->assertSame('confirmed', $validBooking->fresh()->status);
    }

    public function test_automatic_scheduler_never_downgrades_a_paid_attempt_left_by_a_restart(): void
    {
        [$booking, $transaction] = $this->legacyPendingBookingAggregate();
        $attempt = $this->paidAttempt($transaction, 'booking-crash-before-legacy-expiry-worker');

        // Reproduce the legacy worker's one-hour selector while the verified
        // provider result is ahead of the aggregate projection.
        DB::table('transactions')->where('id', $transaction->id)->update([
            'created_at' => now()->subHours(2),
            'updated_at' => now()->subHours(2),
        ]);

        $exitCode = Artisan::call('schedule:run');

        $this->assertSame(0, $exitCode, Artisan::output());
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);
        $this->assertNotSame('EXPIRED', $transaction->fresh()->payment_status);
        $this->assertNotSame('cancelled', $booking->fresh()->status);
        $this->assertDatabaseCount('booking_orders', 0);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_restart_recovers_a_paid_legacy_direct_booking_exactly_once(): void
    {
        [$booking, $transaction] = $this->legacyPendingBookingAggregate();
        $attempt = $this->paidAttempt($transaction, 'legacy-direct-booking-paid');

        $this->runRecoveryAsFreshWorker();

        $paidAt = $transaction->fresh()->paid_at?->toISOString();
        $version = $attempt->fresh()->lock_version;
        $this->assertSame('PAID', $transaction->fresh()->payment_status);
        $this->assertSame('confirmed', $booking->fresh()->status);

        $this->runRecoveryAsFreshWorker();

        $this->assertSame($paidAt, $transaction->fresh()->paid_at?->toISOString());
        $this->assertSame($version, $attempt->fresh()->lock_version);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    /**
     * Resolve the command for every run, as a restarted scheduler worker would.
     */
    private function runRecoveryAsFreshWorker(): void
    {
        $this->app->forgetInstance('App\\Services\\Payments\\PaymentRecoveryService');

        $exitCode = Artisan::call('payments:recover', ['--limit' => 100]);

        $this->assertSame(0, $exitCode, Artisan::output());
    }

    /**
     * @return array{BookingOrder, Booking, Transaction}
     */
    private function pendingBookingAggregate(?Carbon $expiresAt = null): array
    {
        $user = User::factory()->create();
        $category = FacilityCategory::query()->create([
            'name' => 'Arena restart',
            'slug' => 'arena-restart-'.Str::lower(Str::random(8)),
        ]);
        $facility = Facility::query()->create([
            'facility_category_id' => $category->id,
            'name' => 'Arena restart',
            'slug' => 'arena-restart-'.Str::lower(Str::random(8)),
            'capacity' => 1,
            'is_active' => true,
        ]);
        $order = BookingOrder::query()->create([
            'user_id' => $user->id,
            'idempotency_key' => (string) Str::uuid(),
            'request_fingerprint' => hash('sha256', (string) Str::uuid()),
            'currency' => 'IDR',
            'terms_version' => 'restart-test-v1',
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => $expiresAt ?? now()->addHour(),
        ]);
        $booking = $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '10:00',
            'end_time' => '11:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);
        $transaction = $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            'checkout_url' => '/checkout/restart-test',
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'payment_method' => 'qris',
            ],
        ]);

        return [$order, $booking, $transaction];
    }

    /**
     * The pre-order booking writer attached its transaction directly to a
     * Booking. Keep one fixture because the compatibility expiry worker still
     * scans that polymorphic shape in production data.
     *
     * @return array{Booking, Transaction}
     */
    private function legacyPendingBookingAggregate(): array
    {
        $user = User::factory()->create();
        $category = FacilityCategory::query()->create([
            'name' => 'Arena legacy restart',
            'slug' => 'arena-legacy-restart-'.Str::lower(Str::random(8)),
        ]);
        $facility = Facility::query()->create([
            'facility_category_id' => $category->id,
            'name' => 'Arena legacy restart',
            'slug' => 'arena-legacy-restart-'.Str::lower(Str::random(8)),
            'capacity' => 1,
            'is_active' => true,
        ]);
        $booking = Booking::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'booking_date' => now()->addDay()->toDateString(),
            'start_time' => '10:00',
            'end_time' => '11:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'pending',
        ]);
        $transaction = $booking->transaction()->create([
            'user_id' => $user->id,
            'amount' => 100000,
            'payment_status' => 'UNPAID',
            'checkout_url' => '/checkout/legacy-restart-test',
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking',
                'payment_method' => 'qris',
            ],
        ]);

        return [$booking, $transaction];
    }

    /**
     * @return array{Membership, Transaction}
     */
    private function pendingMembershipAggregate(): array
    {
        $user = User::factory()->create();
        $plan = MembershipPlan::query()->create([
            'name' => 'Membership restart',
            'description' => 'Paket untuk pengujian pemulihan proses.',
            'tier' => MembershipPlan::TIER_FAVORIT,
            'price' => 150000,
            'compare_at_price' => 187500,
            'duration_months' => 1,
            'features' => ['Akses gym'],
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $membership = Membership::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonthNoOverflow()->toDateString(),
            'status' => 'pending_payment',
            'created_by_id' => $user->id,
            'created_via' => 'public',
            'registration_token' => (string) Str::uuid(),
            'registration_email' => $user->email,
            'registration_phone' => '628123456789',
            'registration_gender' => 'L',
            'registration_category' => 'umum',
            'registration_expires_at' => now()->addHour(),
        ]);
        $transaction = $membership->transaction()->create([
            'user_id' => $user->id,
            'amount' => 150000,
            'payment_status' => 'UNPAID',
            'checkout_url' => '/checkout/membership/restart-test',
            'service_snapshot' => [
                'version' => 2,
                'kind' => 'membership',
                'membership_id' => $membership->id,
                'plan_id' => $plan->id,
                'plan_name' => $plan->name,
                'duration_months' => 1,
                'price' => 150000,
                'payment_method' => 'qris',
            ],
        ]);

        return [$membership, $transaction];
    }

    private function paidAttempt(Transaction $transaction, string $intent): PaymentAttempt
    {
        $attempt = $this->openAttempt($transaction, $intent, now()->addHour());
        $service = app(PaymentAttemptService::class);
        $attempt = $service->transition($attempt, PaymentAttemptStatus::Creating);

        return $service->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $transaction->amount,
                currency: 'IDR',
                providerReference: 'restart-'.$attempt->public_id,
                providerTransactionId: 'local-'.$attempt->public_id,
                metadata: ['result' => 'approved'],
            ),
        );
    }

    private function openAttempt(
        Transaction $transaction,
        string $intent,
        Carbon $expiresAt,
    ): PaymentAttempt {
        return app(PaymentAttemptService::class)->createOrResume(
            $transaction,
            $transaction->user,
            (string) Str::uuid(),
            hash('sha256', $intent),
            'IDR',
            $expiresAt,
            [
                'channel' => 'restart_test',
                'payment_method' => 'qris',
            ],
        );
    }
}
