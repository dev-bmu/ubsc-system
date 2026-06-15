<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facilities', function (Blueprint $table) {
            $table->string('location')->nullable()->after('description');
            $table->string('venue_type')->nullable()->after('location');
            $table->string('class_code')->nullable()->after('venue_type');
            $table->decimal('rating', 2, 1)->default(5.0)->after('class_code');
            $table->json('display_metadata')->nullable()->after('rating');
        });
    }

    public function down(): void
    {
        Schema::table('facilities', function (Blueprint $table) {
            $table->dropColumn(['location', 'venue_type', 'class_code', 'rating', 'display_metadata']);
        });
    }
};
