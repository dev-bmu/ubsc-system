<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->string('payment_method', 40)
                ->nullable()
                ->after('payment_status');
            $table->json('service_snapshot')
                ->nullable()
                ->after('checkout_url');

            $table->index(
                ['user_id', 'id'],
                'transactions_user_history_idx',
            );
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(
                ['status', 'booking_date', 'end_time'],
                'bookings_lifecycle_due_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex('bookings_lifecycle_due_idx');
        });

        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropIndex('transactions_user_history_idx');
            $table->dropColumn([
                'payment_method',
                'service_snapshot',
            ]);
        });
    }
};
