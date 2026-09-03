<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->index('created_at', 'bookings_created_at_idx');
        });

        Schema::table('memberships', function (Blueprint $table): void {
            $table->index('created_at', 'memberships_created_at_idx');
        });

        Schema::table('failed_jobs', function (Blueprint $table): void {
            $table->index('failed_at', 'failed_jobs_failed_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('failed_jobs', function (Blueprint $table): void {
            $table->dropIndex('failed_jobs_failed_at_idx');
        });

        Schema::table('memberships', function (Blueprint $table): void {
            $table->dropIndex('memberships_created_at_idx');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex('bookings_created_at_idx');
        });
    }
};
