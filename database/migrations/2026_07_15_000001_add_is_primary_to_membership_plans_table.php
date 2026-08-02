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
            $table->boolean('is_primary')->default(false)->after('is_active')->index();
        });

        $primaryPlanId = DB::table('membership_plans')
            ->where('is_active', true)
            ->orderBy('price')
            ->orderBy('id')
            ->value('id');

        if ($primaryPlanId !== null) {
            DB::table('membership_plans')
                ->where('id', $primaryPlanId)
                ->update(['is_primary' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropIndex(['is_primary']);
            $table->dropColumn('is_primary');
        });
    }
};
