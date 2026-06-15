<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('testimonials', function (Blueprint $table) {
            $table->renameColumn('name', 'author_name');
            $table->renameColumn('instance', 'author_role');
            $table->renameColumn('message', 'quote');
            $table->dropColumn('rating');
        });
    }

    public function down(): void
    {
        Schema::table('testimonials', function (Blueprint $table) {
            $table->renameColumn('author_name', 'name');
            $table->renameColumn('author_role', 'instance');
            $table->renameColumn('quote', 'message');
            $table->tinyInteger('rating')->nullable()->after('quote');
        });
    }
};
