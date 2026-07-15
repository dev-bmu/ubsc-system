<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('news')
            ->where('is_hero_featured', false)
            ->update(['hero_sort_order' => null]);

        Schema::table('news', function (Blueprint $table) {
            $table->unique('hero_sort_order', 'news_hero_sort_order_unique');
        });
    }

    public function down(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->dropUnique('news_hero_sort_order_unique');
        });
    }
};
