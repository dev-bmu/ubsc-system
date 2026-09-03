<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_log_receipts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('receipt_id')->unique();
            $table->string('operation_id', 100)->unique();
            $table->string('provider', 64);
            $table->string('environment', 32);
            $table->string('release', 128);
            $table->string('source_key_id', 32);
            $table->char('source_event_sha256', 64);
            $table->json('payload');
            $table->char('payload_hash', 64)->unique();
            $table->text('source_signature');
            $table->dateTime('ingested_at');
            $table->dateTime('retention_until');
            $table->dateTime('recorded_at');

            $table->index(
                ['provider', 'environment', 'release', 'ingested_at', 'id'],
                'monitoring_log_receipt_current_idx',
            );
        });
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('monitoring_log_receipts')
            && DB::table('monitoring_log_receipts')->exists()) {
            throw new RuntimeException(
                'Log-receipt rollback refused: signed operational evidence exists.',
            );
        }

        Schema::dropIfExists('monitoring_log_receipts');
    }
};
