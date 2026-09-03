<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(
                ['booking_date', 'start_time', 'id'],
                'bookings_admin_calendar_idx',
            );
            $table->index(['status', 'id'], 'bookings_admin_status_cursor_idx');
            $table->index(['customer_name', 'id'], 'bookings_admin_name_cursor_idx');
        });

        Schema::table('memberships', function (Blueprint $table): void {
            $table->index(
                ['status', 'start_date', 'end_date', 'id'],
                'memberships_admin_status_period_idx',
            );
            $table->index(
                ['start_date', 'end_date', 'id'],
                'memberships_admin_period_cursor_idx',
            );
            $table->index(
                ['customer_name', 'id'],
                'memberships_admin_name_cursor_idx',
            );
            $table->index('registration_phone', 'memberships_registration_phone_idx');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->index(['name', 'id'], 'users_admin_member_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_admin_member_lookup_idx');
        });

        Schema::table('memberships', function (Blueprint $table): void {
            $table->dropIndex('memberships_registration_phone_idx');
            $table->dropIndex('memberships_admin_name_cursor_idx');
            $table->dropIndex('memberships_admin_period_cursor_idx');
            $table->dropIndex('memberships_admin_status_period_idx');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex('bookings_admin_name_cursor_idx');
            $table->dropIndex('bookings_admin_status_cursor_idx');
            $table->dropIndex('bookings_admin_calendar_idx');
        });
    }
};
