<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_alert_deliveries', function (Blueprint $table): void {
            $table->index(
                ['status', 'claimed_at', 'id'],
                'monitoring_alert_stale_claim_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_alert_deliveries', function (Blueprint $table): void {
            $table->dropIndex('monitoring_alert_stale_claim_idx');
        });
    }
};
