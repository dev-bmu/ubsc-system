<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable()->change();
            $table->string('phone_number', 20)->nullable()->after('password');
            $table->enum('identity_category', ['umum', 'warga_kampus'])->nullable()->after('phone_number');
            $table->string('identity_number', 50)->nullable()->after('identity_category');
            $table->string('identity_file_path')->nullable()->after('identity_number');
            $table->enum('identity_status', ['unverified', 'pending', 'verified', 'rejected'])
                ->default('unverified')
                ->after('identity_file_path');
            $table->string('google_id')->nullable()->unique()->after('identity_status');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'phone_number',
                'identity_category',
                'identity_number',
                'identity_file_path',
                'identity_status',
                'google_id',
            ]);

            $table->string('password')->nullable(false)->change();
        });
    }
};
