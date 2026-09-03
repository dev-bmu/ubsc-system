<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_request_buckets', function (Blueprint $table): void {
            $table->id();
            $table->dateTime('bucket_started_at');
            $table->string('scope', 32);
            $table->unsignedInteger('latency_upper_bound_ms');
            $table->unsignedBigInteger('request_count')->default(0);
            $table->unsignedBigInteger('error_count')->default(0);
            $table->unsignedBigInteger('duration_sum_ms')->default(0);
            $table->timestamps();

            $table->unique(
                ['scope', 'bucket_started_at', 'latency_upper_bound_ms'],
                'performance_request_bucket_unique',
            );
            $table->index(
                ['bucket_started_at', 'id'],
                'performance_request_retention_idx',
            );
        });

        Schema::create('performance_queue_buckets', function (Blueprint $table): void {
            $table->id();
            $table->dateTime('bucket_started_at');
            $table->string('connection', 64);
            $table->string('queue', 64);
            $table->unsignedInteger('wait_upper_bound_ms');
            $table->unsignedInteger('runtime_upper_bound_ms');
            $table->unsignedBigInteger('processed_count')->default(0);
            $table->unsignedBigInteger('failed_count')->default(0);
            $table->unsignedBigInteger('wait_sum_ms')->default(0);
            $table->unsignedBigInteger('runtime_sum_ms')->default(0);
            $table->timestamps();

            $table->unique(
                [
                    'connection', 'queue', 'bucket_started_at',
                    'wait_upper_bound_ms', 'runtime_upper_bound_ms',
                ],
                'performance_queue_bucket_unique',
            );
            $table->index(
                ['bucket_started_at', 'id'],
                'performance_queue_retention_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_queue_buckets');
        Schema::dropIfExists('performance_request_buckets');
    }
};
