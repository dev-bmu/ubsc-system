<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->string('public_badge', 80)->nullable()->after('description');
            $table->string('savings_label', 80)->nullable()->after('public_badge');
            $table->string('cta_label', 80)->nullable()->after('savings_label');
            $table->string('card_image_url')->nullable()->after('cta_label');
        });
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropColumn([
                'public_badge',
                'savings_label',
                'cta_label',
                'card_image_url',
            ]);
        });
    }
};
