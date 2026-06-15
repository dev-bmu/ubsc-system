<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Polymorphic: links to Booking or Membership
            $table->morphs('transactionable');

            $table->unsignedBigInteger('amount');

            // Xendit-ready columns (uppercase matches Xendit API convention)
            $table->enum('payment_status', ['UNPAID', 'PAID', 'EXPIRED', 'FAILED'])->default('UNPAID');
            $table->string('xendit_invoice_id')->nullable()->unique();
            $table->string('checkout_url')->nullable();
            $table->timestamp('paid_at')->nullable();

            $table->timestamps();

            // Optimise auto-expire cron queries
            $table->index(['payment_status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
