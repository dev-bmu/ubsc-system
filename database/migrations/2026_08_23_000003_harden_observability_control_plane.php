<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_external_sli_receipts', function (Blueprint $table): void {
            $table->id();
            $table->string('provider', 64);
            $table->string('probe_id', 100);
            $table->string('signing_key_id', 32);
            $table->string('status', 16);
            $table->dateTime('checked_at');
            $table->dateTime('completed_at');
            $table->unsignedInteger('latency_ms')->nullable();
            $table->char('body_sha256', 64);
            $table->dateTime('recorded_at');

            $table->unique(
                ['provider', 'probe_id'],
                'monitoring_external_sli_probe_unique',
            );
            $table->index(
                ['completed_at', 'id'],
                'monitoring_external_sli_retention_idx',
            );
        });

        Schema::table('monitoring_alert_deliveries', function (Blueprint $table): void {
            $table->index(
                ['status', 'created_at', 'id'],
                'monitoring_alert_status_created_idx',
            );
            $table->index(
                ['channel', 'status', 'delivered_at'],
                'monitoring_alert_channel_delivery_idx',
            );
        });
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('monitoring_external_sli_receipts')
            && DB::table('monitoring_external_sli_receipts')->exists()) {
            throw new RuntimeException(
                'External SLI rollback refused: signed operational receipts exist.',
            );
        }

        if (Schema::hasTable('monitoring_alert_deliveries')) {
            Schema::table('monitoring_alert_deliveries', function (Blueprint $table): void {
                $table->dropIndex('monitoring_alert_status_created_idx');
                $table->dropIndex('monitoring_alert_channel_delivery_idx');
            });
        }

        Schema::dropIfExists('monitoring_external_sli_receipts');
    }
};
