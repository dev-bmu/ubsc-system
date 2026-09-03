<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_heartbeats', function (Blueprint $table): void {
            $table->string('key', 100)->primary();
            $table->string('category', 32);
            $table->string('status', 16);
            $table->dateTime('observed_at');
            $table->dateTime('last_success_at')->nullable();
            $table->dateTime('last_failure_at')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->string('message', 255)->nullable();
            $table->json('context')->nullable();
            $table->timestamps();

            $table->index(['category', 'status', 'observed_at'], 'monitoring_heartbeats_status_idx');
        });

        Schema::create('monitoring_snapshots', function (Blueprint $table): void {
            // The foundation keeps one bounded current projection. Long-term
            // metrics and traces belong in an off-host observability backend.
            $table->string('key', 64)->primary();
            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->string('status', 16);
            $table->json('payload');
            $table->dateTime('collected_at');
            $table->unsignedInteger('collection_duration_ms')->default(0);
            $table->timestamps();
        });

        Schema::create('monitoring_incidents', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('deduplication_key', 120)->index();
            // A nullable unique key permits many resolved occurrences while
            // ensuring at most one active occurrence for a given condition.
            $table->string('active_key', 120)->nullable()->unique();
            $table->string('source', 64);
            $table->string('title', 160);
            $table->text('summary')->nullable();
            $table->string('severity', 16);
            $table->string('status', 16);
            $table->dateTime('started_at');
            $table->dateTime('last_observed_at');
            $table->dateTime('acknowledged_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution_note')->nullable();
            $table->json('context')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(
                ['status', 'severity', 'last_observed_at'],
                'monitoring_incidents_active_idx',
            );
        });
    }

    public function down(): void
    {
        $isPretending = DB::connection()->pretending();

        if (! $isPretending) {
            $containsOperationalHistory = collect([
                'monitoring_incidents',
                'monitoring_snapshots',
                'monitoring_heartbeats',
            ])->contains(static fn (string $table): bool => Schema::hasTable($table)
                && DB::table($table)->exists());

            if ($containsOperationalHistory) {
                throw new RuntimeException(
                    'Monitoring rollback refused: operational history exists. Export and explicitly clear it before dropping monitoring tables.',
                );
            }
        }

        Schema::dropIfExists('monitoring_incidents');
        Schema::dropIfExists('monitoring_snapshots');
        Schema::dropIfExists('monitoring_heartbeats');
    }
};
