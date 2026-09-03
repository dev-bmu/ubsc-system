<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AdminPresenceService;
use App\Services\AdminStaffAccountManager;
use App\Support\AuthenticationIdentity;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    private const INTERNAL_ROLES = ['Manager', 'Finance', 'Staff Central', 'Staff Front Office'];

    private const STAFF_ROLES = ['Administrator', 'Manager', 'Finance', 'Staff Central', 'Staff Front Office'];

    private const STAFF_ROLE_ORDER = ['Manager', 'Administrator', 'Finance', 'Staff Central', 'Staff Front Office'];

    public function index(AdminPresenceService $presence): Response
    {
        abort_unless(auth()->user()?->hasAnyRole(self::STAFF_ROLES), 403);

        $staffUsers = User::whereHas('roles', fn ($q) => $q->whereIn('name', self::STAFF_ROLES))
            ->with('roles')
            ->orderBy('name')
            ->get();
        $presenceByUser = $presence->snapshotsFor($staffUsers);

        $users = $staffUsers
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'role' => $u->getRoleNames()->first() ?? '',
                'avatar' => $u->avatar,
                'avatar_url' => $u->avatar_url,
                'presence' => $presenceByUser[(int) $u->getKey()] ?? [
                    'status' => AdminPresenceService::OFFLINE,
                    'is_online' => false,
                    'last_seen_at' => null,
                ],
            ])
            ->sortBy(function (array $user) {
                $rank = array_search($user['role'], self::STAFF_ROLE_ORDER, true);

                return $rank === false ? 999 : $rank;
            })
            ->values();

        return Inertia::render('Admin/Settings/Users/Index', [
            'users' => $users,
            'roles' => self::INTERNAL_ROLES,
            'can_manage_users' => auth()->user()?->hasRole('Administrator') ?? false,
        ]);
    }

    public function store(
        Request $request,
        AdminStaffAccountManager $accounts,
    ): RedirectResponse {
        abort_unless(auth()->user()?->hasRole('Administrator'), 403);

        $this->normalizeEmail($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'max:255', Password::defaults()],
            'role' => ['required', 'in:'.implode(',', self::INTERNAL_ROLES)],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $accounts->create($actor, $data);

        return back()->with('success', "Akun {$data['name']} berhasil dibuat.");
    }

    public function update(
        Request $request,
        User $user,
        AdminStaffAccountManager $accounts,
    ): RedirectResponse {
        abort_unless(auth()->user()?->hasRole('Administrator'), 403);
        abort_if($user->hasRole('Administrator'), 422, 'Akun Administrator tidak dapat diubah dari halaman staff.');

        $this->normalizeEmail($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->getKey()),
            ],
            'password' => ['nullable', 'string', 'max:255', Password::defaults()],
            'role' => ['required', 'in:'.implode(',', self::INTERNAL_ROLES)],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $accounts->update($actor, $user, $data);

        return back()->with('success', "Akun {$data['name']} berhasil diperbarui.");
    }

    public function destroy(
        Request $request,
        User $user,
        AdminStaffAccountManager $accounts,
    ): RedirectResponse {
        abort_unless(auth()->user()?->hasRole('Administrator'), 403);
        abort_if($user->id === auth()->id(), 422, 'Tidak dapat menghapus akun sendiri.');
        abort_if($user->hasRole('Administrator'), 422, 'Akun Administrator tidak dapat dihapus dari halaman staff.');

        /** @var User $actor */
        $actor = $request->user();
        $name = $accounts->delete($actor, $user);

        return back()->with('success', "Akun {$name} berhasil dihapus.");
    }

    private function normalizeEmail(Request $request): void
    {
        $email = $request->input('email');

        if (is_string($email)) {
            $request->merge([
                'email' => AuthenticationIdentity::normalizeEmail($email),
            ]);
        }
    }
}
