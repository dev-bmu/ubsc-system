<?php

namespace App\Models;

use App\Enums\PaymentAttemptStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphOne;

class Booking extends Model
{
    protected $fillable = [
        'booking_order_id',
        'user_id',
        'customer_name',
        'customer_phone',
        'facility_id',
        'facility_unit_id',
        'booking_date',
        'start_time',
        'end_time',
        'pax',
        'subtotal_price',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'booking_date' => 'date',
            'pax' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function bookingOrder(): BelongsTo
    {
        return $this->belongsTo(BookingOrder::class);
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function facilityUnit(): BelongsTo
    {
        return $this->belongsTo(FacilityUnit::class);
    }

    public function transaction(): MorphOne
    {
        return $this->morphOne(Transaction::class, 'transactionable');
    }

    /**
     * Only bookings that still reserve inventory should affect availability.
     */
    public function scopeOccupyingInventory(
        Builder $query,
        ?CarbonInterface $at = null,
    ): Builder {
        $at ??= now();

        return $query->where(function (Builder $statusQuery) use ($at): void {
            $statusQuery
                ->where('status', 'confirmed')
                ->orWhere(function (Builder $pendingQuery) use ($at): void {
                    $pendingQuery
                        ->where('status', 'pending')
                        ->where(function (Builder $holdQuery) use ($at): void {
                            $holdQuery
                                ->whereNull('booking_order_id')
                                ->orWhereHas('bookingOrder', function (Builder $orderQuery) use ($at): void {
                                    $orderQuery->where(function (Builder $activeOrderQuery) use ($at): void {
                                        $activeOrderQuery
                                            ->where('status', 'paid')
                                            // A paid transaction or gateway-confirmed attempt is
                                            // authoritative even while another legacy projection is
                                            // waiting to be reconciled. Releasing this hold merely
                                            // because expires_at elapsed could sell one slot twice.
                                            ->orWhereHas('transaction', function (Builder $transactionQuery): void {
                                                $transactionQuery
                                                    ->where('payment_status', 'PAID')
                                                    ->orWhereHas(
                                                        'paymentAttempts',
                                                        fn (Builder $attemptQuery): Builder => $attemptQuery
                                                            ->where('status', PaymentAttemptStatus::Paid->value),
                                                    );
                                            })
                                            ->orWhere(function (Builder $openOrderQuery) use ($at): void {
                                                $openOrderQuery
                                                    ->whereIn('status', ['draft', 'pending_payment'])
                                                    ->where(function (Builder $expiryQuery) use ($at): void {
                                                        $expiryQuery
                                                            ->whereNull('expires_at')
                                                            ->orWhere('expires_at', '>', $at);
                                                    });
                                            });
                                    });
                                });
                        });
                });
        });
    }
}
