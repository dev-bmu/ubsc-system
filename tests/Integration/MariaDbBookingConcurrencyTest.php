<?php

namespace Tests\Integration;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\BookingSchedule;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Payments\PaymentAttemptService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class MariaDbBookingConcurrencyTest extends TestCase
{
    #[DataProvider('exclusiveSlotRaceRounds')]
    public function test_real_mariadb_connections_cannot_hold_the_same_exclusive_slot(
        int $contenderCount,
    ): void {
        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->fail('Concurrency gate requires a real isolated MariaDB/MySQL connection.');
        }

        $databaseName = (string) DB::connection()->getDatabaseName();
        if (! preg_match('/\Aubsc_race_[a-z0-9_]+\z/', $databaseName)) {
            $this->fail('Concurrency probe refused: database name must use the ubsc_race_ prefix.');
        }

        $engine = strtolower((string) DB::selectOne('select version() as version')->version);
        $this->assertStringContainsString('mariadb', $engine);

        $suffix = strtolower(Str::random(12));
        $date = now()->addYears(8)->startOfMonth()->addDays(9);
        $category = FacilityCategory::query()->create([
            'name' => 'Concurrency '.$suffix,
            'slug' => 'concurrency-'.$suffix,
        ]);
        $facility = Facility::query()->create([
            'facility_category_id' => $category->id,
            'name' => 'Exclusive concurrency '.$suffix,
            'slug' => 'exclusive-concurrency-'.$suffix,
            'capacity' => 1,
            'active_slots' => [$date->format('l') => ['10:00']],
            'is_active' => true,
        ]);
        $facility->prices()->create([
            'user_category' => 'umum',
            'label' => 'Concurrency probe',
            'price' => 100000,
            'duration_minutes' => 60,
            'schedule_type' => 'regular',
            'sort_order' => 0,
        ]);
        $schedule = BookingSchedule::query()->create([
            'month' => $date->month,
            'year' => $date->year,
            'is_open' => true,
            'closed_dates' => [],
        ]);
        $users = User::factory()->count($contenderCount)->create();
        $keys = collect(range(1, $contenderCount))
            ->map(static fn (): string => (string) Str::uuid())
            ->all();
        $barrier = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-race-'.Str::uuid();
        $processes = [];

        try {
            foreach ($users as $index => $user) {
                $payload = base64_encode(json_encode([
                    'user_id' => $user->id,
                    'request' => [
                        'idempotency_key' => $keys[$index],
                        'items' => [[
                            'facility_id' => $facility->id,
                            'facility_unit_id' => null,
                            'booking_date' => $date->toDateString(),
                            'start_time' => '10:00',
                            'end_time' => '11:00',
                        ]],
                        'customer_name' => $user->name,
                        'whatsapp_number' => '081234567890',
                        'identity_category' => 'umum',
                    ],
                ], JSON_THROW_ON_ERROR));

                $process = new Process([
                    PHP_BINARY,
                    base_path('tests/Support/run-booking-checkout-race.php'),
                    $barrier,
                    $payload,
                ], base_path(), null, null, 45);
                $process->start();
                $processes[] = $process;
            }

            usleep(250_000);
            touch($barrier);

            $results = collect($processes)->map(function (Process $process): array {
                $process->wait();
                $this->assertTrue(
                    $process->isSuccessful(),
                    trim($process->getErrorOutput() ?: $process->getOutput()),
                );

                return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            });

            $diagnostic = $results->toJson(JSON_UNESCAPED_SLASHES);
            $this->assertSame(
                1,
                $results->where('result', 'created')->count(),
                $diagnostic,
            );
            $this->assertSame(
                $contenderCount - 1,
                $results->where('result', 'conflict')->count(),
                $diagnostic,
            );
            $this->assertSame(
                1,
                BookingOrder::query()->whereIn('idempotency_key', $keys)->count(),
            );
            $this->assertSame(
                1,
                Booking::query()
                    ->where('facility_id', $facility->id)
                    ->whereDate('booking_date', $date->toDateString())
                    ->whereTime('start_time', '<', '11:00')
                    ->whereTime('end_time', '>', '10:00')
                    ->whereIn('status', ['pending', 'confirmed'])
                    ->count(),
            );
        } finally {
            if (is_file($barrier)) {
                unlink($barrier);
            }

            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop(1);
                }
            }

            DB::transaction(function () use ($facility, $category, $schedule, $users, $keys): void {
                $orders = BookingOrder::query()
                    ->whereIn('idempotency_key', $keys)
                    ->get();
                Transaction::query()
                    ->where('transactionable_type', BookingOrder::class)
                    ->whereIn('transactionable_id', $orders->pluck('id'))
                    ->delete();
                Booking::query()->whereIn('booking_order_id', $orders->pluck('id'))->delete();
                BookingOrder::query()->whereIn('id', $orders->pluck('id'))->delete();
                $facility->prices()->delete();
                $facility->delete();
                $category->delete();
                $schedule->delete();
                User::query()->whereIn('id', $users->pluck('id'))->delete();
            }, 3);
        }
    }

    /**
     * A deliberately small burst: enough repetition to expose stale-snapshot,
     * lock-order and retry regressions without turning CI into a load test.
     *
     * @return array<string, array{int}>
     */
    public static function exclusiveSlotRaceRounds(): array
    {
        return [
            'round 1 - two contenders' => [2],
            'round 2 - three contenders' => [3],
            'round 3 - two contenders' => [2],
        ];
    }

    public function test_real_mariadb_connections_create_only_one_payment_attempt_for_a_replayed_intent(): void
    {
        $this->assertIsolatedMariaDb();

        $user = User::factory()->create();
        $order = BookingOrder::query()->create([
            'user_id' => $user->id,
            'idempotency_key' => (string) Str::uuid(),
            'request_fingerprint' => hash('sha256', (string) Str::uuid()),
            'currency' => 'IDR',
            'terms_version' => 'concurrency-v1',
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);
        $transaction = $order->transaction()->create([
            'user_id' => $user->id,
            'amount' => 106000,
            'payment_status' => 'UNPAID',
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'booking_order',
                'payment_method' => 'qris',
            ],
        ]);
        $idempotencyKey = (string) Str::uuid();
        $fingerprint = hash('sha256', 'concurrent-payment-'.$transaction->id);

        try {
            $results = $this->runPaymentRace([
                'operation' => 'create_payment_attempt',
                'transaction_id' => $transaction->id,
                'user_id' => $user->id,
                'idempotency_key' => $idempotencyKey,
                'request_fingerprint' => $fingerprint,
            ], 3);

            $diagnostic = $results->toJson(JSON_UNESCAPED_SLASHES);
            $this->assertSame(3, $results->where('result', 'attempt_created_or_resumed')->count(), $diagnostic);
            $this->assertCount(1, $results->pluck('attempt_id')->unique(), $diagnostic);
            $this->assertCount(1, $results->pluck('attempt_number')->unique(), $diagnostic);
            $this->assertSame(
                1,
                PaymentAttempt::query()
                    ->where('transaction_id', $transaction->id)
                    ->where('idempotency_key', $idempotencyKey)
                    ->count(),
            );
        } finally {
            PaymentAttempt::query()->where('transaction_id', $transaction->id)->delete();
            $transaction->delete();
            $order->delete();
            $user->delete();
        }
    }

    public function test_real_mariadb_connections_recover_one_paid_booking_projection_exactly_once(): void
    {
        $this->assertIsolatedMariaDb();

        [$user, $category, $facility, $order, $booking, $transaction] =
            $this->pendingBookingRecoveryAggregate();
        $attempt = $this->paidAttempt($transaction, 'booking-recovery');

        try {
            $results = $this->runPaymentRace([
                'operation' => 'recover_booking_order',
                'booking_order_id' => $order->id,
            ], 3);

            $diagnostic = $results->toJson(JSON_UNESCAPED_SLASHES);
            $this->assertSame(1, $results->where('result', 'recovered')->count(), $diagnostic);
            $this->assertSame(2, $results->where('result', 'already_recovered')->count(), $diagnostic);
            $this->assertSame('paid', $order->fresh()->status);
            $this->assertSame('confirmed', $booking->fresh()->status);
            $this->assertSame('PAID', $transaction->fresh()->payment_status);
            $this->assertNotNull($transaction->fresh()->paid_at);
            $this->assertSame(1, Booking::query()->whereKey($booking->id)->count());
            $this->assertSame(1, PaymentAttempt::query()->whereKey($attempt->id)->count());
        } finally {
            PaymentAttempt::query()->where('transaction_id', $transaction->id)->delete();
            $transaction->delete();
            $booking->delete();
            $order->delete();
            $facility->delete();
            $category->delete();
            $user->delete();
        }
    }

    public function test_real_mariadb_connections_recover_membership_without_double_entitlement(): void
    {
        $this->assertIsolatedMariaDb();

        [$user, $plan, $membership, $transaction] = $this->pendingMembershipRecoveryAggregate();
        $attempt = $this->paidAttempt($transaction, 'membership-recovery');

        try {
            $results = $this->runPaymentRace([
                'operation' => 'recover_membership',
                'membership_id' => $membership->id,
            ], 3);

            $diagnostic = $results->toJson(JSON_UNESCAPED_SLASHES);
            $this->assertSame(3, $results->count(), $diagnostic);
            $this->assertSame(1, $results->where('result', 'recovered')->count(), $diagnostic);
            $this->assertSame(2, $results->where('result', 'already_recovered')->count(), $diagnostic);
            $this->assertSame('active', $membership->fresh()->status);
            $this->assertSame('PAID', $transaction->fresh()->payment_status);
            $this->assertNotNull($transaction->fresh()->paid_at);
            $this->assertSame(
                1,
                Membership::query()
                    ->where('registration_token', $membership->registration_token)
                    ->where('status', 'active')
                    ->count(),
            );
            $this->assertSame(
                1,
                $membership->histories()
                    ->where('action', 'payment_confirmed')
                    ->count(),
            );
            $this->assertSame(1, PaymentAttempt::query()->whereKey($attempt->id)->count());
        } finally {
            $membership->histories()->delete();
            PaymentAttempt::query()->where('transaction_id', $transaction->id)->delete();
            $transaction->delete();
            $membership->delete();
            $plan->delete();
            $user->delete();
        }
    }

    /**
     * @param  array<string, int|string>  $payload
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function runPaymentRace(array $payload, int $contenderCount)
    {
        $barrier = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-payment-race-'.Str::uuid();
        $encodedPayload = base64_encode(json_encode($payload, JSON_THROW_ON_ERROR));
        $processes = [];

        try {
            foreach (range(1, $contenderCount) as $_) {
                $process = new Process([
                    PHP_BINARY,
                    base_path('tests/Support/run-payment-concurrency-race.php'),
                    $barrier,
                    $encodedPayload,
                ], base_path(), null, null, 45);
                $process->start();
                $processes[] = $process;
            }

            usleep(250_000);
            touch($barrier);

            return collect($processes)->map(function (Process $process): array {
                $process->wait();
                $this->assertTrue(
                    $process->isSuccessful(),
                    trim($process->getErrorOutput() ?: $process->getOutput()),
                );

                return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            });
        } finally {
            if (is_file($barrier)) {
                unlink($barrier);
            }

            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop(1);
                }
            }
        }
    }

    private function assertIsolatedMariaDb(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->fail('Concurrency gate requires a real isolated MariaDB/MySQL connection.');
        }

        $databaseName = (string) DB::connection()->getDatabaseName();
        if (! preg_match('/\Aubsc_race_[a-z0-9_]+\z/', $databaseName)) {
            $this->fail('Concurrency probe refused: database name must use the ubsc_race_ prefix.');
        }

        $engine = strtolower((string) DB::selectOne('select version() as version')->version);
        $this->assertStringContainsString('mariadb', $engine);
    }

    /**
     * @return array{User, FacilityCategory, Facility, BookingOrder, Booking, Transaction}
     */
    private function pendingBookingRecoveryAggregate(): array
    {
        $user = User::factory()->create();
        $suffix = strtolower(Str::random(12));
        $category = FacilityCategory::query()->create([
            'name' => 'Recovery '.$suffix,
            'slug' => 'recovery-'.$suffix,
        ]);
        $facility = Facility::query()->create([
            'facility_category_id' => $category->id,
            'name' => 'Recovery '.$suffix,
            'slug' => 'recovery-'.$suffix,
            'capacity' => 1,
            'is_active' => true,
        ]);
        $order = BookingOrder::query()->create([
            'user_id' => $user->id,
            'idempotency_key' => (string) Str::uuid(),
            'request_fingerprint' => hash('sha256', (string) Str::uuid()),
            'currency' => 'IDR',
            'terms_version' => 'concurrency-v1',
            'customer_name' => $user->name,
            'whatsapp_number' => '628123456789',
            'identity_category' => 'umum',
            'subtotal_amount' => 100000,
            'transaction_fee' => 6000,
            'discount_amount' => 0,
            'total_amount' => 106000,
            'status' => 'pending_payment',
            'expires_at' => now()->addHour(),
        ]);
        $booking = $order->bookings()->create([
            'user_id' => $user->id,
            'customer_name' => $user->name,
            'facility_id' => $facility->id,
            'booking_date' => now()->addDays(2)->toDateString(),
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
                'payment_method' => 'qris',
            ],
        ]);

        return [$user, $category, $facility, $order, $booking, $transaction];
    }

    /**
     * @return array{User, MembershipPlan, Membership, Transaction}
     */
    private function pendingMembershipRecoveryAggregate(): array
    {
        $user = User::factory()->create();
        $suffix = strtolower(Str::random(12));
        $plan = MembershipPlan::query()->create([
            'name' => 'Concurrency '.$suffix,
            'description' => 'Concurrent payment recovery probe.',
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
            'membership_plan_id' => $plan->id,
            'customer_name' => $user->name,
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
            'service_snapshot' => [
                'version' => 2,
                'kind' => 'membership',
                'membership_id' => $membership->id,
                'plan_id' => $plan->id,
                'plan_name' => $plan->name,
                'duration_months' => 1,
                'price' => 150000,
                'currency' => 'IDR',
                'payment_method' => 'qris',
            ],
        ]);

        return [$user, $plan, $membership, $transaction];
    }

    private function paidAttempt(Transaction $transaction, string $scope): PaymentAttempt
    {
        $service = app(PaymentAttemptService::class);
        $attempt = $service->createOrResume(
            $transaction,
            $transaction->user,
            (string) Str::uuid(),
            hash('sha256', $scope.'-'.$transaction->id),
            expiresAt: now()->addHour(),
            metadata: ['payment_method' => 'qris'],
        );
        $attempt = $service->transition($attempt, PaymentAttemptStatus::Creating);

        return $service->applyGatewayResult(
            $attempt,
            new PaymentGatewayResult(
                provider: 'local_mock',
                status: PaymentAttemptStatus::Paid,
                amount: (int) $transaction->amount,
                currency: 'IDR',
                providerReference: $scope.'-'.$attempt->public_id,
                providerTransactionId: 'transaction-'.$attempt->public_id,
                metadata: ['payment_method' => 'qris'],
            ),
        );
    }
}
