<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table): void {
            // Public registrations need a state before payment is confirmed.
            // A string keeps the lifecycle extensible across MySQL and SQLite.
            $table->string('status', 24)->default('active')->change();

            $table->uuid('registration_token')->nullable()->unique()->after('created_via');
            $table->string('registration_email')->nullable()->after('registration_token');
            $table->string('registration_phone', 30)->nullable()->after('registration_email');
            $table->string('registration_gender', 1)->nullable()->after('registration_phone');
            $table->string('registration_category', 20)->nullable()->after('registration_gender');
            $table->timestamp('registration_expires_at')->nullable()->after('registration_category');
            $table->index(
                ['status', 'registration_expires_at'],
                'memberships_registration_expiry_idx',
            );
        });
    }

    public function down(): void
    {
        DB::table('memberships')
            ->where('status', 'pending_payment')
            ->update(['status' => 'cancelled']);

        Schema::table('memberships', function (Blueprint $table): void {
            $table->dropIndex('memberships_registration_expiry_idx');
            $table->dropUnique(['registration_token']);
            $table->dropColumn([
                'registration_token',
                'registration_email',
                'registration_phone',
                'registration_gender',
                'registration_category',
                'registration_expires_at',
            ]);

            $table->enum('status', ['active', 'expired', 'cancelled'])
                ->default('active')
                ->change();
        });
    }
};
