<?php

namespace App\Services;

use App\Data\Payments\PaymentGatewayResult;
use App\Enums\PaymentAttemptStatus;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Payments\PaymentAttemptService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MembershipRegistrationService
{
    public function __construct(
        private readonly MembershipLifecycleService $lifecycle,
        private readonly PaymentAttemptService $paymentAttempts,
    ) {}

    /**
     * @param array{
     *     full_name:string,
     *     email:string,
     *     gender:string,
     *     whatsapp:string,
     *     category:string,
     *     membership_plan_id:int,
     *     idempotency_key:string
     * } $payload
     * @return array{membership:Membership,replayed:bool}
     */
    public function register(User $requestUser, array $payload): array
    {
        return DB::transaction(function () use ($requestUser, $payload): array {
            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($requestUser->id);

            /** @var Membership|null $replayed */
            $replayed = Membership::query()
                ->with(['plan', 'transaction'])
                ->where('registration_token', $payload['idempotency_key'])
                ->lockForUpdate()
                ->first();

            if ($replayed) {
                $this->assertReplayMatches($replayed, $user, $payload);

                return ['membership' => $replayed, 'replayed' => true];
            }

            /** @var MembershipPlan $plan */
            $plan = MembershipPlan::query()
                ->whereKey($payload['membership_plan_id'])
                ->where('is_active', true)
                ->where('price', '>', 0)
                ->lockForUpdate()
                ->first();

            if (! $plan) {
                throw ValidationException::withMessages([
                    'membership_plan_id' => 'Paket membership tidak tersedia atau sudah dinonaktifkan.',
                ]);
            }

            $this->supersedePendingRegistration($user);

            [$startDate, $endDate] = $this->provisionalPeriod($user, $plan);

            /** @var Membership $membership */
            $membership = Membership::query()->create([
                'user_id' => $user->id,
                'customer_name' => $payload['full_name'],
                'membership_plan_id' => $plan->id,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'status' => 'pending_payment',
                'created_by_id' => $user->id,
                'created_via' => 'public',
                'registration_token' => $payload['idempotency_key'],
                'registration_email' => $payload['email'],
                'registration_phone' => $payload['whatsapp'],
                'registration_gender' => $payload['gender'],
                'registration_category' => $payload['category'],
                'registration_expires_at' => now()->addHours($this->paymentWindowHours()),
            ]);

            $paymentExpiresAt = $membership->registration_expires_at;
            $checkoutUrl = route(
                'checkout.membership.show',
                $membership,
                absolute: false,
            );

            $membership->transaction()->create([
                'user_id' => $user->id,
                'amount' => (int) $plan->price,
                'payment_status' => 'UNPAID',
                'checkout_url' => $checkoutUrl,
                'service_snapshot' => [
                    'version' => 2,
                    'kind' => 'membership',
                    'membership_id' => $membership->id,
                    'plan_id' => $plan->id,
                    'plan_name' => $plan->name,
                    'plan_tier' => $plan->tier,
                    'plan_image_url' => $this->portableImageUrl(
                        $plan->cardImageUrl(),
                    ),
                    'plan_description' => $plan->description,
                    'public_badge' => $plan->public_badge,
                    'savings_label' => $plan->savings_label,
                    'duration_months' => (int) $plan->duration_months,
                    'price' => (int) $plan->price,
                    'compare_at_price' => max(
                        (int) $plan->price,
                        (int) ($plan->compare_at_price ?? $plan->price),
                    ),
                    'start_date' => $startDate->toDateString(),
                    'end_date' => $endDate->toDateString(),
                    'payment_expires_at' => $paymentExpiresAt->toIso8601String(),
                    'registration' => [
                        'full_name' => $payload['full_name'],
                        'email' => $payload['email'],
                        'gender' => $payload['gender'],
                        'whatsapp' => $payload['whatsapp'],
                        'category' => $payload['category'],
                    ],
                ],
            ]);

            $membership->refresh()->load(['plan', 'transaction']);
            $this->lifecycle->writeStatusHistory(
                $membership,
                'registration_submitted',
                $user,
                'user',
            );

            return ['membership' => $membership, 'replayed' => false];
        }, 3);
    }

    /**
     * @return array{membership:Membership,expired:bool}
     */
    public function pay(
        Membership $candidate,
        User $requestUser,
        string $paymentMethod,
        string $idempotencyKey,
        array $checkoutDetails = [],
    ): array {
        $result = DB::transaction(function () use (
            $candidate,
            $requestUser,
            $paymentMethod,
            $idempotencyKey,
            $checkoutDetails,
        ): array {
            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($requestUser->id);

            /** @var Membership $membership */
            $membership = Membership::query()
                ->with(['plan', 'transaction'])
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            abort_unless($membership->user_id === $user->id, 403);

            /** @var Transaction|null $transaction */
            $transaction = $membership->transaction()
                ->lockForUpdate()
                ->first();

            if (! $transaction) {
                throw ValidationException::withMessages([
                    'membership' => 'Transaksi membership tidak tersedia.',
                ]);
            }

            if ($transaction->payment_status === 'PAID'
                && $membership->status === 'active') {
                return ['membership' => $membership, 'expired' => false];
            }

            if ($membership->status === 'cancelled'
                && in_array($transaction->payment_status, ['EXPIRED', 'FAILED'], true)) {
                return ['membership' => $membership, 'expired' => true];
            }

            if ($this->isExpired($membership) || ! $membership->plan?->is_active) {
                $hasPaidAttempt = $transaction->paymentAttempts()
                    ->where('status', PaymentAttemptStatus::Paid->value)
                    ->exists();

                if ($hasPaidAttempt) {
                    throw ValidationException::withMessages([
                        'payment_method' => 'Pembayaran telah diterima dan sedang diselaraskan. Status tidak akan diturunkan atau kedaluwarsa; muat ulang halaman beberapa saat lagi.',
                    ]);
                }

                $this->paymentAttempts->expireOpenAttempts($transaction);
                $transaction->update(['payment_status' => 'EXPIRED']);
                $membership->update(['status' => 'cancelled']);
                $membership->refresh()->load(['plan', 'transaction']);
                $this->lifecycle->writeStatusHistory(
                    $membership,
                    'payment_expired',
                    $user,
                    'user',
                );

                return ['membership' => $membership, 'expired' => true];
            }

            abort_unless(
                $transaction->payment_status === 'UNPAID'
                    && $membership->status === 'pending_payment',
                403,
                'Transaksi sudah diproses.',
            );

            if ($checkoutDetails !== []) {
                $snapshot = is_array($transaction->service_snapshot)
                    ? $transaction->service_snapshot
                    : [];
                $registration = is_array($snapshot['registration'] ?? null)
                    ? $snapshot['registration']
                    : [];
                $customerName = (string) $checkoutDetails['customer_name'];
                $whatsappNumber = (string) $checkoutDetails['whatsapp_number'];

                // Only mutable contact fields are accepted at checkout. The
                // quoted plan, price, duration, account email, and membership
                // category remain immutable after registration.
                $membership->update([
                    'customer_name' => $customerName,
                    'registration_phone' => $whatsappNumber,
                ]);
                $snapshot['registration'] = [
                    ...$registration,
                    'full_name' => $customerName,
                    'whatsapp' => $whatsappNumber,
                ];
                $transaction->update(['service_snapshot' => $snapshot]);
            }

            $currency = strtoupper((string) config('services.payment.currency', 'IDR'));
            $attemptFingerprint = hash('sha256', json_encode([
                'version' => 1,
                'kind' => 'membership_payment',
                'membership_id' => (int) $membership->id,
                'transaction_id' => (int) $transaction->id,
                'amount' => (int) $transaction->amount,
                'currency' => $currency,
                'payment_method' => $paymentMethod,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            $attempt = $this->paymentAttempts->createOrResume(
                $transaction,
                $user,
                $idempotencyKey,
                $attemptFingerprint,
                $currency,
                $membership->registration_expires_at,
                [
                    'channel' => 'local_mock',
                    'payment_method' => $paymentMethod,
                    'subject_kind' => 'membership',
                ],
            );

            if ($attempt->status === PaymentAttemptStatus::Draft) {
                $attempt = $this->paymentAttempts->transition(
                    $attempt,
                    PaymentAttemptStatus::Creating,
                );
            }

            if (in_array($attempt->status, [
                PaymentAttemptStatus::Creating,
                PaymentAttemptStatus::Pending,
                PaymentAttemptStatus::Reconciling,
            ], true)) {
                $attempt = $this->paymentAttempts->applyGatewayResult(
                    $attempt,
                    new PaymentGatewayResult(
                        provider: 'local_mock',
                        status: PaymentAttemptStatus::Paid,
                        amount: (int) $transaction->amount,
                        currency: $currency,
                        providerReference: 'membership-'.$membership->id.'-'.$attempt->public_id,
                        providerTransactionId: 'local-'.$attempt->public_id,
                        metadata: ['result' => 'approved'],
                    ),
                );
            }

            if ($attempt->status !== PaymentAttemptStatus::Paid) {
                throw ValidationException::withMessages([
                    'payment_method' => 'Percobaan pembayaran ini sudah berakhir. Pilih metode pembayaran dan coba kembali.',
                ]);
            }

            $membership = $this->lifecycle->confirmPayment(
                $membership,
                $paymentMethod,
                $user,
                'user',
            );

            return ['membership' => $membership, 'expired' => false];
        }, 3);

        return $result;
    }

    private function supersedePendingRegistration(User $user): void
    {
        $pending = Membership::query()
            ->with(['plan', 'transaction'])
            ->where('user_id', $user->id)
            ->where('status', 'pending_payment')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($pending as $membership) {
            $transaction = $membership->transaction;

            if ($transaction) {
                $this->paymentAttempts->guardAndTerminateOpenAttempts(
                    $transaction,
                    PaymentAttemptStatus::Cancelled,
                    'membership_plan_id',
                );
                $transaction->refresh();

                if ($transaction->payment_status === 'PAID') {
                    continue;
                }

                if ($transaction->payment_status === 'UNPAID') {
                    $transaction->update(['payment_status' => 'FAILED']);
                }
            }

            $membership->update(['status' => 'cancelled']);
            $membership->refresh()->load(['plan', 'transaction']);
            $this->lifecycle->writeStatusHistory(
                $membership,
                'registration_superseded',
                $user,
                'user',
            );
        }
    }

    /**
     * @return array{0:Carbon,1:Carbon}
     */
    private function provisionalPeriod(User $user, MembershipPlan $plan): array
    {
        $startDate = now()->startOfDay();

        $latestPaidEnd = Membership::query()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->whereHas(
                'transaction',
                fn ($query) => $query->where('payment_status', 'PAID'),
            )
            ->orderByDesc('end_date')
            ->lockForUpdate()
            ->value('end_date');

        if ($latestPaidEnd) {
            $afterLatest = Carbon::parse($latestPaidEnd)->startOfDay()->addDay();
            if ($afterLatest->greaterThan($startDate)) {
                $startDate = $afterLatest;
            }
        }

        return [
            $startDate,
            $startDate->copy()->addMonthsNoOverflow((int) $plan->duration_months),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function assertReplayMatches(
        Membership $membership,
        User $user,
        array $payload,
    ): void {
        $matches = $membership->user_id === $user->id
            && $membership->membership_plan_id === (int) $payload['membership_plan_id']
            && $membership->customer_name === $payload['full_name']
            && mb_strtolower((string) $membership->registration_email) === mb_strtolower($payload['email'])
            && $membership->registration_phone === $payload['whatsapp']
            && $membership->registration_gender === $payload['gender']
            && $membership->registration_category === $payload['category'];

        if (! $matches) {
            throw ValidationException::withMessages([
                'idempotency_key' => 'Identitas permintaan ini sudah dipakai untuk data pendaftaran yang berbeda.',
            ]);
        }
    }

    private function isExpired(Membership $membership): bool
    {
        return $membership->registration_expires_at !== null
            && now()->greaterThanOrEqualTo($membership->registration_expires_at);
    }

    private function paymentWindowHours(): int
    {
        return max(
            1,
            min(168, (int) config('services.payment.membership_window_hours', 24)),
        );
    }

    private function portableImageUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        $path = parse_url($url, PHP_URL_PATH);

        if (is_string($path) && str_starts_with($path, '/storage/')) {
            return $path;
        }

        return $url;
    }
}
