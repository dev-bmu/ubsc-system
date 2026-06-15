<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Services\MembershipLifecycleService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MembershipController extends Controller
{
    public function __construct(private readonly MembershipLifecycleService $memberships)
    {
    }

    public function index(): Response
    {
        $this->authorizeAny(['view-members', 'manage-members', 'manage-bookings', 'manage-payment-links']);

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

        $plans = MembershipPlan::orderBy('sort_order')
            ->get(['id', 'name', 'price', 'duration_months']);

        return Inertia::render('Admin/Memberships/Index', [
            'memberships' => $memberships,
            'plans' => $plans,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorizeAny(['manage-members', 'manage-bookings']);

        $data = $request->validate([
            'customer_name' => ['required', 'string', 'max:255'],
            'membership_plan_id' => ['nullable', 'exists:membership_plans,id'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after:start_date'],
            'amount' => ['nullable', 'integer', 'min:0'],
        ]);

        $this->memberships->create([
            ...$data,
            'source' => 'admin',
            'actor' => $request->user(),
        ]);

        return redirect()->route('admin.memberships.index')
            ->with('success', 'Membership berhasil dibuat.');
    }

    public function renew(Request $request, Membership $membership): RedirectResponse
    {
        $this->authorizeAny(['manage-members', 'manage-bookings']);

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
        $this->authorizeAny(['manage-members', 'manage-bookings']);

        $data = $request->validate([
            'status' => ['required', 'in:active,expired,cancelled'],
        ]);

        $membership->update(['status' => $data['status']]);

        if ($data['status'] === 'cancelled' && $membership->transaction?->payment_status === 'UNPAID') {
            $membership->transaction->update(['payment_status' => 'FAILED']);
        }

        $membership->refresh()->load(['plan', 'transaction']);
        $this->memberships->writeStatusHistory($membership, 'status_changed', $request->user());

        return back()->with('success', 'Status membership berhasil diperbarui.');
    }

    public function destroy(Membership $membership): RedirectResponse
    {
        $this->authorizeAny(['manage-members', 'manage-bookings']);

        $membership->update(['status' => 'cancelled']);

        if ($membership->transaction?->payment_status === 'UNPAID') {
            $membership->transaction->update(['payment_status' => 'FAILED']);
        }

        $membership->refresh()->load(['plan', 'transaction']);
        $this->memberships->writeStatusHistory($membership, 'cancelled', request()->user());

        return back()->with('success', 'Membership berhasil dibatalkan.');
    }

    private function transform(Membership $membership): array
    {
        return [
            'id' => $membership->id,
            'user_id' => $membership->user_id,
            'membership_plan_id' => $membership->membership_plan_id,
            'renewed_from_membership_id' => $membership->renewed_from_membership_id,
            'renewed_from_label' => $membership->renewedFrom
                ? '#' . str_pad((string) $membership->renewedFrom->id, 5, '0', STR_PAD_LEFT) . ' - ' . ($membership->renewedFrom->plan?->name ?? 'Manual')
                : null,
            'created_by_name' => $membership->createdBy?->name,
            'created_via' => $membership->created_via,
            'plan_name' => $membership->plan?->name,
            'customer_name' => $membership->customer_name ?? $membership->user?->name ?? 'Guest',
            'customer_phone' => $membership->user?->phone_number,
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
                    'plan_name' => $history->plan?->name ?? ($history->metadata['plan_name'] ?? 'Manual'),
                    'start_date' => $history->start_date->format('Y-m-d'),
                    'end_date' => $history->end_date->format('Y-m-d'),
                    'transaction_id' => $history->transaction_id,
                    'receipt_number' => $history->transaction?->receipt_number ?? ($history->metadata['receipt_number'] ?? null),
                    'renewed_from_membership_id' => $history->renewed_from_membership_id,
                    'renewed_from_label' => $history->renewedFrom
                        ? '#' . str_pad((string) $history->renewedFrom->id, 5, '0', STR_PAD_LEFT) . ' - ' . ($history->renewedFrom->plan?->name ?? 'Manual')
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
     * @param array<int, string> $permissions
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
