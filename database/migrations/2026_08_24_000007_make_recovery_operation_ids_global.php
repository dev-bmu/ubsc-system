<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const LEGACY_INDEX = 'recovery_evidence_operation_unique';

    private const GLOBAL_INDEX = 'recovery_evidence_operation_global_unique';

    public function up(): void
    {
        if (! Schema::hasTable('recovery_evidence')
            || ! Schema::hasColumn('recovery_evidence', 'operation_id')) {
            throw new RuntimeException(
                'Global recovery operation identity requires the recovery evidence ledger.',
            );
        }

        $duplicate = DB::table('recovery_evidence')
            ->select('operation_id')
            ->groupBy('operation_id')
            ->havingRaw('COUNT(*) > 1')
            ->first();
        if ($duplicate !== null) {
            throw new RuntimeException(
                'Recovery operation IDs overlap across evidence types; resolve the immutable-ledger incident before migration.',
            );
        }

        // Add the stronger invariant first. If non-transactional MySQL DDL is
        // interrupted, rerunning converges without leaving a weaker window.
        if (! Schema::hasIndex('recovery_evidence', self::GLOBAL_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->unique('operation_id', self::GLOBAL_INDEX);
            });
        }
        if (Schema::hasIndex('recovery_evidence', self::LEGACY_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->dropUnique(self::LEGACY_INDEX);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('recovery_evidence')
            && DB::table('recovery_evidence')->exists()) {
            throw new RuntimeException(
                'Recovery operation-identity rollback refused: append-only evidence exists.',
            );
        }

        if (Schema::hasTable('recovery_evidence')
            && ! Schema::hasIndex('recovery_evidence', self::LEGACY_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->unique(
                    ['evidence_type', 'operation_id'],
                    self::LEGACY_INDEX,
                );
            });
        }
        if (Schema::hasTable('recovery_evidence')
            && Schema::hasIndex('recovery_evidence', self::GLOBAL_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->dropUnique(self::GLOBAL_INDEX);
            });
        }
    }
};
