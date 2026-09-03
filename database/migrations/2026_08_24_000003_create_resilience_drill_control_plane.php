<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resilience_drill_chain_heads', function (Blueprint $table): void {
            $table->string('key', 32)->primary();
            $table->unsignedBigInteger('sequence')->default(0);
            $table->char('last_hash', 64)->nullable();
            $table->timestamps();
        });

        DB::table('resilience_drill_chain_heads')->insert([
            'key' => 'primary',
            'sequence' => 0,
            'last_hash' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::create('resilience_drill_evidence', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->unsignedBigInteger('sequence')->unique();
            $table->uuid('campaign_id')->unique();
            $table->string('status', 16);
            $table->string('environment', 32);
            $table->string('release', 128);
            $table->string('infrastructure_profile', 128);
            $table->string('provider', 64);
            $table->string('orchestrator', 64);
            $table->string('approval_reference', 100);
            $table->boolean('campaign_controls_passed');
            $table->dateTime('started_at');
            $table->dateTime('completed_at');
            $table->unsignedSmallInteger('scenario_count');
            $table->unsignedSmallInteger('passed_count');
            $table->unsignedSmallInteger('failed_count');
            $table->unsignedSmallInteger('aborted_count');
            $table->unsignedInteger('worst_detection_seconds');
            $table->unsignedInteger('worst_recovery_seconds');
            $table->json('payload');
            $table->char('payload_hash', 64)->unique();
            $table->string('source_key_id', 32);
            $table->text('source_signature');
            $table->string('ledger_key_id', 32);
            $table->char('previous_hash', 64)->nullable();
            $table->char('record_hash', 64)->unique();
            $table->char('ledger_signature', 64);
            $table->dateTime('recorded_at');

            $table->index(
                ['environment', 'completed_at', 'id'],
                'resilience_drill_current_idx',
            );
            $table->index(
                ['status', 'completed_at', 'id'],
                'resilience_drill_status_idx',
            );
        });
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('resilience_drill_evidence')
            && DB::table('resilience_drill_evidence')->exists()) {
            throw new RuntimeException(
                'Resilience drill rollback refused: signed operational evidence exists.',
            );
        }

        Schema::dropIfExists('resilience_drill_evidence');
        Schema::dropIfExists('resilience_drill_chain_heads');
    }
};
