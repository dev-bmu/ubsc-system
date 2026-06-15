<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_units', function (Blueprint $table) {
            $table->boolean('use_custom_schedule')->default(false)->after('is_active');
            $table->json('active_slots')->nullable()->after('use_custom_schedule');
            $table->boolean('use_custom_pricing')->default(false)->after('active_slots');
        });

        Schema::create('facility_unit_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_unit_id')->constrained('facility_units')->cascadeOnDelete();
            $table->enum('user_category', ['warga_ub', 'umum']);
            $table->string('label');
            $table->unsignedBigInteger('price');
            $table->unsignedSmallInteger('duration_minutes')->nullable();
            $table->string('schedule_type')->default('regular');
            $table->json('applicable_days')->nullable();
            $table->time('starts_at')->nullable();
            $table->time('ends_at')->nullable();
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->string('notes')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['facility_unit_id', 'user_category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facility_unit_prices');

        Schema::table('facility_units', function (Blueprint $table) {
            $table->dropColumn([
                'use_custom_schedule',
                'active_slots',
                'use_custom_pricing',
            ]);
        });
    }
};
