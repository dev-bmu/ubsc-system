<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * These indexes support status/lifecycle predicates used by the bounded
     * operational collectors. They do not change business data or constraints.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->index(
                ['payment_status', 'paid_at'],
                'transactions_payment_status_paid_at_idx',
            );
        });

        Schema::table('payment_attempts', function (Blueprint $table): void {
            $table->index(
                ['status', 'updated_at'],
                'payment_attempts_status_updated_idx',
            );
            $table->index(
                ['status', 'paid_at'],
                'payment_attempts_status_paid_at_idx',
            );
        });

        Schema::table('memberships', function (Blueprint $table): void {
            $table->index(
                ['status', 'end_date'],
                'memberships_status_end_date_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table): void {
            $table->dropIndex('memberships_status_end_date_idx');
        });

        Schema::table('payment_attempts', function (Blueprint $table): void {
            $table->dropIndex('payment_attempts_status_paid_at_idx');
            $table->dropIndex('payment_attempts_status_updated_idx');
        });

        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropIndex('transactions_payment_status_paid_at_idx');
        });
    }
};
