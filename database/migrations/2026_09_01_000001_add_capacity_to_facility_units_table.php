<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_units', function (Blueprint $table) {
            // Null deliberately means "inherit the facility booking capacity".
            // This keeps every existing unit backward-compatible while allowing
            // selected physical units to expose a different per-slot quota.
            $table->unsignedSmallInteger('capacity')
                ->nullable()
                ->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('facility_units', function (Blueprint $table) {
            $table->dropColumn('capacity');
        });
    }
};
