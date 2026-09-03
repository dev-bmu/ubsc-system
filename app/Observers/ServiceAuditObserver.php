<?php

namespace App\Observers;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Models\Membership;
use App\Models\Transaction;
use App\Services\DataGovernance\BookingOrderStatusTransitionPolicy;
use App\Services\DataGovernance\BookingStatusTransitionPolicy;
use App\Services\DataGovernance\MembershipStatusTransitionPolicy;
use App\Services\DataGovernance\ServiceAuditLogger;
use App\Services\DataGovernance\TransactionStatusTransitionPolicy;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

final class ServiceAuditObserver
{
    /** @var array<class-string<Model>, array{type:string,state:?string,safe:list<string>}> */
    private const DEFINITIONS = [
        Booking::class => [
            'type' => 'booking',
            'state' => 'status',
            'safe' => ['booking_order_id', 'user_id', 'facility_id', 'facility_unit_id', 'booking_date', 'start_time', 'end_time', 'pax', 'subtotal_price', 'status'],
        ],
        BookingOrder::class => [
            'type' => 'booking_order',
            'state' => 'status',
            'safe' => ['user_id', 'currency', 'subtotal_amount', 'transaction_fee', 'discount_amount', 'total_amount', 'status', 'expires_at'],
        ],
        Membership::class => [
            'type' => 'membership',
            'state' => 'status',
            'safe' => ['user_id', 'membership_plan_id', 'renewed_from_membership_id', 'start_date', 'end_date', 'status', 'created_by_id', 'created_via', 'registration_expires_at'],
        ],
        Transaction::class => [
            'type' => 'transaction',
            'state' => 'payment_status',
            'safe' => ['user_id', 'transactionable_type', 'transactionable_id', 'amount', 'payment_status', 'payment_method', 'paid_at'],
        ],
        Facility::class => [
            'type' => 'facility',
            'state' => 'is_active',
            'safe' => ['facility_category_id', 'venue_type', 'capacity', 'reservation_method', 'is_active', 'sort_order'],
        ],
        FacilityUnit::class => [
            'type' => 'facility_unit',
            'state' => 'is_active',
            'safe' => ['facility_id', 'is_active', 'capacity', 'use_custom_schedule', 'use_custom_pricing'],
        ],
    ];

    public function __construct(
        private readonly ServiceAuditLogger $audit,
        private readonly BookingStatusTransitionPolicy $bookingTransitions,
        private readonly BookingOrderStatusTransitionPolicy $orderTransitions,
        private readonly MembershipStatusTransitionPolicy $membershipTransitions,
        private readonly TransactionStatusTransitionPolicy $transactionTransitions,
    ) {}

    public function updating(Model $model): void
    {
        $definition = $this->definition($model);
        $stateField = $definition['state'];

        if ($stateField === null || ! $model->isDirty($stateField)) {
            return;
        }

        $from = $this->normalizeState($model->getOriginal($stateField));
        $to = $this->normalizeState($model->getAttribute($stateField));

        if ($from === null || $to === null) {
            return;
        }

        match ($model::class) {
            Booking::class => $this->bookingTransitions->assertAllowed($from, $to),
            BookingOrder::class => $this->orderTransitions->assertAllowed($from, $to),
            Membership::class => $this->membershipTransitions->assertAllowed(
                $from,
                $to,
                allowPaymentActivation: true,
            ),
            Transaction::class => $this->transactionTransitions->assertAllowed($from, $to),
            default => null,
        };
    }

    public function created(Model $model): void
    {
        if (! $this->available()) {
            return;
        }

        $definition = $this->definition($model);
        $state = $this->state($model, $definition['state']);

        $this->audit->record(
            $definition['type'],
            (int) $model->getKey(),
            'created',
            null,
            $state,
            ['snapshot' => $this->safeSnapshot($model, $definition['safe'])],
        );
    }

    public function updated(Model $model): void
    {
        if (! $this->available()) {
            return;
        }

        $definition = $this->definition($model);
        $changedFields = array_values(array_diff(
            array_keys($model->getChanges()),
            ['updated_at'],
        ));

        if ($changedFields === []) {
            return;
        }

        $stateField = $definition['state'];
        $stateChanged = $stateField !== null && in_array($stateField, $changedFields, true);
        $fromState = $stateChanged
            ? $this->normalizeState($model->getOriginal($stateField))
            : null;
        $toState = $stateChanged
            ? $this->normalizeState($model->getAttribute($stateField))
            : null;

        $this->audit->record(
            $definition['type'],
            (int) $model->getKey(),
            $stateChanged ? 'state_changed' : 'updated',
            $fromState,
            $toState,
            [
                'changed_fields' => $changedFields,
                'snapshot' => $this->safeSnapshot($model, array_values(array_intersect(
                    $definition['safe'],
                    $changedFields,
                ))),
            ],
        );
    }

    public function deleted(Model $model): void
    {
        if (! $this->available()) {
            return;
        }

        $definition = $this->definition($model);

        $this->audit->record(
            $definition['type'],
            (int) $model->getKey(),
            'deleted',
            $this->state($model, $definition['state']),
            null,
            ['snapshot' => $this->safeSnapshot($model, $definition['safe'])],
        );
    }

    /** @return array{type:string,state:?string,safe:list<string>} */
    private function definition(Model $model): array
    {
        return self::DEFINITIONS[$model::class];
    }

    /** @param list<string> $fields */
    private function safeSnapshot(Model $model, array $fields): array
    {
        $snapshot = [];

        foreach ($fields as $field) {
            $value = $model->getAttribute($field);

            if ($value instanceof DateTimeInterface) {
                $value = $value->format(DATE_ATOM);
            } elseif (is_object($value) && method_exists($value, '__toString')) {
                $value = (string) $value;
            }

            $snapshot[$field] = $value;
        }

        return $snapshot;
    }

    private function state(Model $model, ?string $field): ?string
    {
        return $field === null
            ? null
            : $this->normalizeState($model->getAttribute($field));
    }

    private function normalizeState(mixed $state): ?string
    {
        if ($state === null) {
            return null;
        }

        if (is_bool($state)) {
            return $state ? 'active' : 'inactive';
        }

        return (string) $state;
    }

    private function available(): bool
    {
        return Schema::hasTable('service_audit_events');
    }
}
