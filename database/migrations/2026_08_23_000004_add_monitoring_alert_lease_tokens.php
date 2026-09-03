<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_alert_deliveries', function (Blueprint $table): void {
            // A stale worker must not be able to acknowledge or fail a lease
            // that has already been reclaimed by another process.
            $table->uuid('claim_token')->nullable()->after('claimed_at');
        });
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('monitoring_alert_deliveries')
            && DB::table('monitoring_alert_deliveries')
                ->whereNotNull('claim_token')
                ->exists()) {
            throw new RuntimeException(
                'Alert lease-token rollback refused while a delivery lease is active.',
            );
        }

        Schema::table('monitoring_alert_deliveries', function (Blueprint $table): void {
            $table->dropColumn('claim_token');
        });
    }
};
