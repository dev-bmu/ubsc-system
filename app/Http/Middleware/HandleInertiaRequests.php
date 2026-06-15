<?php

namespace App\Http\Middleware;

use App\Models\InfoBanner;
use App\Models\SystemSetting;
use App\Support\AdminNotificationCenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        $user = $request->user();
        $staffRole = $user ? $this->freshPrimaryRole($user) : null;
        $permissions = $user ? $this->freshPermissionNames($user) : [];

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user ? [
                    'id'                => $user->id,
                    'name'              => $user->name,
                    'email'             => $user->email,
                    'email_verified_at' => $user->email_verified_at,
                    'avatar'            => $user->avatar_url,
                    'avatar_url'        => $user->avatar_url,
                    'phone_number'      => $user->phone_number,
                    'birth_place'       => $user->birth_place,
                    'birth_date'        => $user->birth_date?->format('Y-m-d'),
                    'identity_category' => $user->identity_category,
                    'identity_number'   => $user->identity_number,
                    'identity_status'   => $user->identity_status,
                    'role'              => $staffRole,
                    'permissions'       => $permissions,
                ] : null,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error'   => $request->session()->get('error'),
            ],
            'announcements' => fn () => Schema::hasTable('info_banners')
                ? InfoBanner::active()->ordered()->pluck('message')
                : collect(),
            'admin_notifications' => fn () => app(AdminNotificationCenter::class)->for($request),
            'gym_traffic' => fn () => Schema::hasTable('system_settings')
                ? SystemSetting::get('gym_traffic', 'Low Occupancy')
                : 'Low Occupancy',
        ];
    }

    /**
     * Read directly from role/permission relations so sidebar access reflects
     * the latest Administrator checklist even when Spatie's permission cache
     * or a long-lived session would otherwise lag behind.
     */
    private function freshPrimaryRole($user): ?string
    {
        return $user->roles()
            ->value('name');
    }

    /**
     * @return array<int, string>
     */
    private function freshPermissionNames($user): array
    {
        $rolePermissions = $user->roles()
            ->with('permissions:id,name')
            ->get()
            ->flatMap(fn ($role) => $role->permissions->pluck('name'));

        $directPermissions = $user->permissions()
            ->pluck('name');

        return $rolePermissions
            ->merge($directPermissions)
            ->unique()
            ->sort()
            ->values()
            ->all();
    }
}
