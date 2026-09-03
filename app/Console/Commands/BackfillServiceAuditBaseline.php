<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Models\BookingOrder;
use App\Models\Facility;
use App\Models\FacilityUnit;
use App\Models\Membership;
use App\Models\Transaction;
use App\Services\DataGovernance\ServiceAuditLogger;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

final class BackfillServiceAuditBaseline extends Command
{
    protected $signature = 'services:audit-baseline {--chunk= : Number of records processed per database chunk}';

    protected $description = 'Idempotently establish append-only audit baselines for existing service data';

    /** @var array<class-string<Model>, array{type:string,state:?string,safe:list<string>}> */
    private const SUBJECTS = [
        Booking::class => ['type' => 'booking', 'state' => 'status', 'safe' => ['booking_order_id', 'user_id', 'facility_id', 'facility_unit_id', 'booking_date', 'start_time', 'end_time', 'pax', 'subtotal_price', 'status']],
        BookingOrder::class => ['type' => 'booking_order', 'state' => 'status', 'safe' => ['user_id', 'currency', 'subtotal_amount', 'transaction_fee', 'discount_amount', 'total_amount', 'status', 'expires_at']],
        Membership::class => ['type' => 'membership', 'state' => 'status', 'safe' => ['user_id', 'membership_plan_id', 'renewed_from_membership_id', 'start_date', 'end_date', 'status', 'created_by_id', 'created_via', 'registration_expires_at']],
        Transaction::class => ['type' => 'transaction', 'state' => 'payment_status', 'safe' => ['user_id', 'transactionable_type', 'transactionable_id', 'amount', 'payment_status', 'payment_method', 'paid_at']],
        Facility::class => ['type' => 'facility', 'state' => 'is_active', 'safe' => ['facility_category_id', 'venue_type', 'capacity', 'reservation_method', 'is_active', 'sort_order']],
        FacilityUnit::class => ['type' => 'facility_unit', 'state' => 'is_active', 'safe' => ['facility_id', 'is_active', 'capacity', 'use_custom_schedule', 'use_custom_pricing']],
    ];

    public function handle(ServiceAuditLogger $audit): int
    {
        $chunk = (int) ($this->option('chunk') ?: config('data_audit.baseline_chunk_size', 500));
        $chunk = max(50, min(5000, $chunk));
        $lock = Cache::lock('service-audit:baseline-lock', 3600);

        if (! $lock->get()) {
            $this->error('A service-audit baseline process is already running.');

            return self::FAILURE;
        }

        try {
            $created = 0;

            foreach (self::SUBJECTS as $modelClass => $definition) {
                $table = (new $modelClass)->getTable();

                $modelClass::query()
                    ->whereNotExists(function ($query) use ($table, $definition): void {
                        $query
                            ->selectRaw('1')
                            ->from('service_audit_events')
                            ->where('subject_type', $definition['type'])
                            ->whereColumn('subject_id', "{$table}.id");
                    })
                    ->orderBy('id')
                    ->chunkById($chunk, function ($models) use ($audit, $definition, &$created): void {
                        foreach ($models as $model) {
                            $snapshot = [];

                            foreach ($definition['safe'] as $field) {
                                $value = $model->getAttribute($field);
                                $snapshot[$field] = $value instanceof \DateTimeInterface
                                    ? $value->format(DATE_ATOM)
                                    : $value;
                            }

                            $state = $definition['state'] === null
                                ? null
                                : $this->normalizeState($model->getAttribute($definition['state']));

                            $audit->record(
                                $definition['type'],
                                (int) $model->getKey(),
                                'baseline_captured',
                                null,
                                $state,
                                ['snapshot' => $snapshot],
                                actorType: 'system',
                                source: 'system:audit-baseline',
                                reasonCode: 'legacy_record_baseline',
                                deduplicationKey: hash('sha256', "baseline|{$definition['type']}|{$model->getKey()}"),
                            );
                            $created++;
                        }
                    });
            }

            $this->info("Service audit baseline complete: {$created} event(s) created.");

            return self::SUCCESS;
        } finally {
            $lock->release();
        }
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
}
