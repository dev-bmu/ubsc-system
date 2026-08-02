<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $duplicateSubject = DB::table('transactions')
            ->select(['transactionable_type', 'transactionable_id'])
            ->selectRaw('COUNT(*) as duplicate_count')
            ->groupBy(['transactionable_type', 'transactionable_id'])
            ->havingRaw('COUNT(*) > 1')
            ->first();

        if ($duplicateSubject !== null) {
            throw new \RuntimeException(sprintf(
                'Payment foundation migration stopped: transaction subject %s:%s has %s logical transactions. Resolve the duplicate before retrying.',
                $duplicateSubject->transactionable_type,
                $duplicateSubject->transactionable_id,
                $duplicateSubject->duplicate_count,
            ));
        }

        Schema::table('booking_orders', function (Blueprint $table): void {
            $table->uuid('idempotency_key')->nullable()->after('user_id');
            $table->char('request_fingerprint', 64)->nullable()->after('idempotency_key');
            $table->char('currency', 3)->default('IDR')->after('request_fingerprint');
            $table->string('terms_version', 64)->nullable()->after('currency');

            $table->unique('idempotency_key', 'booking_orders_idempotency_key_unique');
        });

        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropForeign(['user_id']);
        });

        Schema::table('transactions', function (Blueprint $table): void {
            $table->unsignedBigInteger('user_id')->nullable()->change();
        });

        Schema::table('transactions', function (Blueprint $table): void {
            $table->foreign('user_id', 'transactions_user_id_foreign')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
            $table->unique(
                ['transactionable_type', 'transactionable_id'],
                'transactions_subject_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table): void {
            $table->dropUnique('transactions_subject_unique');
            $table->dropForeign(['user_id']);
        });

        Schema::table('transactions', function (Blueprint $table): void {
            // This safety property is deliberately non-regressive on rollback:
            // historical financial rows must never return to cascade deletion.
            $table->foreign('user_id', 'transactions_user_id_foreign')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
        });

        Schema::table('booking_orders', function (Blueprint $table): void {
            $table->dropUnique('booking_orders_idempotency_key_unique');
            $table->dropColumn([
                'idempotency_key',
                'request_fingerprint',
                'currency',
                'terms_version',
            ]);
        });
    }
};
