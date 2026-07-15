<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gallery_sections', function (Blueprint $table) {
            $table->id();
            $table->string('key', 24)->unique();
            $table->string('slug', 64)->unique();
            $table->string('name');
            $table->unsignedSmallInteger('quota');
            $table->string('layout', 24);
            $table->boolean('is_active')->default(false)->index();
            $table->timestamp('activated_at')->nullable();
            $table->timestamps();
        });

        Schema::create('gallery_locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('gallery_upload_batches', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 24)->default('active')->index();
            $table->unsignedSmallInteger('file_count')->default(0);
            $table->unsignedSmallInteger('completed_count')->default(0);
            $table->unsignedSmallInteger('failed_count')->default(0);
            $table->json('common_metadata')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('gallery_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('upload_batch_id')->nullable()
                ->constrained('gallery_upload_batches')->nullOnDelete();
            $table->string('media_type', 16)->index();
            $table->string('status', 32)->default('draft')->index();
            $table->foreignId('location_id')->constrained('gallery_locations')->restrictOnDelete();
            $table->date('captured_at')->nullable()->index();
            $table->timestamp('publish_at')->nullable()->index();
            $table->timestamp('published_at')->nullable()->index();
            $table->string('credit')->default('UB Sport Center');
            $table->char('source_sha256', 64)->nullable()->index();
            $table->string('source_mime', 100)->nullable();
            $table->unsignedBigInteger('source_bytes')->default(0);
            $table->unsignedInteger('source_width')->nullable();
            $table->unsignedInteger('source_height')->nullable();
            $table->unsignedBigInteger('duration_ms')->nullable();
            $table->decimal('focal_x', 5, 4)->default(0.5);
            $table->decimal('focal_y', 5, 4)->default(0.5);
            $table->decimal('poster_second', 8, 3)->nullable();
            $table->json('derivatives')->nullable();
            $table->string('processing_error_code', 64)->nullable();
            $table->text('processing_error_detail')->nullable();
            $table->timestamp('rights_confirmed_at')->nullable();
            $table->foreignId('rights_confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestamps();

            $table->index(['status', 'publish_at']);
            $table->index(['location_id', 'status']);
        });

        Schema::create('gallery_item_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gallery_item_id')->constrained()->cascadeOnDelete();
            $table->string('locale', 10);
            $table->string('title');
            $table->string('arena_type', 160);
            $table->string('alt_text', 500);
            $table->text('caption')->nullable();
            $table->json('search_aliases')->nullable();
            $table->timestamps();

            $table->unique(['gallery_item_id', 'locale']);
            $table->index(['locale', 'title']);
        });

        Schema::create('gallery_item_section', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gallery_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('gallery_section_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('featured_position')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['gallery_item_id', 'gallery_section_id']);
            $table->unique(['gallery_section_id', 'featured_position']);
            $table->index(['gallery_section_id', 'sort_order']);
        });

        Schema::create('gallery_saved_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->json('filters');
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });

        Schema::create('gallery_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gallery_item_id')->nullable()
                ->constrained('gallery_items')->nullOnDelete();
            $table->uuid('item_uuid')->nullable()->index();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 64)->index();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->uuid('request_id')->index();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('gallery_analytics_events', function (Blueprint $table) {
            $table->id();
            $table->string('event_type', 64)->index();
            $table->uuid('item_uuid')->nullable()->index();
            $table->string('section_key', 24)->nullable()->index();
            $table->char('session_hash', 64)->nullable()->index();
            $table->char('query_hash', 64)->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('occurred_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gallery_analytics_events');
        Schema::dropIfExists('gallery_audit_logs');
        Schema::dropIfExists('gallery_saved_views');
        Schema::dropIfExists('gallery_item_section');
        Schema::dropIfExists('gallery_item_translations');
        Schema::dropIfExists('gallery_items');
        Schema::dropIfExists('gallery_upload_batches');
        Schema::dropIfExists('gallery_locations');
        Schema::dropIfExists('gallery_sections');
    }
};
