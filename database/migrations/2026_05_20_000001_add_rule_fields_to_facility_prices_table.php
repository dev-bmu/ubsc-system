<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_prices', function (Blueprint $table) {
            $table->string('schedule_type')->default('regular')->after('duration_minutes');
            $table->json('applicable_days')->nullable()->after('schedule_type');
            $table->time('starts_at')->nullable()->after('applicable_days');
            $table->time('ends_at')->nullable()->after('starts_at');
            $table->date('starts_on')->nullable()->after('ends_at');
            $table->date('ends_on')->nullable()->after('starts_on');
        });
    }

    public function down(): void
    {
        Schema::table('facility_prices', function (Blueprint $table) {
            $table->dropColumn([
                'schedule_type',
                'applicable_days',
                'starts_at',
                'ends_at',
                'starts_on',
                'ends_on',
            ]);
        });
    }
};
