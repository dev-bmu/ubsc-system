<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityCategory;
use App\Models\FacilityUnit;
use App\Models\Transaction;
use App\Services\DataGovernance\BookingStatusTransitionPolicy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\Cursor;
use Illuminate\Pagination\CursorPaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Throwable;

class AdminBookingReadModel
{
    private const CALENDAR_RESULT_LIMIT = 2000;

    private const PROJECTION_CALENDAR = 'calendar';

    private const PROJECTION_DETAIL = 'detail';

    private const PROJECTION_LIST = 'list';

    public function __construct(
        private readonly BookingStatusTransitionPolicy $statusTransitions,
        private readonly BookingInventoryService $inventoryService,
        private readonly BookingInventorySnapshotService $inventorySnapshots,
    ) {}

    /**
     * Return the bounded operational calendar for one date.
     *
     * @return array{data: array<int, array<string, mixed>>, meta: array<string, mixed>}
     */
    public function calendar(
        string $date,
        ?int $categoryId = null,
        string $coverage = 'all',
    ): array {
        $dateStart = Carbon::parse($date)->startOfDay();
        $dateEnd = $dateStart->copy()->addDay();
        $records = $this->baseQuery(
            $categoryId,
            $coverage,
            self::PROJECTION_CALENDAR,
        )
            ->where('booking_date', '>=', $dateStart)
            ->where('booking_date', '<', $dateEnd)
            ->where('status', '!=', 'cancelled')
            ->orderBy('start_time')
            ->orderBy('id')
            ->limit(self::CALENDAR_RESULT_LIMIT + 1)
            ->get();

        $isCapped = $records->count() > self::CALENDAR_RESULT_LIMIT;

        if ($isCapped) {
            $records = $records->take(self::CALENDAR_RESULT_LIMIT);
        }

        return [
            'data' => $this->transformMany($records, self::PROJECTION_CALENDAR),
            'meta' => [
                'date' => $date,
                'is_capped' => $isCapped,
                'limit' => self::CALENDAR_RESULT_LIMIT,
            ],
        ];
    }

    /**
     * Cursor pagination keeps navigation cost stable even after years of data.
     *
     * @param  array{search?: string|null, status?: string|null, date_from?: string|null, date_to?: string|null, category_id?: int|null, coverage?: string, per_page: int, cursor?: string|null}  $filters
     * @return array{data: array<int, array<string, mixed>>, pagination: array<string, mixed>}
     */
    public function listing(array $filters): array
    {
        $query = $this->baseQuery(
            $filters['category_id'] ?? null,
            $filters['coverage'] ?? 'all',
            self::PROJECTION_LIST,
        );

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['date_from'])) {
            $query->where(
                'booking_date',
                '>=',
                Carbon::parse($filters['date_from'])->startOfDay(),
            );
        }

        if (! empty($filters['date_to'])) {
            $query->where(
                'booking_date',
                '<',
                Carbon::parse($filters['date_to'])->addDay()->startOfDay(),
            );
        }

        $this->applySearch($query, $filters['search'] ?? null);

        $paginator = $query
            ->orderByDesc('id')
            ->cursorPaginate(
                $filters['per_page'],
                ['*'],
                'cursor',
                $this->decodeCursor($filters['cursor'] ?? null),
            );

        return [
            'data' => $this->transformMany(
                collect($paginator->items()),
                self::PROJECTION_LIST,
            ),
            'pagination' => $this->paginationMeta($paginator),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(Booking $booking): array
    {
        $freshBooking = $this->baseQuery()
            ->whereKey($booking->getKey())
            ->firstOrFail();

        return $this->transformMany(collect([$freshBooking]))[0];
    }

    /** @return array{pending: int, confirmed: int, completed: int, cancelled: int, total: int, date: string} */
    public function statistics(
        string $date,
        ?int $categoryId = null,
        string $coverage = 'all',
    ): array {
        $dateStart = Carbon::parse($date)->startOfDay();
        $dateEnd = $dateStart->copy()->addDay();
        /** @var Collection<string, int> $counts */
        $statisticsQuery = Booking::query();
        $this->applyBookingFacilityScope(
            $statisticsQuery,
            $categoryId,
            $coverage,
        );
        $counts = $statisticsQuery
            ->where('booking_date', '>=', $dateStart)
            ->where('booking_date', '<', $dateEnd)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($count): int => (int) $count);

        $statistics = [
            'pending' => (int) $counts->get('pending', 0),
            'confirmed' => (int) $counts->get('confirmed', 0),
            'completed' => (int) $counts->get('completed', 0),
            'cancelled' => (int) $counts->get('cancelled', 0),
        ];

        return [
            ...$statistics,
            'total' => array_sum($statistics),
            'date' => $date,
        ];
    }

    /**
     * Categories remain database-driven so a future category is separated
     * without a frontend release or a hard-coded slug list.
     *
     * @return array<int, array<string, int|string>>
     */
    public function categories(): array
    {
        return FacilityCategory::query()
            ->whereHas('facilities')
            ->withCount([
                'facilities as total_facilities',
                'facilities as active_facilities' => fn (Builder $query): Builder => $query
                    ->where('is_active', true),
                'facilities as website_facilities' => fn (Builder $query): Builder => $query
                    ->where('is_active', true)
                    ->whereIn('reservation_method', ['website', 'auto']),
            ])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['id', 'name', 'slug', 'sort_order'])
            ->map(fn (FacilityCategory $category): array => [
                'id' => (int) $category->id,
                'name' => $category->name,
                'slug' => $category->slug,
                'sort_order' => (int) $category->sort_order,
                'total_facilities' => (int) $category->total_facilities,
                'active_facilities' => (int) $category->active_facilities,
                'website_facilities' => (int) $category->website_facilities,
            ])
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function facilities(
        ?int $categoryId = null,
        string $coverage = 'all',
        ?string $bookedDate = null,
    ): array {
        $query = Facility::query()
            ->with('category:id,name,slug')
            ->with(['units' => fn ($query) => $query
                ->where('is_active', true)
                ->orderBy('id')]);

        if ($bookedDate !== null) {
            $bookedDateStart = Carbon::parse($bookedDate)->startOfDay();
            $bookedDateEnd = $bookedDateStart->copy()->addDay();

            if ($categoryId !== null) {
                $query->where('facility_category_id', $categoryId);
            }

            $query->where(function (Builder $operationalQuery) use (
                $bookedDateEnd,
                $bookedDateStart,
                $coverage,
            ): void {
                $operationalQuery->where(
                    fn (Builder $currentFacility): Builder => $this->applyFacilityScope(
                        $currentFacility,
                        null,
                        $coverage,
                        true,
                    ),
                );

                $operationalQuery->orWhereHas(
                    'bookings',
                    function (Builder $bookingQuery) use (
                        $bookedDateEnd,
                        $bookedDateStart,
                        $coverage,
                    ): void {
                        $bookingQuery
                            ->where('booking_date', '>=', $bookedDateStart)
                            ->where('booking_date', '<', $bookedDateEnd)
                            ->where('status', '!=', 'cancelled')
                            ->when(
                                $coverage === 'website',
                                fn (Builder $websiteQuery): Builder => $websiteQuery
                                    ->where(function (Builder $sourceQuery): void {
                                        $sourceQuery
                                            ->whereNotNull('booking_order_id')
                                            ->orWhereNotNull('user_id');
                                    }),
                            );
                    },
                );
            });
        } else {
            $this->applyFacilityScope($query, $categoryId, $coverage, true);
        }

        return $query
            ->orderBy('facility_category_id')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get([
                'id',
                'facility_category_id',
                'name',
                'reservation_method',
                'capacity',
            ])
            ->map(function (Facility $facility): array {
                $bookingCapacity = $this->inventoryService->capacityFor($facility, null);

                return [
                    'id' => $facility->id,
                    'name' => $facility->name,
                    'category_id' => $facility->facility_category_id,
                    'category_name' => $facility->category?->name ?? 'Tanpa kategori',
                    'category_slug' => $facility->category?->slug ?? '',
                    'reservation_method' => $facility->reservation_method ?? 'unknown',
                    'booking_capacity' => $bookingCapacity,
                    'has_shared_booking_capacity' => $bookingCapacity > 1,
                    'units' => $facility->units
                        ->map(function (FacilityUnit $unit) use ($facility): array {
                            $unitCapacity = $this->inventoryService->capacityFor($facility, $unit);

                            return [
                                'id' => $unit->id,
                                'name' => $unit->name,
                                'capacity_override' => $unit->capacity,
                                'booking_capacity' => $unitCapacity,
                                'has_shared_booking_capacity' => $unitCapacity > 1,
                            ];
                        })
                        ->values()
                        ->all(),
                ];
            })
            ->values()
            ->all();
    }

    private function baseQuery(
        ?int $categoryId = null,
        string $coverage = 'all',
        string $projection = self::PROJECTION_DETAIL,
    ): Builder {
        $relations = [
            'facility:id,facility_category_id,name,reservation_method,capacity',
            'facility.category:id,name,slug',
            'facilityUnit:id,facility_id,name,capacity',
        ];

        if ($projection === self::PROJECTION_DETAIL) {
            $relations = [
                ...$relations,
                'user:id,name,email,phone_number,identity_category',
                'bookingOrder:id,user_id,customer_name,whatsapp_number,identity_category,status,notes,expires_at,updated_at',
                'transaction:id,transactionable_id,transactionable_type,amount,payment_status,checkout_url,paid_at,updated_at',
                'bookingOrder.transaction:id,transactionable_id,transactionable_type,amount,payment_status,checkout_url,paid_at,updated_at',
            ];
        } elseif ($projection === self::PROJECTION_LIST) {
            $relations = [
                ...$relations,
                'user:id,name,phone_number,identity_category',
                'bookingOrder:id,customer_name,whatsapp_number,identity_category,status',
                'transaction:id,transactionable_id,transactionable_type,amount,payment_status',
                'bookingOrder.transaction:id,transactionable_id,transactionable_type,amount,payment_status',
            ];
        } else {
            $relations = [
                ...$relations,
                'user:id,name,identity_category',
                'bookingOrder:id,customer_name,identity_category,status',
            ];
        }

        $query = Booking::query()->with($relations);

        $this->applyBookingFacilityScope($query, $categoryId, $coverage);

        return $query;
    }

    private function applyBookingFacilityScope(
        Builder $query,
        ?int $categoryId,
        string $coverage,
    ): void {
        if ($categoryId !== null) {
            $query->whereHas(
                'facility',
                fn (Builder $facilityQuery): Builder => $facilityQuery
                    ->where('facility_category_id', $categoryId),
            );
        }

        if ($coverage === 'website') {
            $query->where(function (Builder $sourceQuery): void {
                $sourceQuery
                    ->whereNotNull('booking_order_id')
                    ->orWhereNotNull('user_id')
                    ->orWhereHas(
                        'facility',
                        fn (Builder $facilityQuery): Builder => $this->applyFacilityScope(
                            $facilityQuery,
                            null,
                            'website',
                        ),
                    );
            });
        }
    }

    private function applyFacilityScope(
        Builder $query,
        ?int $categoryId,
        string $coverage,
        bool $activeOnly = false,
    ): Builder {
        if ($categoryId !== null) {
            $query->where('facility_category_id', $categoryId);
        }

        if ($coverage === 'website') {
            return $query
                ->where('is_active', true)
                ->whereIn('reservation_method', ['website', 'auto']);
        }

        return $activeOnly ? $query->where('is_active', true) : $query;
    }

    private function applySearch(Builder $query, ?string $search): void
    {
        $search = trim((string) $search);

        if ($search === '') {
            return;
        }

        $prefix = $this->likePrefix($search);
        $normalizedPhonePrefix = $this->phoneSearchPrefix($search);
        $references = $this->referenceIds($search);

        $query->where(function (Builder $searchQuery) use (
            $normalizedPhonePrefix,
            $prefix,
            $references,
        ): void {
            if ($references['booking_id'] !== null) {
                $searchQuery->whereKey($references['booking_id']);
            }

            if ($references['order_id'] !== null) {
                $method = $references['booking_id'] !== null ? 'orWhere' : 'where';
                $searchQuery->{$method}('booking_order_id', $references['order_id']);
            }

            $nameMethod = $references['booking_id'] !== null
                || $references['order_id'] !== null
                    ? 'orWhere'
                    : 'where';
            $searchQuery->{$nameMethod}('customer_name', 'like', $prefix);

            $searchQuery
                ->orWhere('customer_phone', 'like', $prefix)
                ->when(
                    $normalizedPhonePrefix !== null && $normalizedPhonePrefix !== $prefix,
                    fn (Builder $contactQuery): Builder => $contactQuery
                        ->orWhere('customer_phone', 'like', $normalizedPhonePrefix),
                )
                ->orWhereHas('user', function (Builder $userQuery) use ($normalizedPhonePrefix, $prefix): void {
                    $userQuery
                        ->where('name', 'like', $prefix)
                        ->orWhere('email', 'like', $prefix)
                        ->orWhere('phone_number', 'like', $prefix)
                        ->when(
                            $normalizedPhonePrefix !== null && $normalizedPhonePrefix !== $prefix,
                            fn (Builder $contactQuery): Builder => $contactQuery
                                ->orWhere('phone_number', 'like', $normalizedPhonePrefix),
                        );
                })
                ->orWhereHas('bookingOrder', function (Builder $orderQuery) use ($normalizedPhonePrefix, $prefix): void {
                    $orderQuery
                        ->where('customer_name', 'like', $prefix)
                        ->orWhere('whatsapp_number', 'like', $prefix)
                        ->when(
                            $normalizedPhonePrefix !== null && $normalizedPhonePrefix !== $prefix,
                            fn (Builder $contactQuery): Builder => $contactQuery
                                ->orWhere('whatsapp_number', 'like', $normalizedPhonePrefix),
                        );
                })
                ->orWhereHas('facility', fn (Builder $facilityQuery): Builder => $facilityQuery
                    ->where('name', 'like', $prefix));
        });
    }

    private function likePrefix(string $value): string
    {
        return addcslashes($value, '\\%_').'%';
    }

    private function phoneSearchPrefix(string $value): ?string
    {
        if (preg_match('/\A[+\d\s().-]+\z/', $value) !== 1) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';

        if (strlen($digits) < 5) {
            return null;
        }

        if (str_starts_with($digits, '0')) {
            $digits = '62'.substr($digits, 1);
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62'.$digits;
        }

        return $this->likePrefix($digits);
    }

    /** @return array{booking_id: int|null, order_id: int|null} */
    private function referenceIds(string $search): array
    {
        if (preg_match('/\AUBSC[-\s]*0*(\d+)\z/i', $search, $matches) === 1) {
            $id = (int) $matches[1];

            return [
                'booking_id' => null,
                'order_id' => $id > 0 ? $id : null,
            ];
        }

        if (preg_match('/\A(#)?0*(\d+)\z/', $search, $matches) === 1) {
            $id = (int) $matches[2];
            $isExplicitBookingReference = ($matches[1] ?? '') === '#';

            return [
                'booking_id' => $id > 0 ? $id : null,
                'order_id' => ! $isExplicitBookingReference && $id > 0 ? $id : null,
            ];
        }

        return [
            'booking_id' => null,
            'order_id' => null,
        ];
    }

    /** @return array<string, mixed> */
    private function transform(
        Booking $booking,
        string $projection = self::PROJECTION_DETAIL,
        ?array $inventory = null,
    ): array {
        $includeContact = $projection !== self::PROJECTION_CALENDAR;
        $includeDetail = $projection === self::PROJECTION_DETAIL;
        $order = $booking->bookingOrder;
        $transaction = $projection !== self::PROJECTION_CALENDAR
            ? ($booking->transaction ?? $order?->transaction)
            : null;
        $isCampusCustomer = $order?->identity_category === 'warga_ub'
            || $booking->user?->identity_category === 'warga_kampus';
        $userCategory = $isCampusCustomer ? 'warga_ub' : 'umum';
        $paymentSettled = $transaction?->payment_status === 'PAID'
            && ($order === null || $order->status === 'paid');
        $allowedTargets = $this->statusTransitions->allowedTargets($booking->status);

        return [
            'id' => $booking->id,
            'user_id' => $booking->user_id,
            'booking_order_id' => $booking->booking_order_id,
            'facility_id' => $booking->facility_id,
            'facility_unit_id' => $booking->facility_unit_id,
            'booking_date' => $booking->booking_date->format('Y-m-d'),
            'start_time' => substr($booking->start_time, 0, 5),
            'end_time' => substr($booking->end_time, 0, 5),
            'pax' => max(1, (int) $booking->pax),
            'subtotal_price' => (int) $booking->subtotal_price,
            'status' => $booking->status,
            'updated_at' => $booking->updated_at?->toIso8601String(),
            'state_version' => $includeDetail
                ? $this->stateVersion($booking, $order, $transaction)
                : null,
            'notes' => $includeDetail ? ($order?->notes ?? $booking->notes) : null,
            'customer_name' => $order?->customer_name
                ?? $booking->customer_name
                ?? $booking->user?->name
                ?? 'Guest',
            'customer_phone' => $includeContact
                ? ($order !== null
                    ? ($order->whatsapp_number ?? $booking->user?->phone_number)
                    : ($booking->customer_phone ?? $booking->user?->phone_number))
                : null,
            'customer_email' => $includeDetail ? $booking->user?->email : null,
            'is_free' => (int) $booking->subtotal_price === 0 && $booking->user_id === null,
            'user_category' => $userCategory,
            'facility_name' => $booking->facility?->name ?? 'Fasilitas tidak tersedia',
            'facility_unit_name' => $booking->facilityUnit?->name,
            'facility_category_id' => $booking->facility?->facility_category_id,
            'facility_category_name' => $booking->facility?->category?->name ?? 'Tanpa kategori',
            'facility_category_slug' => $booking->facility?->category?->slug ?? '',
            'reservation_method' => $booking->facility?->reservation_method ?? 'unknown',
            'inventory' => $inventory ?? [
                'mode' => 'exclusive',
                'capacity' => 1,
                'occupied' => null,
                'remaining' => null,
                'utilization_percent' => null,
                'concurrent_bookings' => null,
                'holds_inventory' => false,
                'over_capacity' => false,
                'status' => 'exclusive',
            ],
            'booking_source' => $booking->booking_order_id !== null
                ? 'website'
                : ($booking->user_id !== null ? 'legacy_website' : 'admin'),
            'booking_order_status' => $order?->status,
            'payment_settled' => $paymentSettled,
            'operational_actions' => [
                'can_confirm' => $paymentSettled
                    && in_array('confirmed', $allowedTargets, true),
                'can_complete' => $paymentSettled
                    && in_array('completed', $allowedTargets, true),
                'can_cancel' => in_array('cancelled', $allowedTargets, true),
                'can_simulate_payment' => $order === null
                    && $transaction?->payment_status === 'UNPAID',
            ],
            'transaction' => $transaction ? [
                'id' => $transaction->id,
                'amount' => (int) $transaction->amount,
                'payment_status' => $transaction->payment_status,
                'checkout_url' => $includeDetail && $order !== null
                    ? $transaction->checkout_url
                    : null,
                'paid_at' => $includeDetail
                    ? $transaction->paid_at?->format('Y-m-d H:i')
                    : null,
            ] : null,
        ];
    }

    /**
     * @param  Collection<int, Booking>  $bookings
     * @return array<int, array<string, mixed>>
     */
    private function transformMany(
        Collection $bookings,
        string $projection = self::PROJECTION_DETAIL,
    ): array {
        $snapshots = $this->inventorySnapshots->forBookings($bookings);

        return $bookings
            ->map(fn (Booking $booking): array => $this->transform(
                $booking,
                $projection,
                $snapshots[(int) $booking->id] ?? null,
            ))
            ->values()
            ->all();
    }

    /**
     * Detect stale admin actions across the booking, its aggregate order, and
     * payment projection without exposing internal timestamps as a contract.
     */
    public function stateVersion(
        Booking $booking,
        ?BookingOrder $order,
        ?Transaction $transaction,
    ): string {
        return hash('sha256', implode('|', [
            (string) $booking->id,
            (string) $booking->status,
            $booking->updated_at?->format('U.u') ?? '',
            (string) ($order?->id ?? ''),
            (string) ($order?->status ?? ''),
            $order?->updated_at?->format('U.u') ?? '',
            (string) ($transaction?->id ?? ''),
            (string) ($transaction?->payment_status ?? ''),
            $transaction?->updated_at?->format('U.u') ?? '',
        ]));
    }

    private function decodeCursor(?string $encoded): ?Cursor
    {
        if ($encoded === null || trim($encoded) === '') {
            return null;
        }

        try {
            $cursor = Cursor::fromEncoded($encoded);

            if ($cursor === null || ! is_numeric($cursor->parameter('id'))) {
                return null;
            }

            return $cursor;
        } catch (Throwable) {
            return null;
        }
    }

    /** @return array<string, mixed> */
    private function paginationMeta(CursorPaginator $paginator): array
    {
        return [
            'per_page' => $paginator->perPage(),
            'count' => $paginator->count(),
            'has_next' => $paginator->nextCursor() !== null,
            'has_previous' => $paginator->previousCursor() !== null,
            'next_cursor' => $paginator->nextCursor()?->encode(),
            'previous_cursor' => $paginator->previousCursor()?->encode(),
        ];
    }
}
