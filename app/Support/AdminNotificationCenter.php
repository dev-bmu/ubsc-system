<?php

namespace App\Support;

use App\Models\Booking;
use App\Models\InfoBanner;
use App\Models\Membership;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class AdminNotificationCenter
{
    private const STAFF_ROLES = [
        'Administrator',
        'Manager',
        'Finance',
        'Staff Central',
        'Staff Front Office',
    ];

    /**
     * @return array{items: array<int, array<string, mixed>>, unread_count: int, important_count: int, generated_at: string}
     */
    public function for(Request $request): array
    {
        $user = $request->user();

        if (! $user || ! $user->hasAnyRole(self::STAFF_ROLES)) {
            return $this->emptyPayload();
        }

        $items = $this->visibleItems($request);

        return [
            'items' => $items->map(fn (array $item) => $this->publicItem($item))->values()->all(),
            'unread_count' => $items->where('read', false)->count(),
            'important_count' => $items->where('important', true)->count(),
            'generated_at' => now()->toIso8601String(),
        ];
    }

    /**
     * @param array<int, string>|null $ids
     */
    public function markRead(Request $request, ?array $ids = null): array
    {
        $user = $request->user();

        if (! $user || ! $user->hasAnyRole(self::STAFF_ROLES)) {
            return $this->emptyPayload();
        }

        $currentItems = $this->visibleItems($request);
        $idsToRead = collect($ids ?: $currentItems->pluck('id')->all())
            ->filter(fn ($id) => is_string($id) && $currentItems->contains('id', $id))
            ->values();

        $readFingerprints = collect($request->session()->get($this->sessionKey($user->id, 'read'), []));

        $idsToRead->each(function (string $id) use ($currentItems, $readFingerprints) {
            $item = $currentItems->firstWhere('id', $id);

            if ($item && isset($item['fingerprint'])) {
                $readFingerprints->put($id, $item['fingerprint']);
            }
        });

        $request->session()->put($this->sessionKey($user->id, 'read'), $readFingerprints->all());

        return $this->for($request);
    }

    /**
     * @param array<int, string>|null $ids
     */
    public function clearRead(Request $request, ?array $ids = null): array
    {
        $user = $request->user();

        if (! $user || ! $user->hasAnyRole(self::STAFF_ROLES)) {
            return $this->emptyPayload();
        }

        $currentItems = $this->visibleItems($request);
        $idsToDismiss = collect($ids ?: $currentItems->where('read', true)->pluck('id')->all())
            ->filter(fn ($id) => is_string($id) && $currentItems->contains('id', $id))
            ->values();

        $dismissedFingerprints = collect($request->session()->get($this->sessionKey($user->id, 'dismissed'), []));

        $idsToDismiss->each(function (string $id) use ($currentItems, $dismissedFingerprints) {
            $item = $currentItems->firstWhere('id', $id);

            if ($item && isset($item['fingerprint'])) {
                $dismissedFingerprints->put($id, $item['fingerprint']);
            }
        });

        $request->session()->put($this->sessionKey($user->id, 'dismissed'), $dismissedFingerprints->all());

        return $this->for($request);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function flashItems(Request $request): array
    {
        $items = [];
        $success = $request->session()->get('success');
        $error = $request->session()->get('error');

        if ($success) {
            $items[] = [
                'id' => 'flash-success-' . sha1($success),
                'fingerprint' => sha1($success),
                'title' => 'Action completed',
                'description' => $success,
                'time' => 'Just now',
                'read' => false,
                'important' => false,
                'tone' => 'success',
                'source' => 'System',
                'priority' => 20,
            ];
        }

        if ($error) {
            $items[] = [
                'id' => 'flash-error-' . sha1($error),
                'fingerprint' => sha1($error),
                'title' => 'Attention required',
                'description' => $error,
                'time' => 'Just now',
                'read' => false,
                'important' => true,
                'tone' => 'critical',
                'source' => 'System',
                'priority' => 100,
            ];
        }

        return $items;
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function visibleItems(Request $request): Collection
    {
        $user = $request->user();

        if (! $user) {
            return collect();
        }

        $readFingerprints = collect($request->session()->get($this->sessionKey($user->id, 'read'), []));
        $dismissedFingerprints = collect($request->session()->get($this->sessionKey($user->id, 'dismissed'), []));

        return collect($this->flashItems($request))
            ->merge($this->operationalItems($request))
            ->reject(fn (array $item) => $dismissedFingerprints->get($item['id']) === $item['fingerprint'])
            ->map(function (array $item) use ($readFingerprints) {
                $item['read'] = $readFingerprints->get($item['id']) === $item['fingerprint'];

                return $item;
            })
            ->sortByDesc(fn (array $item) => $item['priority'] ?? 0)
            ->take(8)
            ->values();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function operationalItems(Request $request): array
    {
        return collect([
            $this->pendingIdentityItem($request),
            $this->pendingBookingItem($request),
            $this->failedPaymentItem($request),
            $this->unpaidTransactionItem($request),
            $this->expiringMembershipItem($request),
            $this->activeBannerItem($request),
        ])
            ->filter()
            ->values()
            ->all();
    }

    private function pendingIdentityItem(Request $request): ?array
    {
        if (! $this->canSee($request, ['verify-identity']) || ! Schema::hasTable('users')) {
            return null;
        }

        $query = User::where('identity_status', 'pending');
        $count = (clone $query)->count();

        if ($count < 1) {
            return null;
        }

        $latest = (clone $query)->latest('updated_at')->first(['updated_at']);

        return [
            'id' => 'identity.pending',
            'fingerprint' => $this->fingerprint('identity.pending', [$count, optional($latest?->updated_at)->timestamp]),
            'title' => 'Identity review waiting',
            'description' => $count . ' member' . ($count > 1 ? 's need' : ' needs') . ' document verification.',
            'time' => $latest?->updated_at?->diffForHumans() ?? 'Today',
            'read' => false,
            'important' => true,
            'tone' => 'warning',
            'source' => 'Identity',
            'href' => route('admin.identity.index'),
            'actionLabel' => 'Review',
            'priority' => 90,
        ];
    }

    private function pendingBookingItem(Request $request): ?array
    {
        if (! $this->canSee($request, ['view-bookings', 'manage-bookings']) || ! Schema::hasTable('bookings')) {
            return null;
        }

        $query = Booking::where('status', 'pending')->whereDate('booking_date', '>=', today());
        $count = (clone $query)->count();

        if ($count < 1) {
            return null;
        }

        $latest = (clone $query)->latest('updated_at')->first(['updated_at']);

        return [
            'id' => 'booking.pending',
            'fingerprint' => $this->fingerprint('booking.pending', [$count, optional($latest?->updated_at)->timestamp]),
            'title' => 'Bookings need confirmation',
            'description' => $count . ' upcoming booking' . ($count > 1 ? 's are' : ' is') . ' still pending.',
            'time' => $latest?->updated_at?->diffForHumans() ?? 'Today',
            'read' => false,
            'important' => true,
            'tone' => 'warning',
            'source' => 'Bookings',
            'href' => route('admin.bookings.index'),
            'actionLabel' => 'Open',
            'priority' => 85,
        ];
    }

    private function failedPaymentItem(Request $request): ?array
    {
        if (! $this->canSee($request, ['view-reports', 'manage-payment-links']) || ! Schema::hasTable('transactions')) {
            return null;
        }

        $query = Transaction::where('payment_status', 'FAILED')
            ->where('updated_at', '>=', now()->subDays(7));
        $count = (clone $query)->count();

        if ($count < 1) {
            return null;
        }

        $latest = (clone $query)->latest('updated_at')->first(['updated_at']);

        return [
            'id' => 'payment.failed.7d',
            'fingerprint' => $this->fingerprint('payment.failed.7d', [$this->countBucket($count), optional($latest?->updated_at)->format('Y-m-d-H')]),
            'title' => 'Failed payments detected',
            'description' => $count . ' payment' . ($count > 1 ? 's' : '') . ' failed in the last 7 days.',
            'time' => $latest?->updated_at?->diffForHumans() ?? 'This week',
            'read' => false,
            'important' => true,
            'tone' => 'critical',
            'source' => 'Finance',
            'href' => route('admin.finance.index'),
            'actionLabel' => 'Inspect',
            'priority' => 95,
        ];
    }

    private function unpaidTransactionItem(Request $request): ?array
    {
        if (! $this->canSee($request, ['view-reports', 'manage-payment-links']) || ! Schema::hasTable('transactions')) {
            return null;
        }

        $query = Transaction::where('payment_status', 'UNPAID')
            ->where('created_at', '<=', now()->subMinutes(30));
        $count = (clone $query)->count();

        if ($count < 1) {
            return null;
        }

        $latest = (clone $query)->latest('created_at')->first(['created_at']);

        return [
            'id' => 'payment.unpaid.30m',
            'fingerprint' => $this->fingerprint('payment.unpaid.30m', [$this->countBucket($count)]),
            'title' => 'Unpaid invoices aging',
            'description' => $count . ' invoice' . ($count > 1 ? 's have' : ' has') . ' not been paid after 30 minutes.',
            'time' => $latest?->created_at?->diffForHumans() ?? 'Today',
            'read' => false,
            'important' => false,
            'tone' => 'info',
            'source' => 'Finance',
            'href' => route('admin.finance.index'),
            'actionLabel' => 'Check',
            'priority' => 55,
        ];
    }

    private function expiringMembershipItem(Request $request): ?array
    {
        if (! $this->canSee($request, ['view-members', 'manage-members']) || ! Schema::hasTable('memberships')) {
            return null;
        }

        $query = Membership::where('status', 'active')
            ->whereDate('end_date', '>=', today())
            ->whereDate('end_date', '<=', today()->addDays(7));
        $count = (clone $query)->count();

        if ($count < 1) {
            return null;
        }

        $nearest = (clone $query)->orderBy('end_date')->first(['end_date']);

        return [
            'id' => 'membership.expiring.7d',
            'fingerprint' => $this->fingerprint('membership.expiring.7d', [$count, optional($nearest?->end_date)->format('Y-m-d')]),
            'title' => 'Memberships expiring soon',
            'description' => $count . ' active membership' . ($count > 1 ? 's are' : ' is') . ' ending within 7 days.',
            'time' => $nearest?->end_date?->diffForHumans() ?? 'This week',
            'read' => false,
            'important' => false,
            'tone' => 'info',
            'source' => 'Membership',
            'href' => route('admin.memberships.index'),
            'actionLabel' => 'View',
            'priority' => 50,
        ];
    }

    private function activeBannerItem(Request $request): ?array
    {
        if (! $this->canSee($request, ['manage-cms']) || ! Schema::hasTable('info_banners')) {
            return null;
        }

        $query = InfoBanner::active();
        $count = (clone $query)->count();

        if ($count < 1) {
            return null;
        }

        $latest = (clone $query)->latest('updated_at')->first(['updated_at']);

        return [
            'id' => 'banner.active',
            'fingerprint' => $this->fingerprint('banner.active', [$count]),
            'title' => 'Public info banner active',
            'description' => $count . ' announcement banner' . ($count > 1 ? 's are' : ' is') . ' visible on the public site.',
            'time' => $latest?->updated_at?->diffForHumans() ?? 'Today',
            'read' => false,
            'important' => false,
            'tone' => 'success',
            'source' => 'Content',
            'href' => route('admin.news.index'),
            'actionLabel' => 'Manage',
            'priority' => 30,
        ];
    }

    /**
     * @param array<int, string> $permissions
     */
    private function canSee(Request $request, array $permissions): bool
    {
        $user = $request->user();

        if (! $user) {
            return false;
        }

        if ($user->hasRole('Administrator')) {
            return true;
        }

        foreach ($permissions as $permission) {
            if ($user->can($permission)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<int, mixed> $parts
     */
    private function fingerprint(string $id, array $parts): string
    {
        return sha1($id . '|' . implode('|', array_map(fn ($part) => (string) $part, $parts)));
    }

    private function countBucket(int $count): string
    {
        return match (true) {
            $count >= 50 => '50+',
            $count >= 25 => '25-49',
            $count >= 10 => '10-24',
            $count >= 5 => '5-9',
            default => (string) $count,
        };
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function publicItem(array $item): array
    {
        unset($item['fingerprint'], $item['priority']);

        return $item;
    }

    private function sessionKey(int $userId, string $bucket): string
    {
        return "admin_notifications.{$userId}.{$bucket}";
    }

    /**
     * @return array{items: array<int, array<string, mixed>>, unread_count: int, important_count: int, generated_at: string}
     */
    private function emptyPayload(): array
    {
        return [
            'items' => [],
            'unread_count' => 0,
            'important_count' => 0,
            'generated_at' => now()->toIso8601String(),
        ];
    }
}
