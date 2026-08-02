<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('membership_plans', 'bootstrap_key')) {
            Schema::table('membership_plans', function (Blueprint $table): void {
                $table->string('bootstrap_key', 80)
                    ->nullable()
                    ->unique()
                    ->after('tier');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('membership_plans', 'bootstrap_key')) {
            return;
        }

        Schema::table('membership_plans', function (Blueprint $table): void {
            $table->dropUnique(['bootstrap_key']);
            $table->dropColumn('bootstrap_key');
        });
    }
};
