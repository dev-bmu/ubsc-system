<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use App\Services\AdminMembershipReadModel;
use App\Services\MembershipLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MembershipController extends Controller
{
    public function __construct(
        private readonly MembershipLifecycleService $memberships,
        private readonly AdminMembershipReadModel $readModel,
    ) {}

    public function index(Request $request): Response
    {
        $this->authorizeAny(['view-members', 'manage-members', 'manage-payment-links']);

        $validated = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:pending_payment,active,expired,cancelled'],
            'per_page' => ['nullable', 'integer', 'in:10,20,50'],
            'cursor' => ['nullable', 'string', 'max:2048'],
        ]);

        $date = $validated['date'] ?? today()->toDateString();
        $filters = [
            'date' => $date,
            'search' => trim((string) ($validated['search'] ?? '')) ?: null,
            'status' => $validated['status'] ?? null,
            'per_page' => (int) ($validated['per_page'] ?? 20),
            'cursor' => $validated['cursor'] ?? null,
        ];

        $listingPayload = null;
        $listing = function () use (&$listingPayload, $filters): array {
            return $listingPayload ??= $this->readModel->listing($filters);
        };

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
            'memberships' => fn (): array => $listing()['data'],
            'membership_pagination' => fn (): array => $listing()['pagination'],
            'membership_filters' => [
                ...$filters,
                'cursor' => null,
            ],
            'membership_stats' => fn (): array => $this->readModel->statistics($date),
            'plans' => $plans,
            'users' => fn (): array => $this->readModel->initialUsers(),
        ]);
    }

    public function show(Membership $membership): JsonResponse
    {
        $this->authorizeAny(['view-members', 'manage-members', 'manage-payment-links']);

        return response()->json($this->readModel->detail($membership));
    }

    public function searchUsers(Request $request): JsonResponse
    {
        $this->authorizeAny(['manage-members']);

        $validated = $request->validate([
            'search' => ['required', 'string', 'min:2', 'max:100'],
        ]);

        return response()->json([
            'data' => $this->readModel->searchUsers($validated['search']),
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
