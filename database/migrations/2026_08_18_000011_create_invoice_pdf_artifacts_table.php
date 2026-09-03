<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_pdf_artifacts', function (Blueprint $table): void {
            $table->id();
            $table->char('cache_key', 64)->unique();
            $table->string('kind', 24);
            $table->unsignedBigInteger('subject_id');
            $table->string('template_version', 64);
            $table->string('storage_tier', 16)->default('hot');
            $table->string('disk', 64);
            $table->string('path', 512);
            $table->char('content_sha256', 64);
            $table->unsignedBigInteger('size_bytes');
            $table->unsignedInteger('render_duration_ms');
            $table->dateTimeTz('generated_at');
            $table->dateTimeTz('last_verified_at');
            $table->dateTimeTz('expires_at')->nullable();
            $table->timestamps();

            $table->index(
                ['kind', 'subject_id', 'id'],
                'invoice_pdf_subject_lookup_idx',
            );
            $table->index(
                ['storage_tier', 'expires_at', 'id'],
                'invoice_pdf_lifecycle_idx',
            );
            $table->index('generated_at', 'invoice_pdf_generated_idx');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('invoice_pdf_artifacts')
            && DB::table('invoice_pdf_artifacts')->exists()) {
            throw new RuntimeException(
                'Refusing to drop invoice PDF artifact metadata while records exist.',
            );
        }

        Schema::dropIfExists('invoice_pdf_artifacts');
    }
};
