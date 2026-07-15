<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->index(
                ['status', 'news_category_id', 'published_at'],
                'news_public_feed_idx'
            );
        });

        Schema::table('news_categories', function (Blueprint $table) {
            $table->index('name', 'news_categories_name_idx');
        });
    }

    public function down(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->dropIndex('news_public_feed_idx');
        });

        Schema::table('news_categories', function (Blueprint $table) {
            $table->dropIndex('news_categories_name_idx');
        });
    }
};
