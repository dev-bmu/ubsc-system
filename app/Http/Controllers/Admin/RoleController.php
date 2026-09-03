<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AdminPresenceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    private const ROLE_ORDER = ['Manager', 'Finance', 'Staff Central', 'Staff Front Office'];

    public function index(AdminPresenceService $presence): Response
    {
        $order = self::ROLE_ORDER;
        $user = auth()->user();

        $roles = Role::with([
            'permissions',
            'users:id,staff_last_seen_at',
        ])
            ->whereNotIn('name', ['Administrator'])
            ->when(! $user?->hasRole('Administrator'), function ($query) use ($user) {
                $query->where('name', $user?->getRoleNames()->first());
            })
            ->get()
            ->sortBy(fn (Role $r) => array_search($r->name, $order))
            ->values();
        $presenceByUser = $presence->snapshotsFor(
            $roles->pluck('users')->flatten()->unique('id')->values(),
        );

        $roles = $roles->map(function (Role $r) use ($presenceByUser) {
            $userIds = $r->users->pluck('id');
            $onlineCount = $userIds->filter(
                static fn ($userId): bool => ($presenceByUser[(int) $userId]['is_online'] ?? false) === true,
            )->count();

            return [
                'id' => $r->id,
                'name' => $r->name,
                'permissions' => $r->permissions->pluck('name')->sort()->values(),
                'users_count' => $userIds->count(),
                'online_users_count' => $onlineCount,
            ];
        });

        return Inertia::render('Admin/Settings/Roles', [
            'roles' => $roles,
        ]);
    }

    public function update(Request $request, Role $role): RedirectResponse
    {
        abort_unless(
            auth()->user()?->hasRole('Administrator'),
            403,
            'Hanya Administrator yang dapat mengubah hak akses.',
        );

        abort_if(
            $role->name === 'Administrator',
            403,
            'Hak akses Administrator tidak dapat diubah.',
        );

        $data = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $role->syncPermissions($data['permissions']);

        // Force-clear the permission cache so changes are reflected immediately
        // on the next request — without this, users keep the old cached set
        // until the TTL expires (typically 24 h).
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        return back()->with('success', "Hak akses {$role->name} berhasil diperbarui.");
    }
}
