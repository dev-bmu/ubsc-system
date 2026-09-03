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
            $table->dateTime('first_sampled_at')->nullable()->after('bucket_started_at');
        });

        // Existing history starts its coverage contract at the last known
        // sample. We never invent missed minutes from before this migration.
        DB::table('monitoring_rollups')
            ->whereNull('first_sampled_at')
            ->update(['first_sampled_at' => DB::raw('last_sampled_at')]);
    }

    public function down(): void
    {
        if (! DB::connection()->pretending()
            && Schema::hasTable('monitoring_rollups')
            && DB::table('monitoring_rollups')->exists()) {
            throw new RuntimeException(
                'Monitoring coverage rollback refused: operational history exists.',
            );
        }

        Schema::table('monitoring_rollups', function (Blueprint $table): void {
            $table->dropColumn('first_sampled_at');
        });
    }
};
