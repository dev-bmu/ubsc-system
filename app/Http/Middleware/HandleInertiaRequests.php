<?php

namespace App\Http\Middleware;

use App\Models\Booking;
use App\Models\InfoBanner;
use App\Models\Membership;
use App\Models\SystemSetting;
use App\Services\ServiceLifecycleService;
use App\Support\AdminNotificationCenter;
use App\Support\PublicSeo;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Inertia\Middleware;
use Inertia\Support\Header;
use Symfony\Component\HttpFoundation\Response;
use Tighten\Ziggy\Ziggy;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function handle(Request $request, Closure $next): Response
    {
        $response = parent::handle($request, $next);

        if ($request->isMethod('GET') || $request->isMethod('HEAD')) {
            $contentType = strtolower((string) $response->headers->get('Content-Type'));
            $isInertiaResponse = $request->headers->has(Header::INERTIA)
                || $response->headers->get(Header::INERTIA) === 'true';
            $isHtmlDocument = str_contains($contentType, 'text/html');

            if ($isInertiaResponse || $isHtmlDocument) {
                $response->headers->set(
                    'Cache-Control',
                    'private, no-store, max-age=0, must-revalidate'
                );
                $response->headers->set('Pragma', 'no-cache');
                $response->headers->set('Expires', '0');

                if (! PublicSeo::isIndexable($request)) {
                    $response->headers->set(
                        'X-Robots-Tag',
                        'noindex, nofollow, noarchive',
                    );
                }
            }
        }

        return $response;
    }

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
                    'member_status_next_transition_at' => $this
                        ->getMemberStatusNextTransitionAt($user),
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
            'seo' => fn () => PublicSeo::forRequest($request),
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
            ->effectiveAt($now->toDateString())
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

        if ($hasGym && $hasBooking) {
            return 'gym_and_booked';
        }
        if ($hasGym) {
            return 'gym_only';
        }
        if ($hasBooking) {
            return 'booked_only';
        }

        return 'none';
    }

    private function getMemberStatusNextTransitionAt($user): ?string
    {
        $now = now();
        $lifecycle = app(ServiceLifecycleService::class);

        $lastBooking = Booking::query()
            ->where('user_id', $user->id)
            ->where('status', 'confirmed')
            ->where(function ($query) use ($now): void {
                $query
                    ->whereDate('booking_date', '>', $now->toDateString())
                    ->orWhere(function ($sameDay) use ($now): void {
                        $sameDay
                            ->whereDate('booking_date', $now->toDateString())
                            ->whereTime('end_time', '>', $now->format('H:i:s'));
                    });
            })
            ->orderByDesc('booking_date')
            ->orderByDesc('end_time')
            ->first();

        $currentMembership = Membership::query()
            ->with('transaction')
            ->where('user_id', $user->id)
            ->whereHas(
                'transaction',
                fn ($query) => $query->where('payment_status', 'PAID'),
            )
            ->effectiveAt($now->toDateString())
            ->orderBy('end_date')
            ->first();

        $nextMembership = $currentMembership
            ? null
            : Membership::query()
                ->with('transaction')
                ->where('user_id', $user->id)
                ->where('status', 'active')
                ->whereHas(
                    'transaction',
                    fn ($query) => $query->where('payment_status', 'PAID'),
                )
                ->whereDate('start_date', '>', $now->toDateString())
                ->orderBy('start_date')
                ->first();

        return collect([
            $lastBooking
                ? $lifecycle->bookingEndsAt($lastBooking)
                : null,
            $currentMembership
                ? $lifecycle->membershipExpiresAt($currentMembership)
                : null,
            $nextMembership
                ? $lifecycle->membershipStartsAt($nextMembership)
                : null,
        ])
            ->filter()
            ->sort()
            ->first()
            ?->toIso8601String();
    }
}
