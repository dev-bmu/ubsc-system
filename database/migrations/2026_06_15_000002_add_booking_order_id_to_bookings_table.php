<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->foreignId('booking_order_id')
                ->nullable()
                ->after('id')
                ->constrained('booking_orders')
                ->nullOnDelete();

            $table->index(['booking_order_id', 'booking_date']);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['booking_order_id']);
            $table->dropIndex(['booking_order_id', 'booking_date']);
            $table->dropColumn('booking_order_id');
        });
    }
};
