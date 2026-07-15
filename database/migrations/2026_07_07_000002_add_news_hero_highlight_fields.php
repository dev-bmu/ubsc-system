<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->boolean('is_hero_featured')->default(false)->after('status');
            $table->unsignedTinyInteger('hero_sort_order')->nullable()->after('is_hero_featured');

            $table->index(
                ['is_hero_featured', 'hero_sort_order', 'published_at'],
                'news_hero_featured_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->dropIndex('news_hero_featured_idx');
            $table->dropColumn(['is_hero_featured', 'hero_sort_order']);
        });
    }
};
