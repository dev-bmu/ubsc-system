<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class UserPurchaseHistoryService
{
    public function __construct(
        private readonly ServiceLifecycleService $lifecycle,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function transaction(
        Transaction $transaction,
        ?CarbonInterface $at = null,
    ): array {
        $now = $this->localNow($at);
        $subject = $transaction->transactionable;
        $snapshot = is_array($transaction->service_snapshot)
            ? $transaction->service_snapshot
            : [];

        $items = collect();
        $membership = null;

        if ($subject instanceof BookingOrder) {
            $items = $this->orderItems($subject, $snapshot, $now);
        } elseif ($subject instanceof Booking) {
            $items = collect([
                $this->bookingItem(
                    $subject,
                    $this->snapshotItem($snapshot),
                    $now,
                ),
            ]);
        } elseif ($subject instanceof Membership) {
            $membership = $this->membership($subject, $transaction, $now);
        } elseif (($snapshot['kind'] ?? null) === 'membership') {
            $membership = $this->orphanedMembership($transaction, $snapshot);
        } elseif (isset($snapshot['items']) && is_array($snapshot['items'])) {
            $items = collect($snapshot['items'])
                ->filter(fn ($item) => is_array($item))
                ->map(fn (array $item) => $this->orphanedBookingItem($item));
        }

        $serviceStatus = $membership['status']
            ?? $this->aggregateBookingStatus(
                $items,
                (string) $transaction->payment_status,
            );
        $kind = $membership
            ? 'membership'
            : $this->aggregateKind($items);
        $title = $membership
            ? $membership['plan_name']
            : $this->bookingTitle($items);
        $nextTransition = $membership['next_transition_at']
            ?? $this->nextItemTransition($items, $now);
        $isPayable = $this->isPayable($transaction, $subject, $now);

        return [
            'id' => $transaction->id,
            'receipt_number' => $transaction->receipt_number,
            'amount' => (int) $transaction->amount,
            'payment_status' => (string) $transaction->payment_status,
            'payment_method' => $transaction->payment_method,
            'checkout_url' => $isPayable
                ? $this->checkoutUrl($transaction, $subject)
                : null,
            'invoice_url' => match (true) {
                $subject instanceof BookingOrder
                    && $transaction->payment_status === 'PAID' => route('checkout.booking.invoice', $subject),
                $subject instanceof Membership
                    && $transaction->payment_status === 'PAID' => route('checkout.membership.invoice', $subject),
                default => null,
            },
            'paid_at' => $transaction->paid_at?->toIso8601String(),
            'created_at' => $transaction->created_at?->toIso8601String(),
            'type' => $kind === 'membership' ? 'membership' : 'booking',
            'service_kind' => $kind,
            'service_status' => $serviceStatus,
            'title' => $title,
            'items_count' => $items->count(),
            'items' => $items->values()->all(),
            'membership' => $membership,
            'next_transition_at' => $nextTransition,

            // Compatibility fields for the unused legacy account dashboard.
            'facility_name' => $items->first()['facility_name'] ?? '-',
            'booking_date' => $items->first()['booking_date'] ?? null,
            'membership_plan' => $membership['plan_name'] ?? null,
            'membership_status' => $membership['status'] ?? null,
            'membership_period' => $membership ? [
                'start_date' => $membership['start_date'],
                'end_date' => $membership['end_date'],
            ] : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function membership(
        Membership $membership,
        ?Transaction $transaction = null,
        ?CarbonInterface $at = null,
    ): array {
        $now = $this->localNow($at);
        $transaction ??= $membership->transaction;
        $snapshot = is_array($transaction?->service_snapshot)
            ? $transaction->service_snapshot
            : [];
        $status = $this->lifecycle->membershipStatus($membership, $now);
        $start = $this->lifecycle->membershipStartsAt($membership);
        $expires = $this->lifecycle->membershipExpiresAt($membership);
        $today = $now->startOfDay();
        $totalDays = max(1, $start->diffInDays($expires));
        $elapsedDays = max(0, min($totalDays, $start->diffInDays($today, false)));
        $daysRemaining = $status === 'active'
            ? max(0, $today->diffInDays($expires, false))
            : 0;

        return [
            'id' => $membership->id,
            'plan_name' => $snapshot['plan_name']
                ?? $membership->plan?->name
                ?? 'Membership Gym',
            'image_url' => $this->portableImageUrl(
                $membership->plan?->cardImageUrl()
                    ?: ($snapshot['plan_image_url'] ?? null),
            ),
            'status' => $status,
            'stored_status' => $membership->status,
            'payment_status' => $transaction?->payment_status,
            'receipt_number' => $transaction?->receipt_number,
            'start_date' => $membership->start_date->toDateString(),
            'end_date' => $membership->end_date->toDateString(),
            'starts_at' => $start->toIso8601String(),
            'expires_at' => $expires->toIso8601String(),
            'next_transition_at' => $this->lifecycle
                ->membershipNextTransitionAt($membership, $now)
                ?->toIso8601String(),
            'days_remaining' => $daysRemaining,
            'progress' => round($elapsedDays / $totalDays, 4),
        ];
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return Collection<int, array<string, mixed>>
     */
    private function orderItems(
        BookingOrder $order,
        array $snapshot,
        CarbonImmutable $at,
    ): Collection {
        $snapshotItems = collect($snapshot['items'] ?? [])
            ->filter(fn ($item) => is_array($item))
            ->values();
        $usedSnapshotIndexes = [];

        $items = $order->bookings
            ->map(function (Booking $booking) use (
                $snapshotItems,
                &$usedSnapshotIndexes,
                $at,
            ): array {
                $snapshotIndex = $snapshotItems->search(
                    fn (array $item) => isset($item['booking_id'])
                        && (int) $item['booking_id'] === $booking->id,
                );

                if ($snapshotIndex === false) {
                    $snapshotIndex = $snapshotItems->search(
                        fn (array $item, int $index) => ! in_array($index, $usedSnapshotIndexes, true)
                            && (int) ($item['facility_id'] ?? 0) === (int) $booking->facility_id
                            && (string) ($item['booking_date'] ?? '') === $booking->booking_date->toDateString()
                            && substr((string) ($item['start_time'] ?? ''), 0, 5) === substr((string) $booking->start_time, 0, 5),
                    );
                }

                $itemSnapshot = $snapshotIndex === false
                    ? []
                    : (array) $snapshotItems->get($snapshotIndex);

                if ($snapshotIndex !== false) {
                    $usedSnapshotIndexes[] = $snapshotIndex;
                }

                return $this->bookingItem($booking, $itemSnapshot, $at);
            });

        $snapshotItems->each(function (array $item, int $index) use (
            &$items,
            $usedSnapshotIndexes,
        ): void {
            if (! in_array($index, $usedSnapshotIndexes, true)) {
                $items->push($this->orphanedBookingItem($item));
            }
        });

        return $items->sortBy([
            ['starts_at', 'asc'],
            ['id', 'asc'],
        ])->values();
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function bookingItem(
        Booking $booking,
        array $snapshot,
        CarbonImmutable $at,
    ): array {
        $startsAt = $this->lifecycle->bookingStartsAt($booking);
        $endsAt = $this->lifecycle->bookingEndsAt($booking);
        $kind = $snapshot['kind'] ?? $this->facilityKind($booking);

        return [
            'id' => $booking->id,
            'kind' => $kind,
            'facility_id' => $booking->facility_id,
            'facility_name' => $snapshot['facility_name']
                ?? $booking->facility?->name
                ?? 'Fasilitas tidak tersedia',
            'image_url' => $this->portableImageUrl(
                ($snapshot['image_url'] ?? null)
                    ?: $this->bookingImageUrl($booking),
            ),
            'facility_unit_id' => $booking->facility_unit_id,
            'facility_unit_name' => $snapshot['facility_unit_name']
                ?? $booking->facilityUnit?->name,
            'category_name' => $snapshot['category_name']
                ?? $booking->facility?->category?->name,
            'location' => $snapshot['location']
                ?? $booking->facility?->location,
            'booking_date' => $booking->booking_date->toDateString(),
            'start_time' => substr((string) $booking->start_time, 0, 5),
            'end_time' => substr((string) $booking->end_time, 0, 5),
            'starts_at' => $startsAt->toIso8601String(),
            'ends_at' => $endsAt->toIso8601String(),
            'duration_minutes' => $startsAt->diffInMinutes($endsAt),
            'subtotal' => (int) $booking->subtotal_price,
            'status' => $this->lifecycle->bookingStatus($booking, $at),
            'stored_status' => $booking->status,
            'next_transition_at' => $this->lifecycle
                ->bookingNextTransitionAt($booking, $at)
                ?->toIso8601String(),
        ];
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function orphanedBookingItem(array $snapshot): array
    {
        $startTime = substr((string) ($snapshot['start_time'] ?? ''), 0, 5);
        $endTime = substr((string) ($snapshot['end_time'] ?? ''), 0, 5);

        return [
            'id' => $snapshot['booking_id'] ?? null,
            'kind' => $snapshot['kind'] ?? 'facility',
            'facility_id' => $snapshot['facility_id'] ?? null,
            'facility_name' => $snapshot['facility_name'] ?? 'Reservasi tersimpan',
            'image_url' => $this->portableImageUrl(
                $snapshot['image_url'] ?? null,
            ),
            'facility_unit_id' => $snapshot['facility_unit_id'] ?? null,
            'facility_unit_name' => $snapshot['facility_unit_name'] ?? null,
            'category_name' => $snapshot['category_name'] ?? null,
            'location' => $snapshot['location'] ?? null,
            'booking_date' => $snapshot['booking_date'] ?? null,
            'start_time' => $startTime ?: null,
            'end_time' => $endTime ?: null,
            'starts_at' => $snapshot['starts_at'] ?? null,
            'ends_at' => $snapshot['ends_at'] ?? null,
            'duration_minutes' => $snapshot['duration_minutes'] ?? null,
            'subtotal' => (int) ($snapshot['subtotal'] ?? 0),
            'status' => 'archived',
            'stored_status' => null,
            'next_transition_at' => null,
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $items
     */
    private function aggregateBookingStatus(
        Collection $items,
        string $paymentStatus,
    ): string {
        if ($paymentStatus === 'UNPAID') {
            return 'awaiting_payment';
        }

        if ($paymentStatus === 'EXPIRED') {
            return 'payment_expired';
        }

        if ($paymentStatus === 'FAILED') {
            return 'payment_failed';
        }

        if ($items->isEmpty()) {
            return $paymentStatus === 'PAID' ? 'archived' : 'awaiting_payment';
        }

        $statuses = $items->pluck('status');

        if ($statuses->contains('ongoing')) {
            return 'ongoing';
        }

        if ($statuses->contains('scheduled')) {
            return 'scheduled';
        }

        if ($statuses->contains('awaiting_payment')) {
            return 'awaiting_payment';
        }

        if ($statuses->every(fn ($status) => $status === 'cancelled')) {
            return 'cancelled';
        }

        if ($statuses->every(
            fn ($status) => in_array($status, ['completed', 'cancelled'], true),
        )) {
            return 'completed';
        }

        if ($statuses->every(fn ($status) => $status === 'archived')) {
            return 'archived';
        }

        return (string) $statuses->first();
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $items
     */
    private function aggregateKind(Collection $items): string
    {
        $kinds = $items->pluck('kind')->filter()->unique()->values();

        if ($kinds->count() > 1) {
            return 'mixed';
        }

        return (string) ($kinds->first() ?? 'facility');
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $items
     */
    private function bookingTitle(Collection $items): string
    {
        if ($items->count() === 1) {
            return (string) ($items->first()['facility_name'] ?? 'Reservasi');
        }

        if ($items->count() > 1) {
            return $items->count().' jadwal dalam satu pembayaran';
        }

        return 'Riwayat reservasi';
    }

    private function facilityKind(Booking $booking): string
    {
        $haystack = Str::lower(implode(' ', array_filter([
            $booking->facility?->category?->slug,
            $booking->facility?->category?->name,
            $booking->facility?->class_code,
        ])));

        return Str::contains($haystack, ['kelas', 'class'])
            ? 'class'
            : 'facility';
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $items
     */
    private function nextItemTransition(
        Collection $items,
        CarbonImmutable $at,
    ): ?string {
        return $items
            ->pluck('next_transition_at')
            ->filter()
            ->map(fn (string $value) => CarbonImmutable::parse($value))
            ->filter(fn (CarbonImmutable $value) => $value->greaterThan($at))
            ->sort()
            ->first()
            ?->toIso8601String();
    }

    private function isPayable(
        Transaction $transaction,
        mixed $subject,
        CarbonImmutable $at,
    ): bool {
        if ($transaction->payment_status !== 'UNPAID') {
            return false;
        }

        if ($subject instanceof BookingOrder) {
            return in_array($subject->status, ['draft', 'pending_payment'], true)
                && ($subject->expires_at === null
                    || $subject->expires_at->greaterThan($at));
        }

        if ($subject instanceof Membership) {
            return $subject->status === 'pending_payment'
                && ($subject->registration_expires_at === null
                    || $subject->registration_expires_at->greaterThan($at));
        }

        return $subject instanceof Booking
            && $subject->status === 'pending'
            && $transaction->checkout_url !== null;
    }

    private function checkoutUrl(
        Transaction $transaction,
        mixed $subject,
    ): ?string {
        if ($subject instanceof Membership) {
            return route(
                'checkout.membership.show',
                $subject,
                absolute: false,
            );
        }

        if ($subject instanceof BookingOrder) {
            return route(
                'checkout.booking.show',
                $subject,
                absolute: false,
            );
        }

        return $transaction->checkout_url;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function snapshotItem(array $snapshot): array
    {
        if (isset($snapshot['items'][0]) && is_array($snapshot['items'][0])) {
            return $snapshot['items'][0];
        }

        return $snapshot;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function orphanedMembership(
        Transaction $transaction,
        array $snapshot,
    ): array {
        return [
            'id' => null,
            'plan_name' => $snapshot['plan_name'] ?? 'Membership Gym',
            'image_url' => $this->portableImageUrl(
                $snapshot['plan_image_url'] ?? null,
            ),
            'status' => 'archived',
            'stored_status' => null,
            'payment_status' => $transaction->payment_status,
            'receipt_number' => $transaction->receipt_number,
            'start_date' => $snapshot['start_date'] ?? null,
            'end_date' => $snapshot['end_date'] ?? null,
            'starts_at' => null,
            'expires_at' => null,
            'next_transition_at' => null,
            'days_remaining' => 0,
            'progress' => 1,
        ];
    }

    private function bookingImageUrl(Booking $booking): ?string
    {
        return $booking->facilityUnit?->getFirstMediaUrl('unit_image')
            ?: $booking->facility?->getFirstMediaUrl('hero')
            ?: $booking->facility?->getFirstMediaUrl('gallery')
            ?: null;
    }

    private function portableImageUrl(mixed $url): ?string
    {
        if (! is_string($url) || $url === '') {
            return null;
        }

        $path = parse_url($url, PHP_URL_PATH);

        return is_string($path) && str_starts_with($path, '/storage/')
            ? $path
            : $url;
    }

    private function localNow(?CarbonInterface $at = null): CarbonImmutable
    {
        $timezone = (string) config('app.timezone', 'Asia/Jakarta');

        return $at
            ? CarbonImmutable::instance($at)->setTimezone($timezone)
            : CarbonImmutable::now($timezone);
    }
}
