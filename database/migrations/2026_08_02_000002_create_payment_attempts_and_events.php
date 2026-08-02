<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $isPretending = DB::connection()->pretending();

        if (! $isPretending
            && (! Schema::hasTable('users') || ! Schema::hasTable('transactions'))) {
            throw new \RuntimeException(
                'Payment attempt migration requires the users and transactions tables.',
            );
        }

        if (! $isPretending
            && (Schema::hasTable('payment_attempts') || Schema::hasTable('payment_events'))) {
            throw new \RuntimeException(
                'Payment attempt migration stopped because a target table already exists. Inspect the partial schema before retrying.',
            );
        }

        $statuses = [
            'draft',
            'creating',
            'pending',
            'paid',
            'failed',
            'expired',
            'cancelled',
            'reconciling',
        ];

        Schema::create('payment_attempts', function (Blueprint $table) use ($statuses): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('transaction_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('attempt_number');
            $table->uuid('idempotency_key')->unique();
            $table->char('request_fingerprint', 64);
            $table->unsignedBigInteger('amount');
            $table->char('currency', 3)->default('IDR');
            $table->enum('status', $statuses)->default('draft');
            $table->string('provider', 64)->nullable();
            $table->string('provider_reference', 191)->nullable();
            $table->string('provider_transaction_id', 191)->nullable();
            $table->string('failure_code', 64)->nullable();
            $table->string('failure_message', 255)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->unsignedInteger('lock_version')->default(0);
            $table->timestamps();

            $table->unique(
                ['transaction_id', 'attempt_number'],
                'payment_attempts_transaction_number_unique',
            );
            $table->unique(
                ['provider', 'provider_reference'],
                'payment_attempts_provider_reference_unique',
            );
            $table->unique(
                ['provider', 'provider_transaction_id'],
                'payment_attempts_provider_transaction_unique',
            );
            $table->index(['transaction_id', 'status'], 'payment_attempts_transaction_status_idx');
            $table->index(['user_id', 'status'], 'payment_attempts_user_status_idx');
            $table->index(['status', 'expires_at'], 'payment_attempts_status_expiry_idx');
        });

        Schema::create('payment_events', function (Blueprint $table) use ($statuses): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('payment_attempt_id')
                ->constrained()
                ->restrictOnDelete();
            $table->string('provider', 64);
            $table->string('provider_event_id', 191)->nullable();
            $table->string('event_type', 64);
            $table->enum('reported_status', $statuses)->nullable();
            $table->unsignedBigInteger('reported_amount');
            $table->char('reported_currency', 3);
            $table->char('payload_hash', 64);
            $table->json('metadata')->nullable();
            $table->enum('processing_result', ['received', 'processed', 'ignored', 'rejected'])
                ->default('received');
            $table->string('processing_message', 255)->nullable();
            // MariaDB 10.4 rejects a required TIMESTAMP without a default
            // after nullable timestamp columns under its current SQL mode.
            // DATETIME is explicit, timezone-neutral (values are written by
            // the application), and remains compatible with SQLite tests.
            $table->dateTime('occurred_at')->nullable();
            $table->dateTime('received_at');
            $table->dateTime('processed_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['provider', 'provider_event_id'],
                'payment_events_provider_event_unique',
            );
            $table->unique(
                ['payment_attempt_id', 'provider', 'event_type', 'payload_hash'],
                'payment_events_attempt_payload_unique',
            );
            $table->index(
                ['payment_attempt_id', 'received_at'],
                'payment_events_attempt_received_idx',
            );
            $table->index(
                ['processing_result', 'received_at'],
                'payment_events_result_received_idx',
            );
        });
    }

    public function down(): void
    {
        $isPretending = DB::connection()->pretending();

        if (! $isPretending) {
            $hasAttemptHistory = Schema::hasTable('payment_attempts')
                && DB::table('payment_attempts')->exists();
            $hasEventHistory = Schema::hasTable('payment_events')
                && DB::table('payment_events')->exists();

            if ($hasAttemptHistory || $hasEventHistory) {
                throw new \RuntimeException(
                    'Payment foundation rollback refused: payment audit history exists. Preserve or migrate the records before dropping these tables.',
                );
            }
        }

        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payment_attempts');
    }
};
