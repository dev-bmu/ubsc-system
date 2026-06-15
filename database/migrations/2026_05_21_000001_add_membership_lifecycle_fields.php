<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->foreignId('renewed_from_membership_id')
                ->nullable()
                ->after('membership_plan_id')
                ->constrained('memberships')
                ->nullOnDelete();

            $table->foreignId('created_by_id')
                ->nullable()
                ->after('status')
                ->constrained('users')
                ->nullOnDelete();

            $table->string('created_via', 20)
                ->default('admin')
                ->after('created_by_id');

            $table->index(['user_id', 'status', 'start_date', 'end_date'], 'memberships_user_status_dates_idx');
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->dropIndex('memberships_user_status_dates_idx');
            $table->dropForeign(['renewed_from_membership_id']);
            $table->dropForeign(['created_by_id']);
            $table->dropColumn([
                'renewed_from_membership_id',
                'created_by_id',
                'created_via',
            ]);
        });
    }
};
