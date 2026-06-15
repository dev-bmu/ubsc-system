<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_schedules', function (Blueprint $table) {
            $table->json('closed_dates')->nullable()->after('is_open');
        });
    }

    public function down(): void
    {
        Schema::table('booking_schedules', function (Blueprint $table) {
            $table->dropColumn('closed_dates');
        });
    }
};
