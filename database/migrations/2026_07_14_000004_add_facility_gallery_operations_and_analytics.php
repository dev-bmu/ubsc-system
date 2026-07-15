<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gallery_analytics_events', function (Blueprint $table) {
            $table->string('query_term', 100)->nullable()->after('query_hash');
        });

        Schema::create('gallery_analytics_daily', function (Blueprint $table) {
            $table->id();
            $table->date('event_date')->index();
            $table->string('event_type', 64)->index();
            $table->string('section_key', 24)->default('')->index();
            $table->uuid('item_uuid')->nullable()->index();
            $table->char('dimension_hash', 64)->default('');
            $table->string('dimension_label', 100)->nullable();
            $table->unsignedBigInteger('event_count')->default(0);
            $table->unsignedBigInteger('unique_sessions')->default(0);
            $table->timestamps();

            $table->unique(
                ['event_date', 'event_type', 'section_key', 'item_uuid', 'dimension_hash'],
                'gallery_analytics_daily_dimension_unique',
            );
        });

        Schema::create('gallery_operation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('idempotency_key');
            $table->string('operation', 32);
            $table->char('request_hash', 64);
            $table->json('response')->nullable();
            $table->string('status', 16)->default('processing')->index();
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gallery_operation_requests');
        Schema::dropIfExists('gallery_analytics_daily');

        Schema::table('gallery_analytics_events', function (Blueprint $table) {
            $table->dropColumn('query_term');
        });
    }
};
