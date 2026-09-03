<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\Cursor;
use Illuminate\Pagination\CursorPaginator;
use Illuminate\Support\Carbon;

class AdminMembershipReadModel
{
    private const HISTORY_RESULT_LIMIT = 100;

    /**
     * @param  array{date: string, search?: string|null, status?: string|null, per_page: int, cursor?: string|null}  $filters
     * @return array{data: array<int, array<string, mixed>>, pagination: array<string, mixed>}
     */
    public function listing(array $filters): array
    {
        $periodEnd = Carbon::parse($filters['date'])->addDay()->startOfDay();
        $query = $this->baseQuery()
            ->where('start_date', '<', $periodEnd)
            ->where('end_date', '>=', $filters['date']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        $this->applySearch($query, $filters['search'] ?? null);

        $paginator = $query
            ->orderByDesc('id')
            ->cursorPaginate(
                $filters['per_page'],
                ['*'],
                'cursor',
                Cursor::fromEncoded($filters['cursor'] ?? null),
            );

        return [
            'data' => collect($paginator->items())
                ->map(fn (Membership $membership): array => $this->transform($membership))
                ->values()
                ->all(),
            'pagination' => $this->paginationMeta($paginator),
        ];
    }

    /** @return array{total: int, active: int, pending: int, expired: int, cancelled: int, expiring_soon: int, date: string} */
    public function statistics(string $date): array
    {
        $periodEnd = Carbon::parse($date)->addDay()->startOfDay();
        $row = Membership::query()
            ->where('start_date', '<', $periodEnd)
            ->where('end_date', '>=', $date)
            ->selectRaw('COUNT(*) as aggregate')
            ->selectRaw("SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count")
            ->selectRaw("SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) as pending_count")
            ->selectRaw("SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count")
            ->selectRaw("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count")
            ->first();

        $expiryBoundary = Carbon::parse($date)->addDays(15)->startOfDay();
        $expiringSoon = Membership::query()
            ->where('status', 'active')
            ->where('start_date', '<', $periodEnd)
            ->where('end_date', '>=', $date)
            ->where('end_date', '<', $expiryBoundary)
            ->count();

        return [
            'total' => (int) ($row?->aggregate ?? 0),
            'active' => (int) ($row?->active_count ?? 0),
            'pending' => (int) ($row?->pending_count ?? 0),
            'expired' => (int) ($row?->expired_count ?? 0),
            'cancelled' => (int) ($row?->cancelled_count ?? 0),
            'expiring_soon' => $expiringSoon,
            'date' => $date,
        ];
    }

    /**
     * Return one complete record while keeping an explicit ceiling on history.
     *
     * @return array{data: array<string, mixed>, meta: array{histories_has_more: bool, histories_limit: int}}
     */
    public function detail(Membership $membership): array
    {
        $membership->load($this->relations());

        $histories = $membership->histories()
            ->with([
                'plan:id,name',
                'transaction:id',
                'renewedFrom:id,membership_plan_id',
                'renewedFrom.plan:id,name',
                'actor:id,name',
            ])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::HISTORY_RESULT_LIMIT + 1)
            ->get();

        $hasMore = $histories->count() > self::HISTORY_RESULT_LIMIT;
        $membership->setRelation('histories', $histories->take(self::HISTORY_RESULT_LIMIT));

        return [
            'data' => $this->transform($membership),
            'meta' => [
                'histories_has_more' => $hasMore,
                'histories_limit' => self::HISTORY_RESULT_LIMIT,
            ],
        ];
    }

    /** @return array<int, array{id: int, name: string, email: string, phone_number: string|null}> */
    public function initialUsers(): array
    {
        return User::query()
            ->whereDoesntHave('roles')
            ->orderByDesc('id')
            ->limit(20)
            ->get(['id', 'name', 'email', 'phone_number'])
            ->map(fn (User $user): array => $this->transformUser($user))
            ->all();
    }

    /** @return array<int, array{id: int, name: string, email: string, phone_number: string|null}> */
    public function searchUsers(string $search): array
    {
        $prefix = $this->likePrefix(trim($search));

        return User::query()
            ->whereDoesntHave('roles')
            ->where(function (Builder $query) use ($prefix): void {
                $query
                    ->where('name', 'like', $prefix)
                    ->orWhere('email', 'like', $prefix)
                    ->orWhere('phone_number', 'like', $prefix);
            })
            ->orderBy('name')
            ->orderBy('id')
            ->limit(20)
            ->get(['id', 'name', 'email', 'phone_number'])
            ->map(fn (User $user): array => $this->transformUser($user))
            ->all();
    }

    private function baseQuery(): Builder
    {
        return Membership::query()->with($this->relations());
    }

    /** @return array<string, mixed> */
    private function relations(): array
    {
        return [
            'user:id,name,email,phone_number',
            'transaction:id,transactionable_id,transactionable_type,amount,payment_status,xendit_invoice_id,checkout_url,paid_at,service_snapshot',
            'plan:id,name,tier,duration_months',
            'renewedFrom:id,membership_plan_id',
            'renewedFrom.plan:id,name',
            'createdBy:id,name',
        ];
    }

    private function applySearch(Builder $query, ?string $search): void
    {
        $search = trim((string) $search);

        if ($search === '') {
            return;
        }

        $prefix = $this->likePrefix($search);

        $query->where(function (Builder $searchQuery) use ($search, $prefix): void {
            if (ctype_digit($search)) {
                $searchQuery->whereKey((int) $search)
                    ->orWhere('customer_name', 'like', $prefix);
            } else {
                $searchQuery->where('customer_name', 'like', $prefix);
            }

            $searchQuery
                ->orWhere('registration_email', 'like', $prefix)
                ->orWhere('registration_phone', 'like', $prefix)
                ->orWhereHas('user', fn (Builder $userQuery): Builder => $userQuery
                    ->where('name', 'like', $prefix)
                    ->orWhere('email', 'like', $prefix)
                    ->orWhere('phone_number', 'like', $prefix));
        });
    }

    private function likePrefix(string $value): string
    {
        return addcslashes($value, '\\%_').'%';
    }

    /** @return array<string, mixed> */
    public function transform(Membership $membership): array
    {
        $snapshot = is_array($membership->transaction?->service_snapshot)
            ? $membership->transaction->service_snapshot
            : [];
        $planTier = $snapshot['plan_tier'] ?? $membership->plan?->tier;
        $planDurationMonths = (int) (
            $snapshot['duration_months']
            ?? $membership->plan?->duration_months
            ?? 0
        );

        $payload = [
            'id' => $membership->id,
            'user_id' => $membership->user_id,
            'membership_plan_id' => $membership->membership_plan_id,
            'renewed_from_membership_id' => $membership->renewed_from_membership_id,
            'renewed_from_label' => $membership->renewedFrom
                ? '#'.str_pad((string) $membership->renewedFrom->id, 5, '0', STR_PAD_LEFT).' - '.($membership->renewedFrom->plan?->name ?? 'Manual')
                : null,
            'created_by_name' => $membership->createdBy?->name,
            'created_via' => $membership->created_via,
            'plan_name' => $snapshot['plan_name'] ?? $membership->plan?->name,
            'plan_tier' => $planTier,
            'plan_tier_label' => $planTier
                ? (MembershipPlan::TIER_LABELS[$planTier] ?? ucfirst((string) $planTier))
                : null,
            'plan_duration_months' => $planDurationMonths ?: null,
            'plan_duration_label' => $planDurationMonths > 0
                ? MembershipPlan::durationLabelFor($planDurationMonths)
                : null,
            'customer_name' => $membership->customer_name ?? $membership->user?->name ?? 'Guest',
            'customer_phone' => $membership->registration_phone ?? $membership->user?->phone_number,
            'registration' => [
                'email' => $membership->registration_email ?? $membership->user?->email,
                'phone' => $membership->registration_phone ?? $membership->user?->phone_number,
                'gender' => $membership->registration_gender,
                'category' => $membership->registration_category,
                'expires_at' => $membership->registration_expires_at?->toIso8601String(),
            ],
            'start_date' => $membership->start_date->format('Y-m-d'),
            'end_date' => $membership->end_date->format('Y-m-d'),
            'status' => $membership->status,
            'transaction' => $membership->transaction ? [
                'id' => $membership->transaction->id,
                'amount' => (int) $membership->transaction->amount,
                'payment_status' => $membership->transaction->payment_status,
                'receipt_number' => $membership->transaction->receipt_number,
                'xendit_invoice_id' => $membership->transaction->xendit_invoice_id,
                'checkout_url' => $membership->transaction->checkout_url,
                'paid_at' => $membership->transaction->paid_at?->format('Y-m-d H:i'),
            ] : null,
        ];

        if ($membership->relationLoaded('histories')) {
            $payload['histories'] = $membership->histories
                ->map(fn ($history): array => [
                    'id' => $history->id,
                    'action' => $history->action,
                    'plan_name' => $history->metadata['plan_name'] ?? $history->plan?->name ?? 'Manual',
                    'start_date' => $history->start_date->format('Y-m-d'),
                    'end_date' => $history->end_date->format('Y-m-d'),
                    'transaction_id' => $history->transaction_id,
                    'receipt_number' => $history->transaction?->receipt_number ?? ($history->metadata['receipt_number'] ?? null),
                    'renewed_from_membership_id' => $history->renewed_from_membership_id,
                    'renewed_from_label' => $history->renewedFrom
                        ? '#'.str_pad((string) $history->renewedFrom->id, 5, '0', STR_PAD_LEFT).' - '.($history->renewedFrom->plan?->name ?? 'Manual')
                        : null,
                    'actor_name' => $history->actor?->name,
                    'actor_type' => $history->actor_type,
                    'amount' => $history->amount,
                    'payment_status' => $history->payment_status,
                    'created_at' => $history->created_at?->format('Y-m-d H:i'),
                ])
                ->values()
                ->all();
        }

        return $payload;
    }

    /** @return array{id: int, name: string, email: string, phone_number: string|null} */
    private function transformUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone_number' => $user->phone_number,
        ];
    }

    /** @return array<string, mixed> */
    private function paginationMeta(CursorPaginator $paginator): array
    {
        return [
            'per_page' => $paginator->perPage(),
            'count' => $paginator->count(),
            'has_next' => $paginator->nextCursor() !== null,
            'has_previous' => $paginator->previousCursor() !== null,
            'next_cursor' => $paginator->nextCursor()?->encode(),
            'previous_cursor' => $paginator->previousCursor()?->encode(),
        ];
    }
}
