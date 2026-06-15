<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facilities', function (Blueprint $table) {
            $table->unsignedInteger('capacity')->default(1)->after('venue_type');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('pax')->default(1)->after('end_time');
        });
    }

    public function down(): void
    {
        Schema::table('facilities', function (Blueprint $table) {
            $table->dropColumn('capacity');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('pax');
        });
    }
};
