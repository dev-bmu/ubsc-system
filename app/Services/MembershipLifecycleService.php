<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MembershipLifecycleService
{
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
            /** @var Membership $sourceMembership */
            $sourceMembership = Membership::query()
                ->with('plan')
                ->lockForUpdate()
                ->findOrFail($sourceMembership->id);

            if ($sourceMembership->status === 'cancelled') {
                throw ValidationException::withMessages([
                    'membership' => 'Membership yang dibatalkan tidak dapat diperpanjang.',
                ]);
            }

            $plan = $this->resolvePlan($payload['membership_plan_id'] ?? $sourceMembership->membership_plan_id);
            $startDate = $sourceMembership->end_date->copy()->addDay()->startOfDay();
            $endDate = $this->resolveEndDate($startDate, $plan, null);
            $amount = $this->resolveAmount($plan, $payload['amount'] ?? null);

            $this->ensureNoOverlappingActiveMembership(
                $sourceMembership->user_id,
                $startDate,
                $endDate,
                $sourceMembership->id,
            );

            $renewal = Membership::create([
                'user_id' => $sourceMembership->user_id,
                'customer_name' => $sourceMembership->customer_name,
                'membership_plan_id' => $plan?->id,
                'renewed_from_membership_id' => $sourceMembership->id,
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

    public function writeStatusHistory(Membership $membership, string $action, ?User $actor = null): void
    {
        $this->writeHistory($membership, $membership->transaction, $action, $actor, 'admin');
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
            return $startDate->copy()->addMonths($plan->duration_months);
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
                'plan_name' => $membership->plan?->name,
                'receipt_number' => $transaction?->receipt_number,
            ],
        ]);
    }
}
