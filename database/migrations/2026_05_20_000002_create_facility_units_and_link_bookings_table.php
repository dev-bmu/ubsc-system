<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facility_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['facility_id', 'is_active']);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->foreignId('facility_unit_id')
                ->nullable()
                ->after('facility_id')
                ->constrained('facility_units')
                ->nullOnDelete();

            $table->index(['facility_unit_id', 'booking_date']);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['facility_unit_id']);
            $table->dropIndex(['facility_unit_id', 'booking_date']);
            $table->dropColumn('facility_unit_id');
        });

        Schema::dropIfExists('facility_units');
    }
};
