<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const UPDATE_TRIGGER = 'recovery_evidence_prevent_update';

    private const DELETE_TRIGGER = 'recovery_evidence_prevent_delete';

    private const LATEST_STATUS_INDEX = 'recovery_evidence_status_latest_idx';

    private const LATEST_ATTEMPT_INDEX = 'recovery_evidence_attempt_latest_idx';

    public function up(): void
    {
        if (! Schema::hasTable('recovery_evidence')) {
            throw new RuntimeException(
                'Recovery hardening requires the recovery evidence control-plane schema.',
            );
        }

        if (! Schema::hasColumn('recovery_evidence', 'schema_version')) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->unsignedTinyInteger('schema_version')->default(1)->after('sequence');
            });
        }
        if (! Schema::hasColumn('recovery_evidence', 'source_key_id')) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->string('source_key_id', 32)->nullable()->after('checks');
            });
        }
        if (! Schema::hasColumn('recovery_evidence', 'source_payload')) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->json('source_payload')->nullable()->after('source_key_id');
            });
        }
        if (! Schema::hasColumn('recovery_evidence', 'source_payload_hash')) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->char('source_payload_hash', 64)->nullable()->after('source_payload');
            });
        }
        if (! Schema::hasColumn('recovery_evidence', 'source_signature')) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->text('source_signature')->nullable()->after('source_payload_hash');
            });
        }

        if (! Schema::hasIndex('recovery_evidence', self::LATEST_STATUS_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->index(
                    ['evidence_type', 'status', 'completed_at', 'id'],
                    self::LATEST_STATUS_INDEX,
                );
            });
        }
        if (! Schema::hasIndex('recovery_evidence', self::LATEST_ATTEMPT_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->index(
                    ['evidence_type', 'completed_at', 'status', 'sequence'],
                    self::LATEST_ATTEMPT_INDEX,
                );
            });
        }

        // MySQL DDL is not transactional. Recreate named guards so retrying a
        // partially interrupted migration converges to one protected state.
        $this->dropImmutabilityGuards();
        $this->createImmutabilityGuards();
    }

    public function down(): void
    {
        if (Schema::hasTable('recovery_evidence')
            && DB::table('recovery_evidence')->exists()) {
            throw new RuntimeException(
                'Recovery hardening rollback refused: append-only evidence exists.',
            );
        }

        $this->dropImmutabilityGuards();
        if (Schema::hasTable('recovery_evidence')
            && Schema::hasIndex('recovery_evidence', self::LATEST_ATTEMPT_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->dropIndex(self::LATEST_ATTEMPT_INDEX);
            });
        }
        if (Schema::hasTable('recovery_evidence')
            && Schema::hasIndex('recovery_evidence', self::LATEST_STATUS_INDEX)) {
            Schema::table('recovery_evidence', function (Blueprint $table): void {
                $table->dropIndex(self::LATEST_STATUS_INDEX);
            });
        }
        foreach ([
            'source_signature',
            'source_payload_hash',
            'source_payload',
            'source_key_id',
            'schema_version',
        ] as $column) {
            if (Schema::hasTable('recovery_evidence')
                && Schema::hasColumn('recovery_evidence', $column)) {
                Schema::table('recovery_evidence', function (Blueprint $table) use ($column): void {
                    $table->dropColumn($column);
                });
            }
        }
    }

    private function createImmutabilityGuards(): void
    {
        match (DB::getDriverName()) {
            'mysql', 'mariadb' => $this->createMysqlGuards(),
            'sqlite' => $this->createSqliteGuards(),
            'pgsql' => $this->createPostgresGuards(),
            default => throw new RuntimeException(
                'Recovery evidence immutability is not implemented for this database driver.',
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
            "CREATE TRIGGER `%s` BEFORE UPDATE ON `recovery_evidence` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Recovery evidence is append-only'",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER `%s` BEFORE DELETE ON `recovery_evidence` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Recovery evidence is append-only'",
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
            "CREATE TRIGGER %s BEFORE UPDATE ON recovery_evidence BEGIN SELECT RAISE(ABORT, 'Recovery evidence is append-only'); END",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER %s BEFORE DELETE ON recovery_evidence BEGIN SELECT RAISE(ABORT, 'Recovery evidence is append-only'); END",
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
            CREATE FUNCTION prevent_recovery_evidence_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'Recovery evidence is append-only';
            END;
            $$ LANGUAGE plpgsql
        SQL);
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE UPDATE ON recovery_evidence FOR EACH ROW EXECUTE FUNCTION prevent_recovery_evidence_mutation()',
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE DELETE ON recovery_evidence FOR EACH ROW EXECUTE FUNCTION prevent_recovery_evidence_mutation()',
            self::DELETE_TRIGGER,
        ));
    }

    private function dropPostgresGuards(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::UPDATE_TRIGGER.' ON recovery_evidence');
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::DELETE_TRIGGER.' ON recovery_evidence');
        DB::unprepared('DROP FUNCTION IF EXISTS prevent_recovery_evidence_mutation()');
    }
};
