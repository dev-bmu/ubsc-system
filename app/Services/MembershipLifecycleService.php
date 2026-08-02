<?php

namespace App\Services;

use App\Enums\PaymentAttemptStatus;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\PaymentAttempt;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Payments\PaymentAttemptService;
use App\Services\Payments\PaymentOperationalLogger;
use DateTimeInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MembershipLifecycleService
{
    public function __construct(
        private readonly PaymentAttemptService $paymentAttempts,
        private readonly PaymentOperationalLogger $operationalLog,
    ) {}

    /**
     * @param array{
     *     user_id?: int|null,
     *     customer_name?: string|null,
     *     membership_plan_id?: int|null,
     *     start_date: string,
     *     end_date?: string|null,
     *     amount?: int|string|null,
     *     source?: string|null,
     *     actor?: User|null
     * } $payload
     */
    public function create(array $payload): Membership
    {
        return DB::transaction(function () use ($payload) {
            $plan = $this->resolvePlan($payload['membership_plan_id'] ?? null);
            $startDate = Carbon::parse($payload['start_date'])->startOfDay();
            $endDate = $this->resolveEndDate($startDate, $plan, $payload['end_date'] ?? null);
            $amount = $this->resolveAmount($plan, $payload['amount'] ?? null);
            $userId = $payload['user_id'] ?? null;

            if ($userId) {
                User::query()->lockForUpdate()->findOrFail($userId);
            }

            $this->ensureNoOverlappingActiveMembership($userId, $startDate, $endDate);

            $membership = Membership::create([
                'user_id' => $userId,
                'customer_name' => $payload['customer_name'] ?? null,
                'membership_plan_id' => $plan?->id,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'status' => 'active',
                'created_by_id' => ($payload['actor'] ?? null)?->id,
                'created_via' => $payload['source'] ?? 'admin',
            ]);

            $transaction = $this->createTransaction($membership, $userId, $amount);
            $this->writeHistory($membership, $transaction, 'created', $payload['actor'] ?? null, $payload['source'] ?? 'admin');

            return $membership;
        });
    }

    /**
     * @param array{
     *     membership_plan_id?: int|null,
     *     amount?: int|string|null,
     *     source?: string|null,
     *     actor?: User|null
     * } $payload
     */
    public function renew(Membership $sourceMembership, array $payload): Membership
    {
        return DB::transaction(function () use ($sourceMembership, $payload) {
            if ($sourceMembership->user_id) {
                User::query()->lockForUpdate()->findOrFail($sourceMembership->user_id);
            }

            /** @var Membership $sourceMembership */
            $sourceMembership = Membership::query()
                ->with('plan')
                ->lockForUpdate()
                ->findOrFail($sourceMembership->id);

            /** @var Transaction|null $sourceTransaction */
            $sourceTransaction = $sourceMembership->transaction()
                ->lockForUpdate()
                ->first();

            if (! in_array($sourceMembership->status, ['active', 'expired'], true)
                || $sourceTransaction?->payment_status !== 'PAID') {
                throw ValidationException::withMessages([
                    'membership' => 'Hanya membership yang sudah dibayar dan sah yang dapat diperpanjang.',
                ]);
            }

            $renewalTail = $sourceMembership;

            if ($sourceMembership->user_id) {
                /** @var Membership|null $latestPaidTail */
                $latestPaidTail = Membership::query()
                    ->where('user_id', $sourceMembership->user_id)
                    ->whereIn('status', ['active', 'expired'])
                    ->whereHas(
                        'transaction',
                        fn ($query) => $query->where('payment_status', 'PAID'),
                    )
                    ->orderByDesc('end_date')
                    ->orderByDesc('id')
                    ->lockForUpdate()
                    ->first();

                $renewalTail = $latestPaidTail ?? $sourceMembership;
            }

            $plan = $this->resolvePlan($payload['membership_plan_id'] ?? $sourceMembership->membership_plan_id);
            $startDate = now()->startOfDay();
            $afterPaidTail = $renewalTail->end_date->copy()->addDay()->startOfDay();

            if ($afterPaidTail->greaterThan($startDate)) {
                $startDate = $afterPaidTail;
            }

            $endDate = $this->resolveEndDate($startDate, $plan, null);
            $amount = $this->resolveAmount($plan, $payload['amount'] ?? null);

            $this->ensureNoOverlappingActiveMembership(
                $sourceMembership->user_id,
                $startDate,
                $endDate,
            );

            $renewal = Membership::create([
                'user_id' => $sourceMembership->user_id,
                'customer_name' => $renewalTail->customer_name ?? $sourceMembership->customer_name,
                'membership_plan_id' => $plan?->id,
                'renewed_from_membership_id' => $renewalTail->id,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'status' => 'active',
                'created_by_id' => ($payload['actor'] ?? null)?->id,
                'created_via' => $payload['source'] ?? 'admin',
            ]);

            $transaction = $this->createTransaction($renewal, $sourceMembership->user_id, $amount);
            $this->writeHistory($renewal, $transaction, 'renewed', $payload['actor'] ?? null, $payload['source'] ?? 'admin');

            return $renewal;
        });
    }

    /**
     * Activate a pending membership after payment. The quoted amount and
     * duration come from the immutable transaction snapshot; edits to a plan
     * after registration never silently alter an existing purchase.
     */
    public function confirmPayment(
        Membership $candidate,
        string $paymentMethod,
        ?User $actor = null,
        string $actorType = 'admin',
    ): Membership {
        return DB::transaction(function () use (
            $candidate,
            $paymentMethod,
            $actor,
            $actorType,
        ): Membership {
            if ($candidate->user_id) {
                User::query()->lockForUpdate()->findOrFail($candidate->user_id);
            }

            /** @var Membership $membership */
            $membership = Membership::query()
                ->with('plan')
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            /** @var Transaction|null $transaction */
            $transaction = $membership->transaction()
                ->lockForUpdate()
                ->first();

            if (! $transaction) {
                throw ValidationException::withMessages([
                    'membership' => 'Transaksi membership tidak tersedia.',
                ]);
            }

            if ((int) $transaction->user_id !== (int) $membership->user_id) {
                throw ValidationException::withMessages([
                    'membership' => 'Kepemilikan transaksi membership tidak konsisten.',
                ]);
            }

            if ($transaction->payment_status === 'PAID'
                && $membership->status === 'active') {
                return $membership->setRelation('transaction', $transaction);
            }

            if ($membership->registration_expires_at !== null
                && now()->greaterThanOrEqualTo($membership->registration_expires_at)) {
                throw ValidationException::withMessages([
                    'membership' => 'Waktu pembayaran membership telah berakhir.',
                ]);
            }

            if (! $membership->plan?->is_active) {
                throw ValidationException::withMessages([
                    'membership_plan_id' => 'Paket membership sudah tidak aktif dan tidak dapat dibayar.',
                ]);
            }

            if ($transaction->payment_status !== 'UNPAID'
                || $membership->status !== 'pending_payment') {
                throw ValidationException::withMessages([
                    'membership' => 'Transaksi membership sudah diproses.',
                ]);
            }

            return $this->activateLockedMembership(
                $membership,
                $transaction,
                $paymentMethod,
                $actor,
                $actorType,
                now(),
            );
        }, 3);
    }

    /**
     * Repair a durable paid projection after a PHP worker or server stopped
     * between recording settlement and granting the membership benefit.
     *
     * The paid transaction/attempt is re-verified while locked. Expiration or
     * later plan deactivation cannot discard an already-settled purchase, but
     * a payment recorded after its quoted deadline is left for manual review.
     */
    public function reconcileSettledPayment(
        Membership $candidate,
        ?PaymentAttempt $candidateAttempt = null,
    ): bool {
        return DB::transaction(function () use (
            $candidate,
            $candidateAttempt,
        ): bool {
            if ($candidate->user_id) {
                User::query()->lockForUpdate()->findOrFail($candidate->user_id);
            }

            /** @var Membership $membership */
            $membership = Membership::query()
                ->with('plan')
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            /** @var Transaction|null $transaction */
            $transaction = $membership->transaction()
                ->lockForUpdate()
                ->first();

            if (! $transaction) {
                throw ValidationException::withMessages([
                    'membership' => 'Transaksi membership tidak tersedia untuk pemulihan.',
                ]);
            }

            if ((int) $membership->user_id < 1
                || (int) $transaction->user_id < 1
                || (int) $transaction->user_id !== (int) $membership->user_id) {
                throw ValidationException::withMessages([
                    'membership' => 'Kepemilikan transaksi membership tidak konsisten.',
                ]);
            }

            /** @var PaymentAttempt|null $attempt */
            $attempt = $candidateAttempt
                ? PaymentAttempt::query()
                    ->lockForUpdate()
                    ->findOrFail($candidateAttempt->id)
                : null;

            if ($attempt !== null) {
                $snapshot = is_array($transaction->service_snapshot)
                    ? $transaction->service_snapshot
                    : [];
                $expectedCurrency = strtoupper((string) ($snapshot['currency']
                    ?? config('services.payment.currency', 'IDR')));
                $samePayment = (int) $attempt->transaction_id === (int) $transaction->id
                    && $attempt->status === PaymentAttemptStatus::Paid
                    && (int) $attempt->amount === (int) $transaction->amount
                    && $attempt->user_id !== null
                    && (int) $attempt->user_id === (int) $membership->user_id
                    && strtoupper($attempt->currency) === $expectedCurrency;

                if (! $samePayment) {
                    throw ValidationException::withMessages([
                        'membership' => 'Bukti pembayaran tidak sesuai dengan transaksi membership.',
                    ]);
                }
            }

            $isSettled = $transaction->payment_status === 'PAID'
                || $attempt?->status === PaymentAttemptStatus::Paid;

            if (! $isSettled) {
                throw ValidationException::withMessages([
                    'membership' => 'Membership belum memiliki pembayaran terverifikasi.',
                ]);
            }

            if ($transaction->payment_status === 'PAID'
                && $membership->status === 'active') {
                return false;
            }

            if ($membership->status !== 'pending_payment') {
                throw ValidationException::withMessages([
                    'membership' => 'Status membership tidak aman untuk dipulihkan otomatis.',
                ]);
            }

            $settledAt = $attempt?->paid_at
                ?? $transaction->paid_at
                ?? now();

            if ($membership->registration_expires_at !== null
                && $settledAt->greaterThan($membership->registration_expires_at)) {
                throw ValidationException::withMessages([
                    'membership' => 'Pembayaran tercatat setelah batas checkout dan memerlukan rekonsiliasi manual.',
                ]);
            }

            $metadata = is_array($attempt?->metadata)
                ? $attempt->metadata
                : [];
            $snapshot = is_array($transaction->service_snapshot)
                ? $transaction->service_snapshot
                : [];
            $paymentMethod = (string) ($transaction->payment_method
                ?: ($metadata['payment_method'] ?? null)
                ?: ($snapshot['payment_method'] ?? null)
                ?: $attempt?->provider
                ?: 'verified_payment');

            $this->activateLockedMembership(
                $membership,
                $transaction,
                $paymentMethod,
                null,
                'system',
                $settledAt,
            );

            return true;
        }, 3);
    }

    public function writeStatusHistory(
        Membership $membership,
        string $action,
        ?User $actor = null,
        string $actorType = 'admin',
    ): void {
        $this->writeHistory(
            $membership,
            $membership->transaction,
            $action,
            $actor,
            $actorType,
        );
    }

    /**
     * Change a membership state and its unpaid transaction atomically.
     *
     * The user, membership, and transaction are locked in the same order as
     * payment confirmation so an admin action can never interleave with a
     * checkout callback and leave contradictory states behind.
     */
    public function changeStatus(
        Membership $candidate,
        string $status,
        ?User $actor = null,
        string $action = 'status_changed',
    ): Membership {
        return DB::transaction(function () use (
            $candidate,
            $status,
            $actor,
            $action,
        ): Membership {
            if ($candidate->user_id) {
                User::query()->lockForUpdate()->findOrFail($candidate->user_id);
            }

            /** @var Membership $membership */
            $membership = Membership::query()
                ->with('plan')
                ->lockForUpdate()
                ->findOrFail($candidate->id);

            /** @var Transaction|null $transaction */
            $transaction = $membership->transaction()
                ->lockForUpdate()
                ->first();

            if ($status === 'active' && $membership->status !== 'active') {
                throw ValidationException::withMessages([
                    'status' => 'Membership tidak dapat diaktifkan ulang secara langsung. Konfirmasikan pembayaran atau buat perpanjangan baru.',
                ]);
            }

            if ($status === 'pending_payment'
                && $membership->status !== 'pending_payment') {
                throw ValidationException::withMessages([
                    'status' => 'Membership yang sudah diproses tidak dapat dikembalikan ke status menunggu pembayaran.',
                ]);
            }

            if ($membership->status === $status) {
                return $membership->setRelation('transaction', $transaction);
            }

            if ($transaction
                && in_array($status, ['expired', 'cancelled'], true)) {
                $this->paymentAttempts->guardAndTerminateOpenAttempts(
                    $transaction,
                    $status === 'expired'
                        ? PaymentAttemptStatus::Expired
                        : PaymentAttemptStatus::Cancelled,
                    'status',
                );
                $transaction->refresh();
            }

            $membership->update(['status' => $status]);

            if ($transaction?->payment_status === 'UNPAID'
                && in_array($status, ['expired', 'cancelled'], true)) {
                $transaction->update([
                    'payment_status' => $status === 'expired'
                        ? 'EXPIRED'
                        : 'FAILED',
                ]);
            }

            $membership->refresh()->load(['plan', 'transaction']);
            $this->writeStatusHistory(
                $membership,
                $action,
                $actor,
                'admin',
            );

            return $membership;
        }, 3);
    }

    /**
     * Activate models that are already locked in the canonical order
     * user -> membership -> transaction -> payment attempt.
     */
    private function activateLockedMembership(
        Membership $membership,
        Transaction $transaction,
        string $paymentMethod,
        ?User $actor,
        string $actorType,
        DateTimeInterface $settledAt,
    ): Membership {
        $snapshot = is_array($transaction->service_snapshot)
            ? $transaction->service_snapshot
            : [];
        $durationMonths = max(
            1,
            (int) ($snapshot['duration_months']
                ?? $membership->plan?->duration_months
                ?? 1),
        );
        $settled = Carbon::instance($settledAt);
        $startDate = $settled->copy()->startOfDay();

        $latestPaidEnd = Membership::query()
            ->where('user_id', $membership->user_id)
            ->whereKeyNot($membership->id)
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

        $endDate = $startDate->copy()->addMonthsNoOverflow($durationMonths);
        $snapshot['start_date'] = $startDate->toDateString();
        $snapshot['end_date'] = $endDate->toDateString();
        $snapshot['settled_at'] = $settled->toIso8601String();
        $snapshot['activated_at'] = now()->toIso8601String();

        $membership->update([
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'status' => 'active',
            'registration_expires_at' => null,
        ]);
        $transaction->update([
            'payment_status' => 'PAID',
            'payment_method' => $transaction->payment_method ?: $paymentMethod,
            'paid_at' => $transaction->paid_at ?? $settled,
            'service_snapshot' => $snapshot,
        ]);

        $membership->refresh()->load(['plan', 'transaction']);
        $this->writeStatusHistory(
            $membership,
            'payment_confirmed',
            $actor,
            $actorType,
        );

        $this->operationalLog->recordAfterCommit('membership_activated', [
            'membership_id' => $membership->id,
            'transaction_id' => $transaction->id,
            'plan_id' => $membership->membership_plan_id,
            'activation_source' => $actorType,
        ]);

        return $membership;
    }

    private function resolvePlan(int|string|null $planId): ?MembershipPlan
    {
        if (! $planId) {
            return null;
        }

        return MembershipPlan::findOrFail($planId);
    }

    private function resolveEndDate(Carbon $startDate, ?MembershipPlan $plan, ?string $manualEndDate): Carbon
    {
        if ($plan) {
            return $startDate->copy()->addMonthsNoOverflow($plan->duration_months);
        }

        if (! $manualEndDate) {
            throw ValidationException::withMessages([
                'end_date' => 'Tanggal selesai wajib diisi jika tidak memilih paket.',
            ]);
        }

        $endDate = Carbon::parse($manualEndDate)->startOfDay();

        if ($endDate->lte($startDate)) {
            throw ValidationException::withMessages([
                'end_date' => 'Tanggal selesai harus setelah tanggal mulai.',
            ]);
        }

        return $endDate;
    }

    private function resolveAmount(?MembershipPlan $plan, int|string|null $manualAmount): int
    {
        if ($plan) {
            return (int) $plan->price;
        }

        return max(0, (int) ($manualAmount ?? 0));
    }

    private function createTransaction(Membership $membership, ?int $userId, int $amount): Transaction
    {
        return $membership->transaction()->create([
            'user_id' => $userId,
            'amount' => $amount,
            'payment_status' => 'PAID',
            'paid_at' => now(),
            'checkout_url' => route('admin.memberships.index'),
            'service_snapshot' => [
                'version' => 1,
                'kind' => 'membership',
                'plan_id' => $membership->membership_plan_id,
                'plan_name' => $membership->plan?->name ?? 'Membership Gym',
                'plan_tier' => $membership->plan?->tier,
                'plan_image_url' => $membership->plan?->cardImageUrl(),
                'duration_months' => $membership->plan?->duration_months,
                'price' => $amount,
                'start_date' => $membership->start_date->toDateString(),
                'end_date' => $membership->end_date->toDateString(),
            ],
        ]);
    }

    private function ensureNoOverlappingActiveMembership(
        ?int $userId,
        Carbon $startDate,
        Carbon $endDate,
        ?int $allowedPreviousMembershipId = null,
    ): void {
        if (! $userId) {
            return;
        }

        $overlap = Membership::query()
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->when($allowedPreviousMembershipId, fn ($query) => $query->where('id', '!=', $allowedPreviousMembershipId))
            ->whereDate('start_date', '<=', $endDate->toDateString())
            ->whereDate('end_date', '>=', $startDate->toDateString())
            ->lockForUpdate()
            ->exists();

        if ($overlap) {
            throw ValidationException::withMessages([
                'membership' => 'User ini masih memiliki membership aktif pada periode tersebut. Gunakan perpanjang atau upgrade agar masa aktif tidak bertabrakan.',
            ]);
        }
    }

    private function writeHistory(
        Membership $membership,
        ?Transaction $transaction,
        string $action,
        ?User $actor,
        string $actorType,
    ): void {
        $membership->loadMissing('plan');
        $snapshot = is_array($transaction?->service_snapshot)
            ? $transaction->service_snapshot
            : [];

        $membership->histories()->create([
            'user_id' => $membership->user_id,
            'membership_plan_id' => $membership->membership_plan_id,
            'transaction_id' => $transaction?->id,
            'renewed_from_membership_id' => $membership->renewed_from_membership_id,
            'actor_id' => $actor?->id,
            'actor_type' => $actorType,
            'action' => $action,
            'start_date' => $membership->start_date->toDateString(),
            'end_date' => $membership->end_date->toDateString(),
            'amount' => $transaction?->amount,
            'payment_status' => $transaction?->payment_status,
            'metadata' => [
                'plan_id' => $snapshot['plan_id'] ?? $membership->membership_plan_id,
                'plan_name' => $snapshot['plan_name'] ?? $membership->plan?->name,
                'plan_tier' => $snapshot['plan_tier'] ?? $membership->plan?->tier,
                'duration_months' => $snapshot['duration_months'] ?? $membership->plan?->duration_months,
                'receipt_number' => $transaction?->receipt_number,
            ],
        ]);
    }
}
