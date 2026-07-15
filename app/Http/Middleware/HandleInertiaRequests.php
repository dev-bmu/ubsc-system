<?php

namespace App\Http\Middleware;

use App\Models\Booking;
use App\Models\InfoBanner;
use App\Models\Membership;
use App\Models\SystemSetting;
use App\Support\AdminNotificationCenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Inertia\Middleware;
use Tighten\Ziggy\Ziggy;

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
            'ziggy' => fn () => [
                ...(new Ziggy)->toArray(),
                'location' => $request->url(),
            ],
            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'email_verified_at' => $user->email_verified_at,
                    'avatar' => $user->avatar_url,
                    'avatar_url' => $user->avatar_url,
                    'phone_number' => $user->phone_number,
                    'birth_place' => $user->birth_place,
                    'birth_date' => $user->birth_date?->format('Y-m-d'),
                    'identity_category' => $user->identity_category,
                    'identity_number' => $user->identity_number,
                    'identity_status' => $user->identity_status,
                    'is_google' => ! is_null($user->google_id),
                    'role' => $staffRole,
                    'permissions' => $permissions,
                    'member_status' => $this->getMemberStatus($user),
                ] : null,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
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

    /**
     * Determine member status based on active gym membership
     * and active (upcoming/ongoing) facility bookings.
     *
     * Returns: 'none' | 'gym_only' | 'booked_only' | 'gym_and_booked'
     */
    private function getMemberStatus($user): string
    {
        $now = now();

        $hasGym = Membership::where('user_id', $user->id)
            ->where('status', 'active')
            ->where('start_date', '<=', $now->toDateString())
            ->where('end_date', '>=', $now->toDateString())
            ->exists();

        $hasBooking = Booking::where('user_id', $user->id)
            ->where('status', 'confirmed')
            ->where(function ($q) use ($now) {
                $q->where('booking_date', '>', $now->toDateString())
                  ->orWhere(function ($q2) use ($now) {
                      $q2->where('booking_date', '=', $now->toDateString())
                         ->where('end_time', '>', $now->format('H:i'));
                  });
            })
            ->exists();

        if ($hasGym && $hasBooking) return 'gym_and_booked';
        if ($hasGym)                return 'gym_only';
        if ($hasBooking)            return 'booked_only';

        return 'none';
    }
}
