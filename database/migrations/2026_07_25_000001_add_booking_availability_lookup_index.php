<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const INDEX_NAME = 'bookings_avail_date_status_fac_unit_idx';

    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(
                ['booking_date', 'status', 'facility_id', 'facility_unit_id'],
                self::INDEX_NAME,
            );
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex(self::INDEX_NAME);
        });
    }
};
