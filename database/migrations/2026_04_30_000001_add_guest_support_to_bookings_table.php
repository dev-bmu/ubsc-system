<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Drop existing FK so we can make user_id nullable
            $table->dropForeign(['user_id']);

            // Make user_id optional (walk-in guests have no account)
            $table->unsignedBigInteger('user_id')->nullable()->change();

            // Store the display name for both registered and walk-in bookings
            $table->string('customer_name')->nullable()->after('user_id');

            // Restore FK — nullOnDelete keeps the booking record when a user is deleted
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropColumn('customer_name');
            $table->unsignedBigInteger('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
