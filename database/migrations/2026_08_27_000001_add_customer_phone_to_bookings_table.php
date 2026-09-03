<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const BOOKING_PHONE_INDEX = 'bookings_admin_phone_cursor_idx';

    private const ORDER_NAME_INDEX = 'booking_orders_admin_name_idx';

    private const ORDER_PHONE_INDEX = 'booking_orders_admin_phone_idx';

    private const USER_PHONE_INDEX = 'users_admin_phone_lookup_idx';

    public function up(): void
    {
        foreach (['bookings', 'booking_orders', 'users'] as $requiredTable) {
            if (! Schema::hasTable($requiredTable)) {
                throw new RuntimeException(
                    "Booking contact migration requires the {$requiredTable} table.",
                );
            }
        }

        // MySQL DDL is not transactional. Keep each step independently
        // repeatable so an interrupted deployment can safely converge on the
        // complete schema instead of failing on an already-created object.
        if (! Schema::hasColumn('bookings', 'customer_phone')) {
            Schema::table('bookings', function (Blueprint $table): void {
                $table->string('customer_phone', 30)
                    ->nullable()
                    ->after('customer_name');
            });
        }

        if (! Schema::hasIndex('bookings', self::BOOKING_PHONE_INDEX)) {
            Schema::table('bookings', function (Blueprint $table): void {
                $table->index(
                    ['customer_phone', 'id'],
                    self::BOOKING_PHONE_INDEX,
                );
            });
        }

        if (! Schema::hasIndex('booking_orders', self::ORDER_NAME_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->index(
                    ['customer_name', 'id'],
                    self::ORDER_NAME_INDEX,
                );
            });
        }

        if (! Schema::hasIndex('booking_orders', self::ORDER_PHONE_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->index(
                    ['whatsapp_number', 'id'],
                    self::ORDER_PHONE_INDEX,
                );
            });
        }

        if (! Schema::hasIndex('users', self::USER_PHONE_INDEX)) {
            Schema::table('users', function (Blueprint $table): void {
                $table->index(
                    ['phone_number', 'id'],
                    self::USER_PHONE_INDEX,
                );
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('bookings')
            && Schema::hasColumn('bookings', 'customer_phone')
            && DB::table('bookings')->whereNotNull('customer_phone')->exists()) {
            throw new RuntimeException(
                'Booking contact rollback refused: customer_phone already contains operational data.',
            );
        }

        if (Schema::hasTable('users')
            && Schema::hasIndex('users', self::USER_PHONE_INDEX)) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropIndex(self::USER_PHONE_INDEX);
            });
        }

        if (Schema::hasTable('booking_orders')
            && Schema::hasIndex('booking_orders', self::ORDER_PHONE_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->dropIndex(self::ORDER_PHONE_INDEX);
            });
        }

        if (Schema::hasTable('booking_orders')
            && Schema::hasIndex('booking_orders', self::ORDER_NAME_INDEX)) {
            Schema::table('booking_orders', function (Blueprint $table): void {
                $table->dropIndex(self::ORDER_NAME_INDEX);
            });
        }

        if (Schema::hasTable('bookings')
            && Schema::hasIndex('bookings', self::BOOKING_PHONE_INDEX)) {
            Schema::table('bookings', function (Blueprint $table): void {
                $table->dropIndex(self::BOOKING_PHONE_INDEX);
            });
        }

        if (Schema::hasTable('bookings')
            && Schema::hasColumn('bookings', 'customer_phone')) {
            Schema::table('bookings', function (Blueprint $table): void {
                $table->dropColumn('customer_phone');
            });
        }
    }
};
