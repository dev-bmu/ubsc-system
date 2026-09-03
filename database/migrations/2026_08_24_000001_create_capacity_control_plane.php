<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('capacity_load_evidence', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('test_id', 100)->unique();
            $table->string('scope', 32);
            $table->string('environment', 32);
            $table->string('release', 128);
            $table->string('infrastructure_profile', 128);
            $table->string('source_provider', 64);
            $table->char('base_origin_hash', 64);
            $table->unsignedSmallInteger('tested_instances');
            $table->decimal('tested_requests_per_second', 12, 3);
            $table->decimal('operational_requests_per_second', 12, 3);
            $table->decimal('operational_requests_per_second_per_instance', 12, 3);
            $table->unsignedInteger('p95_ms');
            $table->unsignedInteger('p99_ms');
            $table->decimal('error_rate_percent', 8, 4);
            $table->unsignedInteger('hold_seconds');
            $table->dateTime('generated_at');
            $table->dateTime('expires_at');
            $table->json('payload');
            $table->char('payload_hash', 64)->unique();
            $table->string('source_key_id', 32);
            $table->char('source_signature', 64);
            $table->dateTime('imported_at');

            $table->index(
                ['scope', 'environment', 'infrastructure_profile', 'release', 'generated_at', 'id'],
                'capacity_evidence_current_v2_idx',
            );
            $table->index(
                ['release', 'generated_at'],
                'capacity_evidence_release_idx',
            );
            $table->index(['imported_at', 'id'], 'capacity_evidence_prune_v2_idx');
        });

        Schema::create('capacity_platform_observations', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->uuid('observation_id')->unique();
            $table->string('provider', 64);
            $table->string('environment', 32);
            $table->string('release', 128);
            $table->string('infrastructure_profile', 128);
            $table->dateTime('observed_at');
            $table->dateTime('expires_at');
            $table->json('payload');
            $table->char('payload_hash', 64)->unique();
            $table->string('source_key_id', 32);
            $table->char('source_signature', 64);
            $table->dateTime('recorded_at');

            $table->index(
                ['provider', 'environment', 'infrastructure_profile', 'release', 'observed_at', 'id'],
                'capacity_observation_current_v2_idx',
            );
            $table->index('expires_at', 'capacity_observation_expiry_idx');
            $table->index(['recorded_at', 'id'], 'capacity_observation_prune_idx');
        });

        Schema::create('capacity_scaling_states', function (Blueprint $table): void {
            $table->string('target_key', 96)->primary();
            $table->unsignedInteger('observed_instances');
            $table->unsignedInteger('raw_recommendation');
            $table->unsignedInteger('desired_instances');
            $table->unsignedInteger('low_observation_count')->default(0);
            $table->dateTime('low_since')->nullable();
            $table->dateTime('last_scale_up_at')->nullable();
            $table->dateTime('last_scale_down_at')->nullable();
            $table->uuid('last_observation_id');
            $table->unsignedBigInteger('version')->default(1);
            $table->timestamps();

            $table->index(['updated_at', 'target_key'], 'capacity_state_prune_v2_idx');
        });

        Schema::create('capacity_scaling_plans', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->uuid('plan_id')->unique();
            $table->string('status', 24);
            $table->string('environment', 32);
            $table->string('release', 128);
            $table->string('infrastructure_profile', 128);
            $table->uuid('observation_id')->nullable();
            $table->uuid('evidence_id')->nullable();
            $table->char('decision_fingerprint', 64);
            $table->char('input_hash', 64)->unique();
            $table->json('payload');
            $table->char('payload_hash', 64)->unique();
            $table->string('signing_key_id', 32);
            $table->char('signature', 64);
            $table->dateTime('generated_at');
            $table->dateTime('expires_at');
            $table->dateTime('recorded_at');

            $table->index(
                ['environment', 'infrastructure_profile', 'release', 'generated_at', 'id'],
                'capacity_plan_current_v2_idx',
            );
            $table->index(
                ['decision_fingerprint', 'generated_at'],
                'capacity_plan_decision_idx',
            );
            $table->index('expires_at', 'capacity_plan_expiry_idx');
            $table->index(['recorded_at', 'id'], 'capacity_plan_prune_idx');
        });
    }

    public function down(): void
    {
        $tables = [
            'capacity_load_evidence',
            'capacity_platform_observations',
            'capacity_scaling_states',
            'capacity_scaling_plans',
        ];
        $hasOperationalHistory = collect($tables)->contains(
            static fn (string $table): bool => Schema::hasTable($table)
                && DB::table($table)->exists(),
        );
        if ($hasOperationalHistory) {
            throw new RuntimeException(
                'Capacity control rollback refused: signed evidence, observations, plans, or scaling state exists. Export and explicitly preserve the records first.',
            );
        }

        Schema::dropIfExists('capacity_scaling_plans');
        Schema::dropIfExists('capacity_scaling_states');
        Schema::dropIfExists('capacity_platform_observations');
        Schema::dropIfExists('capacity_load_evidence');
    }
};
