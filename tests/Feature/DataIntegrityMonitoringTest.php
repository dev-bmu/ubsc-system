<?php

namespace Tests\Feature;

use App\Enums\PaymentAttemptStatus;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\Membership;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Monitoring\DataIntegrityMonitor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

class DataIntegrityMonitoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse(
            '2026-08-18 10:00:00',
            config('app.timezone'),
        ));
        Cache::flush();
        config()->set('data_integrity.sample_limit', 2);
        config()->set('data_integrity.stale_after_seconds', 600);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        Cache::flush();

        parent::tearDown();
    }

    public function test_empty_scan_publishes_a_stable_cached_contract(): void
    {
        $monitor = app(DataIntegrityMonitor::class);

        $unavailable = $monitor->summary();
        $this->assertFalse($unavailable['available']);
        $this->assertTrue($unavailable['is_stale']);
        $this->assertSame('unavailable', $unavailable['status']);
        $this->assertSame(
            ['bookings', 'memberships', 'payments'],
            array_keys($unavailable['domains']),
        );

        $snapshot = $monitor->refresh();

        $this->assertSame(1, $snapshot['schema_version']);
        $this->assertSame('healthy', $snapshot['status']);
        $this->assertFalse($snapshot['is_stale']);
        $this->assertGreaterThan(0, $snapshot['totals']['checks']);
        $this->assertSame(0, $snapshot['totals']['violations']);
        $this->assertSame([], $snapshot['action_queue']);
        $this->assertSame(
            ['bookings', 'memberships', 'payments'],
            array_keys($snapshot['domains']),
        );

        foreach ($snapshot['domains'] as $domain) {
            $this->assertSame('healthy', $domain['status']);
            $this->assertSame(0, $domain['violations']);
        }

        $latest = $monitor->latest();
        $summary = $monitor->summary();
        $queue = $monitor->actionQueue();

        $this->assertSame($snapshot['scan_id'], $latest['scan_id']);
        $this->assertTrue($summary['available']);
        $this->assertSame('healthy', $summary['status']);
        $this->assertTrue($queue['available']);
        $this->assertSame(0, $queue['total']);
        $this->assertSame([], $queue['items']);
    }

    public function test_booking_integrity_scan_matches_exclusive_and_shared_capacity_semantics(): void
    {
        $date = '2026-08-20';
        $exclusive = $this->facility();

        foreach (['Arena Satu', 'Arena Dua'] as $name) {
            Booking::query()->create([
                'customer_name' => $name,
                'facility_id' => $exclusive->id,
                'booking_date' => $date,
                'start_time' => '10:00',
                'end_time' => '11:00',
                'pax' => 1,
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
        }

        $classCategory = FacilityCategory::query()->create([
            'name' => 'Kelas & Kebugaran',
            'slug' => 'kelas-kebugaran-'.Str::lower(Str::random(8)),
        ]);
        $sharedClass = Facility::query()->create([
            'facility_category_id' => $classCategory->id,
            'name' => 'Integrity Shared Class',
            'slug' => 'integrity-shared-class-'.Str::lower(Str::random(8)),
            'capacity' => 2,
            'is_active' => true,
            'reservation_method' => 'website',
        ]);

        foreach (['Peserta Satu', 'Peserta Dua'] as $name) {
            Booking::query()->create([
                'customer_name' => $name,
                'facility_id' => $sharedClass->id,
                'booking_date' => $date,
                'start_time' => '10:00',
                'end_time' => '11:00',
                'pax' => 1,
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
        }

        $unitClass = Facility::query()->create([
            'facility_category_id' => $classCategory->id,
            'name' => 'Integrity Unit Class',
            'slug' => 'integrity-unit-class-'.Str::lower(Str::random(8)),
            'capacity' => 1,
            'is_active' => true,
            'reservation_method' => 'website',
        ]);
        $unitOne = $unitClass->units()->create(['name' => 'Studio Satu', 'is_active' => true]);
        $unitTwo = $unitClass->units()->create(['name' => 'Studio Dua', 'is_active' => true]);

        foreach ([[$unitOne->id, 'Studio Satu'], [$unitTwo->id, 'Studio Dua']] as [$unitId, $name]) {
            Booking::query()->create([
                'customer_name' => $name,
                'facility_id' => $unitClass->id,
                'facility_unit_id' => $unitId,
                'booking_date' => $date,
                'start_time' => '10:00',
                'end_time' => '11:00',
                'pax' => 1,
                'subtotal_price' => 100000,
                'status' => 'confirmed',
            ]);
        }

        $snapshot = app(DataIntegrityMonitor::class)->refresh();
        $this->assertSame(
            1,
            $this->check($snapshot, 'booking.confirmed_resource_collision')['count'],
        );
        $this->assertSame(
            0,
            $this->check($snapshot, 'booking.confirmed_capacity_exceeded')['count'],
        );

        Booking::query()->create([
            'customer_name' => 'Peserta Melebihi Kapasitas',
            'facility_id' => $unitClass->id,
            'facility_unit_id' => $unitOne->id,
            'booking_date' => $date,
            'start_time' => '10:00',
            'end_time' => '11:00',
            'pax' => 1,
            'subtotal_price' => 100000,
            'status' => 'confirmed',
        ]);

        $oversold = app(DataIntegrityMonitor::class)->refresh();
        $this->assertGreaterThan(
            0,
            $this->check($oversold, 'booking.confirmed_capacity_exceeded')['count'],
        );
        $this->assertSame(
            1,
            $this->check($oversold, 'booking.confirmed_resource_collision')['count'],
        );
    }

    public function test_paid_split_state_is_detected_cached_and_never_mutated(): void
    {
        [$order, $booking, $transaction, $attempt] = $this->pendingOrderWithPaidAttempt();
        $monitor = app(DataIntegrityMonitor::class);

        $snapshot = $monitor->refresh();

        $this->assertSame('critical', $snapshot['status']);
        $this->assertSame(
            1,
            $this->check($snapshot, 'booking.settled_order_projection_pending')['count'],
        );
        $this->assertSame(
            'safe_candidate',
            $this->check($snapshot, 'booking.settled_order_projection_pending')['reconciliation'],
        );
        $this->assertSame(
            1,
            $this->check($snapshot, 'payment.paid_attempt_not_projected')['count'],
        );
        $this->assertSame(
            [['record_id' => $attempt->id, 'related_record_id' => $transaction->id]],
            $this->check($snapshot, 'payment.paid_attempt_not_projected')['samples'],
        );

        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('pending', $booking->fresh()->status);
        $this->assertSame('UNPAID', $transaction->fresh()->payment_status);
        $this->assertSame(PaymentAttemptStatus::Paid, $attempt->fresh()->status);

        $cached = $monitor->actionQueue();
        $this->assertTrue($cached['available']);
        $this->assertGreaterThanOrEqual(2, $cached['total']);
        $this->assertSame(
            'booking.settled_order_projection_pending',
            $cached['items'][0]['key'],
        );

        $serialized = json_encode($cached, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($order->customer_name, $serialized);
        $this->assertStringNotContainsString($order->user->email, $serialized);
    }

    public function test_membership_overlap_lifecycle_lag_and_samples_are_bounded(): void
    {
        config()->set('data_integrity.sample_limit', 1);
        $user = User::factory()->create();
        $first = $this->paidMembership(
            $user,
            '2026-07-01',
            '2026-08-17',
        );
        $second = $this->paidMembership(
            $user,
            '2026-08-01',
            '2026-09-01',
        );

        $snapshot = app(DataIntegrityMonitor::class)->refresh();
        $overlap = $this->check($snapshot, 'membership.active_period_overlap');
        $expiry = $this->check($snapshot, 'membership.lifecycle_expiry_due');
        $history = $this->check($snapshot, 'membership.history_missing');

        $this->assertSame(1, $overlap['count']);
        $this->assertSame(
            [['record_id' => $first->id, 'related_record_id' => $second->id]],
            $overlap['samples'],
        );
        $this->assertSame(1, $expiry['count']);
        $this->assertSame('safe_candidate', $expiry['reconciliation']);
        $this->assertSame(2, $history['count']);
        $this->assertCount(1, $history['samples']);

        $this->assertSame('active', $first->fresh()->status);
        $this->assertSame('active', $second->fresh()->status);
        $this->assertDatabaseCount('membership_histories', 0);
    }

    public function test_latest_reads_the_cache_until_an_explicit_refresh_and_reports_staleness(): void
    {
        $monitor = app(DataIntegrityMonitor::class);
        $healthy = $monitor->refresh();
        $user = User::factory()->create();

        Membership::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'start_date' => '2026-09-02',
            'end_date' => '2026-09-01',
            'status' => 'active',
            'created_via' => 'test',
        ]);

        $this->assertSame('healthy', $monitor->latest()['status']);
        $this->assertSame($healthy['scan_id'], $monitor->latest()['scan_id']);

        Carbon::setTestNow(now()->addMinutes(11));
        $this->assertTrue($monitor->latest()['is_stale']);

        $refreshed = $monitor->refresh();
        $this->assertSame('critical', $refreshed['status']);
        $this->assertSame(
            1,
            $this->check($refreshed, 'membership.invalid_date_range')['count'],
        );
    }

    public function test_command_refreshes_cache_and_supports_alert_threshold_exit_codes(): void
    {
        $this->pendingOrderWithPaidAttempt();

        $exitCode = Artisan::call('monitor:data-integrity', [
            '--json' => true,
            '--fail-on' => 'never',
        ]);

        $this->assertSame(0, $exitCode);
        $payload = json_decode(trim(Artisan::output()), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('critical', $payload['status']);
        $this->assertTrue(app(DataIntegrityMonitor::class)->summary()['available']);

        $this->assertSame(1, Artisan::call('monitor:data-integrity', [
            '--fail-on' => 'critical',
            '--quiet' => true,
        ]));
        $this->assertSame(2, Artisan::call('monitor:data-integrity', [
            '--fail-on' => 'unsupported',
        ]));
    }

    /**
     * @return array{BookingOrder,Booking,Transaction,PaymentAttempt}
     */
    private function pendingOrderWithPaidAttempt(): array
    {
        $user = User::factory()->create();
        $facility = $this->facility();
        $order = BookingOrder::query()->create([
            'user_id' => $user->id,
            'idempotency_key' => (string) Str::uuid(),
            'request_fingerprint' => hash('sha256', 'integrity-order'),
            'currency' => 'IDR',
            'terms_version' => 'test-v1',
            'customer_name' => 'Integrity Probe Customer',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addMinutes(30),
        ]);
        $booking = $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => $order->customer_name,
            'facility_id' => $facility->id,
            'booking_date' => '2026-08-20',
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
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
            ],
        ]);
        $attempt = PaymentAttempt::query()->create([
            'transaction_id' => $transaction->id,
            'user_id' => $user->id,
            'attempt_number' => 1,
            'idempotency_key' => (string) Str::uuid(),
            'request_fingerprint' => hash('sha256', 'integrity-attempt'),
            'amount' => 106000,
            'currency' => 'IDR',
            'status' => PaymentAttemptStatus::Paid,
            'provider' => 'test',
            'provider_reference' => 'integrity-ref-'.$transaction->id,
            'provider_transaction_id' => 'integrity-transaction-'.$transaction->id,
            'paid_at' => now(),
        ]);

        $order->setRelation('user', $user);

        return [$order, $booking, $transaction, $attempt];
    }

    private function paidMembership(
        User $user,
        string $startDate,
        string $endDate,
    ): Membership {
        $membership = Membership::query()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'status' => 'active',
            'created_via' => 'test',
        ]);
        $membership->transaction()->create([
            'user_id' => $user->id,
            'amount' => 150000,
            'payment_status' => 'PAID',
            'payment_method' => 'test',
            'paid_at' => now(),
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'membership',
            ],
        ]);

        return $membership;
    }

    private function facility(): Facility
    {
        $category = FacilityCategory::query()->create([
            'name' => 'Integrity Probe',
            'slug' => 'integrity-probe-'.Str::lower(Str::random(8)),
        ]);

        return Facility::query()->create([
            'facility_category_id' => $category->id,
            'name' => 'Integrity Probe Facility',
            'slug' => 'integrity-facility-'.Str::lower(Str::random(8)),
            'capacity' => 1,
            'is_active' => true,
            'reservation_method' => 'website',
        ]);
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function check(array $snapshot, string $key): array
    {
        $check = collect($snapshot['checks'])->firstWhere('key', $key);
        $this->assertIsArray($check, "Missing data-integrity check [{$key}].");

        return $check;
    }
}
