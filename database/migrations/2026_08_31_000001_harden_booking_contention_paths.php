<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const INVENTORY_LOCK_INDEX = 'bookings_inventory_lock_idx';

    private const USER_LIVE_HOLD_INDEX = 'booking_orders_user_live_hold_idx';

    private const USER_FINGERPRINT_INDEX = 'booking_orders_user_fingerprint_idx';

    public function up(): void
    {
        foreach (['bookings', 'booking_orders'] as $requiredTable) {
            if (! Schema::hasTable($requiredTable)) {
                throw new RuntimeException(
                    "Booking contention migration requires the {$requiredTable} table.",
                );
            }
        }

        // MySQL DDL is not transactional. Each step is intentionally
        // repeatable so an interrupted deployment can safely converge.
        if (! Schema::hasIndex('bookings', self::INVENTORY_LOCK_INDEX)) {
            Schema::table('bookings', function (Blueprint $table): void {
                $table->index([
                    'facility_id',
                    'booking_date',
                    'status',
                    'facility_unit_id',
                    'start_time',
                    'end_time',
                    'id',
                ], self::INVENTORY_LOCK_INDEX);
            });
        }

        if (! Schema::hasIndex('booking_orders', self::USER_LIVE_HOLD_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->index([
                    'user_id',
                    'status',
                    'expires_at',
                    'id',
                ], self::USER_LIVE_HOLD_INDEX);
            });
        }

        if (! Schema::hasIndex('booking_orders', self::USER_FINGERPRINT_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->index([
                    'user_id',
                    'request_fingerprint',
                    'status',
                    'expires_at',
                    'id',
                ], self::USER_FINGERPRINT_INDEX);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('booking_orders')
            && Schema::hasIndex('booking_orders', self::USER_FINGERPRINT_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->dropIndex(self::USER_FINGERPRINT_INDEX);
            });
        }

        if (Schema::hasTable('booking_orders')
            && Schema::hasIndex('booking_orders', self::USER_LIVE_HOLD_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->dropIndex(self::USER_LIVE_HOLD_INDEX);
            });
        }

        if (Schema::hasTable('bookings')
            && Schema::hasIndex('bookings', self::INVENTORY_LOCK_INDEX)) {
            Schema::table('bookings', function (Blueprint $table): void {
                $table->dropIndex(self::INVENTORY_LOCK_INDEX);
            });
        }
    }
};
