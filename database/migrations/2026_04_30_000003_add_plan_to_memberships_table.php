<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->foreignId('membership_plan_id')
                  ->nullable()
                  ->after('user_id')
                  ->constrained('membership_plans')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->dropForeign(['membership_plan_id']);
            $table->dropColumn('membership_plan_id');
        });
    }
};
