<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const UPDATE_TRIGGER = 'service_audit_events_prevent_update';

    private const DELETE_TRIGGER = 'service_audit_events_prevent_delete';

    public function up(): void
    {
        Schema::create('service_audit_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('subject_type', 32);
            $table->unsignedBigInteger('subject_id');
            $table->string('action', 64);
            $table->string('from_state', 32)->nullable();
            $table->string('to_state', 32)->nullable();
            $table->string('actor_type', 24);
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->string('source', 96);
            $table->string('reason_code', 64)->nullable();
            $table->char('correlation_id', 36)->nullable();
            $table->char('deduplication_key', 64)->nullable()->unique();
            $table->unsignedSmallInteger('integrity_key_version');
            $table->char('payload_hash', 64);
            $table->json('metadata')->nullable();
            // DATETIME avoids legacy MariaDB implicit-default behaviour on
            // tables containing more than one required TIMESTAMP column.
            $table->dateTime('occurred_at');
            $table->dateTime('created_at');

            $table->index(
                ['subject_type', 'subject_id', 'occurred_at'],
                'service_audit_subject_time_idx',
            );
            $table->index(['action', 'occurred_at'], 'service_audit_action_time_idx');
            $table->index(['actor_id', 'occurred_at'], 'service_audit_actor_time_idx');
            $table->index('occurred_at', 'service_audit_occurred_at_idx');
        });

        $this->createImmutabilityGuards();
    }

    public function down(): void
    {
        if (Schema::hasTable('service_audit_events')
            && DB::table('service_audit_events')->exists()) {
            throw new RuntimeException(
                'Service audit rollback refused: append-only operational history exists. Export and explicitly preserve it before removing this table.',
            );
        }

        $this->dropImmutabilityGuards();
        Schema::dropIfExists('service_audit_events');
    }

    private function createImmutabilityGuards(): void
    {
        match (DB::getDriverName()) {
            'mysql', 'mariadb' => $this->createMysqlGuards(),
            'sqlite' => $this->createSqliteGuards(),
            'pgsql' => $this->createPostgresGuards(),
            default => throw new RuntimeException(
                'Service audit immutability is not implemented for this database driver.',
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
            "CREATE TRIGGER `%s` BEFORE UPDATE ON `service_audit_events` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Service audit events are append-only'",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER `%s` BEFORE DELETE ON `service_audit_events` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Service audit events are append-only'",
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
            "CREATE TRIGGER %s BEFORE UPDATE ON service_audit_events BEGIN SELECT RAISE(ABORT, 'Service audit events are append-only'); END",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER %s BEFORE DELETE ON service_audit_events BEGIN SELECT RAISE(ABORT, 'Service audit events are append-only'); END",
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
            CREATE FUNCTION prevent_service_audit_event_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'Service audit events are append-only';
            END;
            $$ LANGUAGE plpgsql
        SQL);
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE UPDATE ON service_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_service_audit_event_mutation()',
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE DELETE ON service_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_service_audit_event_mutation()',
            self::DELETE_TRIGGER,
        ));
    }

    private function dropPostgresGuards(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::UPDATE_TRIGGER.' ON service_audit_events');
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::DELETE_TRIGGER.' ON service_audit_events');
        DB::unprepared('DROP FUNCTION IF EXISTS prevent_service_audit_event_mutation()');
    }
};
