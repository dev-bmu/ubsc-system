<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recovery_evidence_chain_heads', function (Blueprint $table): void {
            $table->string('key', 32)->primary();
            $table->unsignedBigInteger('sequence')->default(0);
            $table->char('last_hash', 64)->nullable();
            $table->timestamps();
        });

        DB::table('recovery_evidence_chain_heads')->insert([
            'key' => 'primary',
            'sequence' => 0,
            'last_hash' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::create('recovery_evidence', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->unsignedBigInteger('sequence')->unique();
            $table->string('evidence_type', 32);
            $table->string('status', 16);
            $table->string('operation_id', 100);
            $table->string('backup_id', 100);
            $table->string('provider', 64);
            $table->string('target_environment', 64)->nullable();
            $table->dateTime('source_snapshot_at')->nullable();
            $table->dateTime('recovery_point_at')->nullable();
            $table->dateTime('started_at')->nullable();
            $table->dateTime('completed_at');
            $table->dateTime('immutable_until')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->char('checksum_sha256', 64);
            $table->string('object_lock_mode', 24)->nullable();
            $table->unsignedInteger('observed_rpo_seconds')->nullable();
            $table->unsignedInteger('observed_rto_seconds')->nullable();
            $table->json('checks');
            $table->string('signing_key_id', 32);
            $table->char('previous_hash', 64)->nullable();
            $table->char('record_hash', 64)->unique();
            $table->char('signature', 64);
            $table->dateTime('recorded_at');

            $table->unique(
                ['evidence_type', 'operation_id'],
                'recovery_evidence_operation_unique',
            );
            $table->index(
                ['evidence_type', 'completed_at'],
                'recovery_evidence_latest_idx',
            );
            $table->index(
                ['backup_id', 'evidence_type'],
                'recovery_evidence_backup_idx',
            );
        });
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('recovery_evidence')
            && DB::table('recovery_evidence')->exists()) {
            throw new RuntimeException(
                'Recovery evidence rollback refused: signed operational evidence exists.',
            );
        }

        Schema::dropIfExists('recovery_evidence');
        Schema::dropIfExists('recovery_evidence_chain_heads');
    }
};
