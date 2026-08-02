<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->string('tier', 20)->default('hemat')->after('description')->index();
        });

        DB::table('membership_plans')
            ->select(['id', 'public_badge', 'is_primary'])
            ->orderBy('id')
            ->each(function (object $plan): void {
                $badge = strtolower(trim((string) ($plan->public_badge ?? '')));
                $tier = match ($badge) {
                    'hemat' => 'hemat',
                    'favorit' => 'favorit',
                    'performa' => 'performa',
                    'eksklusif' => 'eksklusif',
                    default => 'hemat',
                };

                if ((bool) $plan->is_primary) {
                    $tier = 'favorit';
                }

                DB::table('membership_plans')
                    ->where('id', $plan->id)
                    ->update(['tier' => $tier]);
            });
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropIndex(['tier']);
            $table->dropColumn('tier');
        });
    }
};
