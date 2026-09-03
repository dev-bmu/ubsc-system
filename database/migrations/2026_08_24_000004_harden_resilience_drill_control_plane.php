<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const UPDATE_TRIGGER = 'resilience_drill_evidence_prevent_update';

    private const DELETE_TRIGGER = 'resilience_drill_evidence_prevent_delete';

    private const ACTIVE_TOPOLOGY_INDEX = 'resilience_drill_active_topology_idx';

    public function up(): void
    {
        if (! Schema::hasTable('resilience_drill_evidence')) {
            throw new RuntimeException(
                'Resilience hardening requires the evidence control-plane schema.',
            );
        }

        if (! Schema::hasIndex('resilience_drill_evidence', self::ACTIVE_TOPOLOGY_INDEX)) {
            Schema::table('resilience_drill_evidence', function (Blueprint $table): void {
                $table->index(
                    [
                        'environment',
                        'infrastructure_profile',
                        'provider',
                        'orchestrator',
                        'completed_at',
                        'id',
                    ],
                    self::ACTIVE_TOPOLOGY_INDEX,
                );
            });
        }
        // MySQL DDL is not transactional. Re-establishing named guards makes a
        // retry safe if a previous migration process stopped between steps.
        $this->dropImmutabilityGuards();
        $this->createImmutabilityGuards();
    }

    public function down(): void
    {
        if (Schema::hasTable('resilience_drill_evidence')
            && DB::table('resilience_drill_evidence')->exists()) {
            throw new RuntimeException(
                'Resilience hardening rollback refused: append-only evidence exists.',
            );
        }

        $this->dropImmutabilityGuards();
        if (Schema::hasTable('resilience_drill_evidence')
            && Schema::hasIndex('resilience_drill_evidence', self::ACTIVE_TOPOLOGY_INDEX)) {
            Schema::table('resilience_drill_evidence', function (Blueprint $table): void {
                $table->dropIndex(self::ACTIVE_TOPOLOGY_INDEX);
            });
        }
    }

    private function createImmutabilityGuards(): void
    {
        match (DB::getDriverName()) {
            'mysql', 'mariadb' => $this->createMysqlGuards(),
            'sqlite' => $this->createSqliteGuards(),
            'pgsql' => $this->createPostgresGuards(),
            default => throw new RuntimeException(
                'Resilience evidence immutability is not implemented for this database driver.',
            ),
        };
    }

    private function dropImmutabilityGuards(): void
    {
        match (DB::getDriverName()) {
            'mysql', 'mariadb' => $this->dropMysqlGuards(),
            'sqlite' => $this->dropSqliteGuards(),
            'pgsql' => $this->dropPostgresGuards(),
            default => null,
        };
    }

    private function createMysqlGuards(): void
    {
        DB::unprepared(sprintf(
            "CREATE TRIGGER `%s` BEFORE UPDATE ON `resilience_drill_evidence` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resilience drill evidence is append-only'",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER `%s` BEFORE DELETE ON `resilience_drill_evidence` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resilience drill evidence is append-only'",
            self::DELETE_TRIGGER,
        ));
    }

    private function dropMysqlGuards(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS `'.self::UPDATE_TRIGGER.'`');
        DB::unprepared('DROP TRIGGER IF EXISTS `'.self::DELETE_TRIGGER.'`');
    }

    private function createSqliteGuards(): void
    {
        DB::unprepared(sprintf(
            "CREATE TRIGGER %s BEFORE UPDATE ON resilience_drill_evidence BEGIN SELECT RAISE(ABORT, 'Resilience drill evidence is append-only'); END",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER %s BEFORE DELETE ON resilience_drill_evidence BEGIN SELECT RAISE(ABORT, 'Resilience drill evidence is append-only'); END",
            self::DELETE_TRIGGER,
        ));
    }

    private function dropSqliteGuards(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::UPDATE_TRIGGER);
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::DELETE_TRIGGER);
    }

    private function createPostgresGuards(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE FUNCTION prevent_resilience_drill_evidence_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'Resilience drill evidence is append-only';
            END;
            $$ LANGUAGE plpgsql
        SQL);
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE UPDATE ON resilience_drill_evidence FOR EACH ROW EXECUTE FUNCTION prevent_resilience_drill_evidence_mutation()',
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE DELETE ON resilience_drill_evidence FOR EACH ROW EXECUTE FUNCTION prevent_resilience_drill_evidence_mutation()',
            self::DELETE_TRIGGER,
        ));
    }

    private function dropPostgresGuards(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::UPDATE_TRIGGER.' ON resilience_drill_evidence');
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::DELETE_TRIGGER.' ON resilience_drill_evidence');
        DB::unprepared('DROP FUNCTION IF EXISTS prevent_resilience_drill_evidence_mutation()');
    }
};
