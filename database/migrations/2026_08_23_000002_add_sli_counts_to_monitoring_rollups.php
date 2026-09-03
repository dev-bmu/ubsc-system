<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_rollups', function (Blueprint $table): void {
            $table->unsignedBigInteger('sli_good_count')->default(0)->after('unknown_count');
            $table->unsignedBigInteger('sli_total_count')->default(0)->after('sli_good_count');
        });
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('monitoring_rollups')
            && DB::table('monitoring_rollups')
                ->where(fn ($query) => $query
                    ->where('sli_good_count', '>', 0)
                    ->orWhere('sli_total_count', '>', 0))
                ->exists()) {
            throw new RuntimeException(
                'SLI rollback refused: request-based objective history exists.',
            );
        }

        Schema::table('monitoring_rollups', function (Blueprint $table): void {
            $table->dropColumn(['sli_good_count', 'sli_total_count']);
        });
    }
};
