<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use App\Services\MembershipLifecycleService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MembershipController extends Controller
{
    public function __construct(
        private readonly MembershipLifecycleService $memberships,
    ) {}

    public function index(): Response
    {
        $this->authorizeAny(['view-members', 'manage-members', 'manage-payment-links']);

        $memberships = Membership::with([
            'user',
            'transaction',
            'plan',
            'renewedFrom.plan',
            'createdBy',
            'histories.plan',
            'histories.transaction',
            'histories.renewedFrom.plan',
            'histories.actor',
        ])
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn (Membership $membership) => $this->transform($membership));

        $plans = MembershipPlan::query()
            ->orderByTier()
            ->orderBy('sort_order')
            ->orderBy('price')
            ->get(['id', 'name', 'tier', 'price', 'duration_months', 'is_active'])
            ->map(fn (MembershipPlan $plan) => [
                'id' => $plan->id,
                'name' => $plan->name,
                'tier' => $plan->tier,
                'tier_label' => $plan->tierLabel(),
                'price' => $plan->price,
                'duration_months' => $plan->duration_months,
                'duration_label' => $plan->durationLabel(),
                'is_active' => $plan->is_active,
            ]);

        return Inertia::render('Admin/Memberships/Index', [
            'memberships' => $memberships,
            'plans' => $plans,
            'users' => User::query()
                ->whereDoesntHave('roles')
                ->orderBy('name')
                ->get(['id', 'name', 'email', 'phone_number']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorizeAny(['manage-members']);

        $data = $request->validate([
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'customer_name' => ['nullable', 'required_without:user_id', 'string', 'max:255'],
            'membership_plan_id' => ['nullable', 'exists:membership_plans,id'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after:start_date'],
            'amount' => ['nullable', 'integer', 'min:0'],
        ]);

        $selectedUser = isset($data['user_id'])
            ? User::query()->findOrFail($data['user_id'])
            : null;

        $this->memberships->create([
            ...$data,
            'user_id' => $selectedUser?->id,
            'customer_name' => $selectedUser?->name
                ?? $data['customer_name']
                ?? null,
            'source' => 'admin',
            'actor' => $request->user(),
        ]);

        return redirect()->route('admin.memberships.index')
            ->with('success', 'Membership berhasil dibuat.');
    }

    public function renew(Request $request, Membership $membership): RedirectResponse
    {
        $this->authorizeAny(['manage-members']);

        $data = $request->validate([
            'membership_plan_id' => ['nullable', 'exists:membership_plans,id'],
            'amount' => ['nullable', 'integer', 'min:0'],
        ]);

        $this->memberships->renew($membership, [
            ...$data,
            'source' => 'admin',
            'actor' => $request->user(),
        ]);

        return redirect()->route('admin.memberships.index')
            ->with('success', 'Membership berhasil diperpanjang tanpa menghapus sisa masa aktif.');
    }

    public function update(Request $request, Membership $membership): RedirectResponse
    {
        $this->authorizeAny(['manage-members']);

        $data = $request->validate([
            'status' => ['required', 'in:pending_payment,active,expired,cancelled'],
        ]);

        $this->memberships->changeStatus(
            $membership,
            $data['status'],
            $request->user(),
        );

        return back()->with('success', 'Status membership berhasil diperbarui.');
    }

    public function destroy(Membership $membership): RedirectResponse
    {
        $this->authorizeAny(['manage-members']);

        $this->memberships->changeStatus(
            $membership,
            'cancelled',
            request()->user(),
            'cancelled',
        );

        return back()->with('success', 'Membership berhasil dibatalkan.');
    }

    private function transform(Membership $membership): array
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

        return [
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
                'amount' => $membership->transaction->amount,
                'payment_status' => $membership->transaction->payment_status,
                'receipt_number' => $membership->transaction->receipt_number,
                'xendit_invoice_id' => $membership->transaction->xendit_invoice_id,
                'checkout_url' => $membership->transaction->checkout_url,
                'paid_at' => $membership->transaction->paid_at?->format('Y-m-d H:i'),
            ] : null,
            'histories' => $membership->histories
                ->sortByDesc('created_at')
                ->values()
                ->map(fn ($history) => [
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
                ]),
        ];
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function authorizeAny(array $permissions): void
    {
        foreach ($permissions as $permission) {
            if (auth()->user()?->can($permission)) {
                return;
            }
        }

        abort(403);
    }
}
