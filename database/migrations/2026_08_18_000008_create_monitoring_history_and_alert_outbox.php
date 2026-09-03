<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_rollups', function (Blueprint $table): void {
            $table->id();
            $table->string('metric_key', 100);
            $table->dateTime('bucket_started_at');
            $table->dateTime('last_sampled_at');
            $table->unsignedInteger('sample_count')->default(0);
            $table->unsignedInteger('operational_count')->default(0);
            $table->unsignedInteger('degraded_count')->default(0);
            $table->unsignedInteger('outage_count')->default(0);
            $table->unsignedInteger('unknown_count')->default(0);
            $table->unsignedInteger('latency_sample_count')->default(0);
            $table->unsignedBigInteger('latency_sum_ms')->default(0);
            $table->unsignedInteger('latency_max_ms')->nullable();
            $table->unsignedInteger('value_sample_count')->default(0);
            $table->double('value_sum')->default(0);
            $table->double('value_max')->nullable();
            $table->double('value_last')->nullable();
            $table->timestamps();

            $table->unique(
                ['metric_key', 'bucket_started_at'],
                'monitoring_rollups_metric_bucket_unique',
            );
            $table->index('bucket_started_at', 'monitoring_rollups_retention_idx');
        });

        Schema::create('monitoring_alert_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('monitoring_incident_id')
                ->nullable()
                ->constrained('monitoring_incidents')
                ->nullOnDelete();
            $table->string('deduplication_key', 64)->unique();
            $table->string('event', 24);
            $table->string('channel', 24);
            $table->string('severity', 16);
            $table->string('status', 16)->default('pending');
            $table->json('payload');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->dateTime('available_at');
            $table->dateTime('claimed_at')->nullable();
            $table->dateTime('last_attempt_at')->nullable();
            $table->dateTime('delivered_at')->nullable();
            // Store only a bounded error class/fingerprint. Provider payloads,
            // URLs, credentials, and exception messages never belong here.
            $table->string('last_error_code', 160)->nullable();
            $table->timestamps();

            $table->index(
                ['status', 'available_at', 'id'],
                'monitoring_alert_delivery_queue_idx',
            );
            $table->index(
                ['monitoring_incident_id', 'event'],
                'monitoring_alert_incident_event_idx',
            );
            $table->index('delivered_at', 'monitoring_alert_retention_idx');
        });
    }

    public function down(): void
    {
        $isPretending = DB::connection()->pretending();

        if (! $isPretending) {
            $containsOperationalHistory = collect([
                'monitoring_alert_deliveries',
                'monitoring_rollups',
            ])->contains(static fn (string $table): bool => Schema::hasTable($table)
                && DB::table($table)->exists());

            if ($containsOperationalHistory) {
                throw new RuntimeException(
                    'Monitoring history rollback refused: export or explicitly clear operational records first.',
                );
            }
        }

        Schema::dropIfExists('monitoring_alert_deliveries');
        Schema::dropIfExists('monitoring_rollups');
    }
};
