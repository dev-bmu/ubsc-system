<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gallery_upload_sessions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('upload_batch_id')->nullable()
                ->constrained('gallery_upload_batches')->nullOnDelete();
            $table->foreignId('gallery_item_id')->nullable()
                ->constrained('gallery_items')->nullOnDelete();
            $table->char('client_fingerprint', 64)->index();
            $table->string('original_name');
            $table->string('source_mime', 100)->nullable();
            $table->unsignedBigInteger('total_bytes');
            $table->unsignedInteger('chunk_size');
            $table->unsignedSmallInteger('total_chunks');
            $table->json('received_chunks')->nullable();
            $table->json('metadata');
            $table->string('status', 24)->default('active')->index();
            $table->char('source_sha256', 64)->nullable();
            $table->string('staged_path')->nullable();
            $table->text('error_detail')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->index(['user_id', 'client_fingerprint', 'status'], 'gallery_upload_session_resume_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gallery_upload_sessions');
    }
};
