<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropForeign(['facility_id']);
            $table->dropForeign(['facility_unit_id']);
            $table->dropForeign(['booking_order_id']);
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->foreign('facility_id')
                ->references('id')
                ->on('facilities')
                ->restrictOnDelete();
            $table->foreign('facility_unit_id')
                ->references('id')
                ->on('facility_units')
                ->restrictOnDelete();
            $table->foreign('booking_order_id')
                ->references('id')
                ->on('booking_orders')
                ->restrictOnDelete();
        });

        Schema::table('membership_histories', function (Blueprint $table): void {
            $table->dropForeign(['membership_id']);
        });

        Schema::table('membership_histories', function (Blueprint $table): void {
            $table->foreign('membership_id')
                ->references('id')
                ->on('memberships')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        $hasDurableHistory = DB::table('bookings')->exists()
            || DB::table('membership_histories')->exists();

        if ($hasDurableHistory) {
            throw new RuntimeException(
                'Service-history rollback refused: reverting these foreign keys could cascade-delete booking or membership history.',
            );
        }

        Schema::table('membership_histories', function (Blueprint $table): void {
            $table->dropForeign(['membership_id']);
            $table->foreign('membership_id')
                ->references('id')
                ->on('memberships')
                ->cascadeOnDelete();
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropForeign(['facility_id']);
            $table->dropForeign(['facility_unit_id']);
            $table->dropForeign(['booking_order_id']);
            $table->foreign('facility_id')
                ->references('id')
                ->on('facilities')
                ->cascadeOnDelete();
            $table->foreign('facility_unit_id')
                ->references('id')
                ->on('facility_units')
                ->nullOnDelete();
            $table->foreign('booking_order_id')
                ->references('id')
                ->on('booking_orders')
                ->nullOnDelete();
        });
    }
};
