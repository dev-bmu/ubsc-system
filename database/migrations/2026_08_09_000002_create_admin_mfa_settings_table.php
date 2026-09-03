<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL DDL is not transactional. The existence guard makes a retry
        // safe if a deployment stops after CREATE TABLE but before Laravel
        // records the migration as completed.
        if (! Schema::hasTable('admin_mfa_settings')) {
            Schema::create('admin_mfa_settings', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->text('totp_secret')->nullable();
                $table->timestamp('totp_confirmed_at')->nullable();
                $table->unsignedBigInteger('totp_last_used_step')->nullable();
                $table->text('recovery_codes')->nullable();
                $table->timestamp('recovery_codes_generated_at')->nullable();
                $table->timestamp('recovery_codes_acknowledged_at')->nullable();
                $table->unsignedInteger('recovery_codes_version')->default(0);
                $table->timestamp('enabled_at')->nullable();
                $table->timestamp('last_verified_at')->nullable();
                $table->string('last_verified_method', 32)->nullable();
                $table->unsignedInteger('version')->default(1);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_mfa_settings');
    }
};
