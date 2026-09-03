<?php

namespace App\Services\Monitoring;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Services\Monitoring\Contracts\DataIntegrityDomainScanner;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class BookingDataIntegrityScanner extends AbstractDataIntegrityDomainScanner implements DataIntegrityDomainScanner
{
    public function domain(): string
    {
        return 'bookings';
    }

    public function scan(CarbonImmutable $at, int $sampleLimit): array
    {
        $bookingType = (new Booking)->getMorphClass();
        $orderType = (new BookingOrder)->getMorphClass();
        $graceSeconds = max(
            0,
            (int) config('data_integrity.reconciliation_grace_seconds', 300),
        );
        $dueBefore = $at->subSeconds($graceSeconds);
        $pastDays = max(
            0,
            (int) config('data_integrity.booking_collision_past_days', 1),
        );
        $futureDays = max(
            1,
            min(730, (int) config('data_integrity.booking_collision_future_days', 180)),
        );
        $collisionStart = $at->subDays($pastDays)->toDateString();
        $collisionEnd = $at->addDays($futureDays)->toDateString();

        return [
            $this->result(
                DB::table('bookings')
                    ->selectRaw('id AS subject_id, NULL AS related_id')
                    ->whereColumn('start_time', '>=', 'end_time'),
                $sampleLimit,
                'booking.invalid_time_range',
                $this->domain(),
                'critical',
                'Invalid booking time range',
                'A booking starts at or after its end time.',
                'Quarantine the affected reservation and correct it through an audited workflow.',
            ),
            $this->result(
                DB::table('bookings')
                    ->selectRaw('id AS subject_id, NULL AS related_id')
                    ->where(function (Builder $query): void {
                        $query->whereNull('pax')->orWhere('pax', '<', 1);
                    }),
                $sampleLimit,
                'booking.invalid_pax',
                $this->domain(),
                'critical',
                'Invalid booking participant count',
                'A booking has no positive participant quantity.',
                'Review the original request and apply an audited correction.',
            ),
            $this->result(
                DB::table('bookings as booking')
                    ->leftJoin('facility_units as unit', 'unit.id', '=', 'booking.facility_unit_id')
                    ->selectRaw('booking.id AS subject_id, booking.facility_unit_id AS related_id')
                    ->whereNotNull('booking.facility_unit_id')
                    ->where(function (Builder $query): void {
                        $query
                            ->whereNull('unit.id')
                            ->orWhereColumn('unit.facility_id', '<>', 'booking.facility_id');
                    }),
                $sampleLimit,
                'booking.facility_unit_mismatch',
                $this->domain(),
                'critical',
                'Booking inventory reference mismatch',
                'The selected unit is missing or belongs to another facility.',
                'Stop fulfillment and inspect the facility and unit references.',
            ),
            $this->result(
                $this->fulfilledWithoutSettlement($bookingType, $orderType),
                $sampleLimit,
                'booking.fulfilled_without_settlement',
                $this->domain(),
                'critical',
                'Booking benefit exists without settlement',
                'A confirmed or completed booking has no authoritative paid transaction.',
                'Verify the financial ledger before changing either fulfillment or payment state.',
            ),
            $this->result(
                DB::table('booking_orders as booking_order')
                    ->leftJoin('bookings as booking', 'booking.booking_order_id', '=', 'booking_order.id')
                    ->selectRaw('booking_order.id AS subject_id, NULL AS related_id')
                    ->groupBy('booking_order.id')
                    ->havingRaw('COUNT(booking.id) = 0'),
                $sampleLimit,
                'booking.order_without_items',
                $this->domain(),
                'critical',
                'Booking order has no reservation items',
                'An order exists without any child booking.',
                'Inspect checkout creation logs and keep the order unavailable for payment.',
            ),
            $this->result(
                DB::table('booking_orders as booking_order')
                    ->leftJoin('transactions as payment_tx', function ($join) use ($orderType): void {
                        $join
                            ->on('payment_tx.transactionable_id', '=', 'booking_order.id')
                            ->where('payment_tx.transactionable_type', '=', $orderType);
                    })
                    ->selectRaw('booking_order.id AS subject_id, NULL AS related_id')
                    ->whereNull('payment_tx.id'),
                $sampleLimit,
                'booking.order_without_transaction',
                $this->domain(),
                'critical',
                'Booking order has no transaction',
                'A booking order is detached from its financial record.',
                'Keep the order non-payable and investigate the interrupted checkout.',
            ),
            $this->result(
                $this->orderTotalsMismatch($orderType),
                $sampleLimit,
                'booking.order_totals_mismatch',
                $this->domain(),
                'critical',
                'Booking aggregate totals do not balance',
                'Child subtotals, order totals, fees, or transaction amount disagree.',
                'Compare the immutable checkout snapshot with every child before manual correction.',
            ),
            $this->result(
                $this->orderOwnershipMismatch(),
                $sampleLimit,
                'booking.order_ownership_mismatch',
                $this->domain(),
                'critical',
                'Booking order ownership mismatch',
                'A child booking and its order point at different account identities.',
                'Restrict access to the aggregate and investigate its provenance.',
            ),
            $this->result(
                DB::table('bookings as booking')
                    ->join('booking_orders as booking_order', 'booking_order.id', '=', 'booking.booking_order_id')
                    ->selectRaw('booking.id AS subject_id, booking_order.id AS related_id')
                    ->whereIn('booking_order.status', ['cancelled', 'expired'])
                    ->whereIn('booking.status', ['pending', 'confirmed']),
                $sampleLimit,
                'booking.closed_order_retains_inventory',
                $this->domain(),
                'critical',
                'Closed booking order still reserves inventory',
                'A cancelled or expired order still has a pending or confirmed child.',
                'Inspect the aggregate boundary before releasing inventory.',
            ),
            $this->result(
                $this->settledOrderProjectionPending($orderType),
                $sampleLimit,
                'booking.settled_order_projection_pending',
                $this->domain(),
                'critical',
                'Settled booking order awaits projection',
                'Verified settlement exists while the order remains draft or pending payment.',
                'Run the existing payment recovery workflow; do not create another charge.',
                'safe_candidate',
            ),
            $this->result(
                DB::table('bookings as booking')
                    ->join('booking_orders as booking_order', 'booking_order.id', '=', 'booking.booking_order_id')
                    ->join('transactions as payment_tx', function ($join) use ($orderType): void {
                        $join
                            ->on('payment_tx.transactionable_id', '=', 'booking_order.id')
                            ->where('payment_tx.transactionable_type', '=', $orderType);
                    })
                    ->selectRaw('booking.id AS subject_id, booking_order.id AS related_id')
                    ->where('booking.status', 'pending')
                    ->where('booking_order.status', 'paid')
                    ->where('payment_tx.payment_status', 'PAID'),
                $sampleLimit,
                'booking.settled_child_projection_pending',
                $this->domain(),
                'critical',
                'Settled booking item awaits confirmation',
                'The order and transaction are paid but a child booking is still pending.',
                'Run the existing payment recovery workflow and verify inventory remains reserved.',
                'safe_candidate',
            ),
            $this->result(
                $this->settledDirectBookingPending($bookingType),
                $sampleLimit,
                'booking.settled_direct_projection_pending',
                $this->domain(),
                'critical',
                'Settled direct booking awaits confirmation',
                'A direct booking is pending despite verified settlement.',
                'Run the existing payment recovery workflow; do not collect payment again.',
                'safe_candidate',
            ),
            $this->result(
                $this->completionDue($dueBefore),
                $sampleLimit,
                'booking.lifecycle_completion_due',
                $this->domain(),
                'warning',
                'Booking completion projection is late',
                'A confirmed booking ended beyond the scheduler grace period.',
                'Run the existing lifecycle reconciliation and inspect scheduler health if it repeats.',
                'safe_candidate',
                ['grace_seconds' => $graceSeconds],
            ),
            $this->result(
                $this->unpaidOrderExpiryDue($orderType, $dueBefore),
                $sampleLimit,
                'booking.unpaid_order_expiry_due',
                $this->domain(),
                'warning',
                'Unpaid booking order expiry is late',
                'An expired, provider-safe unpaid hold remains open beyond the grace period.',
                'Run the existing payment recovery workflow and inspect scheduler health.',
                'safe_candidate',
                ['grace_seconds' => $graceSeconds],
            ),
            $this->result(
                $this->confirmedResourceCollisions($collisionStart, $collisionEnd),
                $sampleLimit,
                'booking.confirmed_resource_collision',
                $this->domain(),
                'critical',
                'Confirmed bookings collide on one resource',
                'Two confirmed bookings overlap on the same unit or across a parent-level reservation.',
                'Stop further sales for the sampled resource and resolve the conflict manually.',
                'manual_review',
                ['window_start' => $collisionStart, 'window_end' => $collisionEnd],
            ),
            $this->result(
                $this->confirmedCapacityExceeded($collisionStart, $collisionEnd),
                $sampleLimit,
                'booking.confirmed_capacity_exceeded',
                $this->domain(),
                'critical',
                'Confirmed booking capacity is exceeded',
                'Concurrent parent-level bookings exceed the facility capacity at a booking start.',
                'Stop further sales for the sampled facility and resolve the conflict manually.',
                'manual_review',
                ['window_start' => $collisionStart, 'window_end' => $collisionEnd],
            ),
        ];
    }

    private function fulfilledWithoutSettlement(string $bookingType, string $orderType): Builder
    {
        return DB::table('bookings as booking')
            ->leftJoin('booking_orders as booking_order', 'booking_order.id', '=', 'booking.booking_order_id')
            ->leftJoin('transactions as direct_transaction', function ($join) use ($bookingType): void {
                $join
                    ->on('direct_transaction.transactionable_id', '=', 'booking.id')
                    ->where('direct_transaction.transactionable_type', '=', $bookingType);
            })
            ->leftJoin('transactions as order_transaction', function ($join) use ($orderType): void {
                $join
                    ->on('order_transaction.transactionable_id', '=', 'booking_order.id')
                    ->where('order_transaction.transactionable_type', '=', $orderType);
            })
            ->selectRaw('booking.id AS subject_id, booking.booking_order_id AS related_id')
            ->whereIn('booking.status', ['confirmed', 'completed'])
            ->where(function (Builder $query): void {
                $query
                    ->where(function (Builder $direct): void {
                        $direct
                            ->whereNull('booking.booking_order_id')
                            ->where(function (Builder $payment): void {
                                $payment
                                    ->whereNull('direct_transaction.id')
                                    ->orWhere('direct_transaction.payment_status', '<>', 'PAID');
                            });
                    })
                    ->orWhere(function (Builder $ordered): void {
                        $ordered
                            ->whereNotNull('booking.booking_order_id')
                            ->where(function (Builder $payment): void {
                                $payment
                                    ->whereNull('booking_order.id')
                                    ->orWhereNull('order_transaction.id')
                                    ->orWhere('order_transaction.payment_status', '<>', 'PAID')
                                    ->orWhere('booking_order.status', '<>', 'paid');
                            });
                    });
            });
    }

    private function orderTotalsMismatch(string $orderType): Builder
    {
        return DB::table('booking_orders as booking_order')
            ->join('bookings as booking', 'booking.booking_order_id', '=', 'booking_order.id')
            ->join('transactions as payment_tx', function ($join) use ($orderType): void {
                $join
                    ->on('payment_tx.transactionable_id', '=', 'booking_order.id')
                    ->where('payment_tx.transactionable_type', '=', $orderType);
            })
            ->selectRaw('booking_order.id AS subject_id, payment_tx.id AS related_id')
            ->groupBy([
                'booking_order.id',
                'booking_order.subtotal_amount',
                'booking_order.transaction_fee',
                'booking_order.total_amount',
                'payment_tx.id',
                'payment_tx.amount',
            ])
            ->havingRaw(
                'COALESCE(SUM(booking.subtotal_price), 0) <> booking_order.subtotal_amount'
                .' OR booking_order.total_amount <> (booking_order.subtotal_amount + booking_order.transaction_fee)'
                .' OR payment_tx.amount <> booking_order.total_amount',
            );
    }

    private function orderOwnershipMismatch(): Builder
    {
        return DB::table('bookings as booking')
            ->join('booking_orders as booking_order', 'booking_order.id', '=', 'booking.booking_order_id')
            ->selectRaw('booking.id AS subject_id, booking_order.id AS related_id')
            ->where(function (Builder $query): void {
                $query
                    ->whereColumn('booking.user_id', '<>', 'booking_order.user_id')
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNull('booking.user_id')
                            ->whereNotNull('booking_order.user_id');
                    })
                    ->orWhere(function (Builder $nullMismatch): void {
                        $nullMismatch
                            ->whereNotNull('booking.user_id')
                            ->whereNull('booking_order.user_id');
                    });
            });
    }

    private function settledOrderProjectionPending(string $orderType): Builder
    {
        return DB::table('booking_orders as booking_order')
            ->join('transactions as payment_tx', function ($join) use ($orderType): void {
                $join
                    ->on('payment_tx.transactionable_id', '=', 'booking_order.id')
                    ->where('payment_tx.transactionable_type', '=', $orderType);
            })
            ->selectRaw('booking_order.id AS subject_id, payment_tx.id AS related_id')
            ->whereIn('booking_order.status', ['draft', 'pending_payment'])
            ->where(function (Builder $settled): void {
                $settled
                    ->where('payment_tx.payment_status', 'PAID')
                    ->orWhereExists(function (Builder $attempt): void {
                        $attempt
                            ->selectRaw('1')
                            ->from('payment_attempts')
                            ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                            ->where('payment_attempts.status', 'paid');
                    });
            });
    }

    private function settledDirectBookingPending(string $bookingType): Builder
    {
        return DB::table('bookings as booking')
            ->join('transactions as payment_tx', function ($join) use ($bookingType): void {
                $join
                    ->on('payment_tx.transactionable_id', '=', 'booking.id')
                    ->where('payment_tx.transactionable_type', '=', $bookingType);
            })
            ->selectRaw('booking.id AS subject_id, payment_tx.id AS related_id')
            ->whereNull('booking.booking_order_id')
            ->where('booking.status', 'pending')
            ->where(function (Builder $settled): void {
                $settled
                    ->where('payment_tx.payment_status', 'PAID')
                    ->orWhereExists(function (Builder $attempt): void {
                        $attempt
                            ->selectRaw('1')
                            ->from('payment_attempts')
                            ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                            ->where('payment_attempts.status', 'paid');
                    });
            });
    }

    private function completionDue(CarbonImmutable $dueBefore): Builder
    {
        $date = $dueBefore->toDateString();
        $time = $dueBefore->format('H:i:s');

        return DB::table('bookings')
            ->selectRaw('id AS subject_id, NULL AS related_id')
            ->where('status', 'confirmed')
            ->where(function (Builder $query) use ($date, $time): void {
                $query
                    ->whereDate('booking_date', '<', $date)
                    ->orWhere(function (Builder $sameDay) use ($date, $time): void {
                        $sameDay
                            ->whereDate('booking_date', $date)
                            ->whereTime('end_time', '<=', $time);
                    });
            });
    }

    private function unpaidOrderExpiryDue(
        string $orderType,
        CarbonImmutable $dueBefore,
    ): Builder {
        return DB::table('booking_orders as booking_order')
            ->join('transactions as payment_tx', function ($join) use ($orderType): void {
                $join
                    ->on('payment_tx.transactionable_id', '=', 'booking_order.id')
                    ->where('payment_tx.transactionable_type', '=', $orderType);
            })
            ->selectRaw('booking_order.id AS subject_id, payment_tx.id AS related_id')
            ->whereIn('booking_order.status', ['draft', 'pending_payment'])
            ->whereNotNull('booking_order.expires_at')
            ->where('booking_order.expires_at', '<=', $dueBefore)
            ->where('payment_tx.payment_status', 'UNPAID')
            ->whereNotExists(function (Builder $attempt): void {
                $attempt
                    ->selectRaw('1')
                    ->from('payment_attempts')
                    ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                    ->where('payment_attempts.status', 'paid');
            })
            ->whereNotExists(function (Builder $attempt): void {
                $attempt
                    ->selectRaw('1')
                    ->from('payment_attempts')
                    ->whereColumn('payment_attempts.transaction_id', 'payment_tx.id')
                    ->whereIn('payment_attempts.status', ['creating', 'pending', 'reconciling'])
                    ->where(function (Builder $provider): void {
                        $provider
                            ->whereNotNull('payment_attempts.provider')
                            ->orWhereNotNull('payment_attempts.provider_reference')
                            ->orWhereNotNull('payment_attempts.provider_transaction_id');
                    });
            });
    }

    private function confirmedResourceCollisions(
        string $windowStart,
        string $windowEnd,
    ): Builder {
        return DB::table('bookings as left_booking')
            ->join('facilities as facility', 'facility.id', '=', 'left_booking.facility_id')
            ->leftJoin('facility_categories as category', 'category.id', '=', 'facility.facility_category_id')
            ->join('bookings as right_booking', function ($join): void {
                $join
                    ->on('right_booking.facility_id', '=', 'left_booking.facility_id')
                    ->on('right_booking.booking_date', '=', 'left_booking.booking_date')
                    ->on('right_booking.start_time', '<', 'left_booking.end_time')
                    ->on('right_booking.end_time', '>', 'left_booking.start_time')
                    ->on('right_booking.id', '>', 'left_booking.id');
            })
            ->selectRaw('left_booking.id AS subject_id, right_booking.id AS related_id')
            ->where('left_booking.status', 'confirmed')
            ->where('right_booking.status', 'confirmed')
            ->whereBetween('left_booking.booking_date', [$windowStart, $windowEnd])
            ->where(function (Builder $classification): void {
                $this->whereExclusiveFacility($classification);
            })
            ->where(function (Builder $resource): void {
                $resource
                    ->where(function (Builder $sameUnit): void {
                        $sameUnit
                            ->whereNotNull('left_booking.facility_unit_id')
                            ->whereNotNull('right_booking.facility_unit_id')
                            ->whereColumn(
                                'left_booking.facility_unit_id',
                                'right_booking.facility_unit_id',
                            );
                    })
                    ->orWhere(function (Builder $parentToUnit): void {
                        $parentToUnit
                            ->whereNull('left_booking.facility_unit_id')
                            ->whereNotNull('right_booking.facility_unit_id');
                    })
                    ->orWhere(function (Builder $unitToParent): void {
                        $unitToParent
                            ->whereNotNull('left_booking.facility_unit_id')
                            ->whereNull('right_booking.facility_unit_id');
                    })
                    ->orWhere(function (Builder $parentToParent): void {
                        $parentToParent
                            ->whereNull('left_booking.facility_unit_id')
                            ->whereNull('right_booking.facility_unit_id');
                    });
            });
    }

    private function confirmedCapacityExceeded(
        string $windowStart,
        string $windowEnd,
    ): Builder {
        // Capacity can only increase at the start of a booking. Evaluating the
        // confirmed cohort at every start point therefore detects the exact
        // peak without materializing an unbounded timeline in PHP.
        $unitCapacity = DB::table('bookings as start_point')
            ->join('facilities as facility', 'facility.id', '=', 'start_point.facility_id')
            ->leftJoin('facility_categories as category', 'category.id', '=', 'facility.facility_category_id')
            ->join('facility_units as target_unit', 'target_unit.facility_id', '=', 'facility.id')
            ->join('bookings as active_booking', function ($join): void {
                $join
                    ->on('active_booking.facility_id', '=', 'start_point.facility_id')
                    ->on('active_booking.booking_date', '=', 'start_point.booking_date')
                    ->on('active_booking.start_time', '<=', 'start_point.start_time')
                    ->on('active_booking.end_time', '>', 'start_point.start_time');
            })
            ->selectRaw('start_point.id AS subject_id, target_unit.id AS related_id')
            ->where('start_point.status', 'confirmed')
            ->where('active_booking.status', 'confirmed')
            ->whereBetween('start_point.booking_date', [$windowStart, $windowEnd])
            ->where(function (Builder $classification): void {
                $this->whereClassFacility($classification);
            })
            ->where(function (Builder $target): void {
                $target
                    ->whereColumn('target_unit.id', 'start_point.facility_unit_id')
                    ->orWhereNull('start_point.facility_unit_id');
            })
            ->where(function (Builder $resource): void {
                $resource
                    ->whereColumn('active_booking.facility_unit_id', 'target_unit.id')
                    ->orWhereNull('active_booking.facility_unit_id');
            })
            ->groupBy(['start_point.id', 'target_unit.id', 'facility.capacity'])
            ->havingRaw(
                'SUM(CASE WHEN active_booking.pax IS NULL OR active_booking.pax < 1 THEN 1 ELSE active_booking.pax END)'
                .' > CASE WHEN facility.capacity < 1 THEN 1 ELSE facility.capacity END',
            );

        $parentCapacity = DB::table('bookings as start_point')
            ->join('facilities as facility', 'facility.id', '=', 'start_point.facility_id')
            ->leftJoin('facility_categories as category', 'category.id', '=', 'facility.facility_category_id')
            ->join('bookings as active_booking', function ($join): void {
                $join
                    ->on('active_booking.facility_id', '=', 'start_point.facility_id')
                    ->on('active_booking.booking_date', '=', 'start_point.booking_date')
                    ->on('active_booking.start_time', '<=', 'start_point.start_time')
                    ->on('active_booking.end_time', '>', 'start_point.start_time');
            })
            ->selectRaw('start_point.id AS subject_id, NULL AS related_id')
            ->where('start_point.status', 'confirmed')
            ->where('active_booking.status', 'confirmed')
            ->whereNull('start_point.facility_unit_id')
            ->whereNull('active_booking.facility_unit_id')
            ->whereBetween('start_point.booking_date', [$windowStart, $windowEnd])
            ->whereNotExists(function (Builder $unit): void {
                $unit
                    ->selectRaw('1')
                    ->from('facility_units')
                    ->whereColumn('facility_units.facility_id', 'facility.id');
            })
            ->where(function (Builder $classification): void {
                $this->whereClassFacility($classification);
            })
            ->groupBy(['start_point.id', 'facility.capacity'])
            ->havingRaw(
                'SUM(CASE WHEN active_booking.pax IS NULL OR active_booking.pax < 1 THEN 1 ELSE active_booking.pax END)'
                .' > CASE WHEN facility.capacity < 1 THEN 1 ELSE facility.capacity END',
            );

        return $unitCapacity->unionAll($parentCapacity);
    }

    private function whereClassFacility(Builder $query): void
    {
        $query->where(function (Builder $class): void {
            foreach (['class', 'kelas'] as $token) {
                foreach (['facility.class_code', 'category.slug', 'category.name'] as $column) {
                    $class->orWhereRaw(
                        "LOWER(COALESCE({$column}, '')) LIKE ?",
                        ["%{$token}%"],
                    );
                }
            }
        });
    }

    private function whereExclusiveFacility(Builder $query): void
    {
        foreach (['class', 'kelas'] as $token) {
            foreach (['facility.class_code', 'category.slug', 'category.name'] as $column) {
                $query->whereRaw(
                    "LOWER(COALESCE({$column}, '')) NOT LIKE ?",
                    ["%{$token}%"],
                );
            }
        }
    }
}
