<?php

namespace App\Services;

use App\Exceptions\BookingCheckoutSchemaUnavailable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BookingCheckoutSchema
{
    public const REQUIRED_MIGRATION = '2026_08_27_000001_add_customer_phone_to_bookings_table';

    public const REQUIRED_CONTENTION_MIGRATION = '2026_08_31_000001_harden_booking_contention_paths';

    /** @var list<string> */
    private const REQUIRED_MIGRATIONS = [
        self::REQUIRED_MIGRATION,
        self::REQUIRED_CONTENTION_MIGRATION,
    ];

    /** @var array<string, list<string>> */
    private const REQUIRED_OPERATIONAL_INDEXES = [
        'bookings' => ['bookings_inventory_lock_idx'],
        'booking_orders' => [
            'booking_orders_user_live_hold_idx',
            'booking_orders_user_fingerprint_idx',
        ],
    ];

    /** @var array<string, list<string>> */
    private const REQUIRED_WRITE_COLUMNS = [
        'bookings' => [
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
        ],
        'booking_orders' => [
            'user_id',
            'idempotency_key',
            'request_fingerprint',
            'currency',
            'terms_version',
            'customer_name',
            'whatsapp_number',
            'identity_category',
            'identity_number',
            'subtotal_amount',
            'transaction_fee',
            'discount_amount',
            'total_amount',
            'status',
            'notes',
            'expires_at',
        ],
        'transactions' => [
            'user_id',
            'transactionable_id',
            'transactionable_type',
            'amount',
            'payment_status',
            'checkout_url',
            'service_snapshot',
        ],
    ];

    public function assertWriteCompatible(): void
    {
        $missing = [];

        foreach (self::REQUIRED_WRITE_COLUMNS as $table => $columns) {
            if (! Schema::hasTable($table)) {
                $missing[] = "table:{$table}";

                continue;
            }

            $availableColumns = array_fill_keys(
                array_map(
                    static fn (string $column): string => strtolower($column),
                    Schema::getColumnListing($table),
                ),
                true,
            );

            foreach ($columns as $column) {
                if (! isset($availableColumns[strtolower($column)])) {
                    $missing[] = "column:{$table}.{$column}";
                }
            }
        }

        if ($missing !== []) {
            throw new BookingCheckoutSchemaUnavailable($missing);
        }
    }

    /**
     * Deployment/readiness is stricter than the request path. A partially
     * completed MySQL DDL sequence may already contain the write columns, but
     * the node must not receive production traffic until Laravel has recorded
     * the complete migration (including its operational indexes).
     */
    public function assertDeploymentComplete(): void
    {
        $this->assertWriteCompatible();

        $missing = [];

        foreach (self::REQUIRED_MIGRATIONS as $migration) {
            if (! Schema::hasTable('migrations')
                || ! DB::table('migrations')
                    ->where('migration', $migration)
                    ->exists()) {
                $missing[] = 'migration:'.$migration;
            }
        }

        foreach (self::REQUIRED_OPERATIONAL_INDEXES as $table => $indexes) {
            foreach ($indexes as $index) {
                if (! Schema::hasTable($table) || ! Schema::hasIndex($table, $index)) {
                    $missing[] = "index:{$table}.{$index}";
                }
            }
        }

        if ($missing !== []) {
            throw new BookingCheckoutSchemaUnavailable($missing);
        }
    }

    public static function causedByQueryException(QueryException $exception): bool
    {
        $sqlState = strtoupper((string) ($exception->errorInfo[0] ?? $exception->getCode()));
        $driverCode = (int) ($exception->errorInfo[1] ?? 0);

        return in_array($sqlState, ['42S02', '42S22', '42703', '42P01'], true)
            || in_array($driverCode, [1054, 1146], true);
    }
}
