<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const UPDATE_TRIGGER = 'database_replication_events_prevent_update';

    private const DELETE_TRIGGER = 'database_replication_events_prevent_delete';

    public function up(): void
    {
        if (! Schema::hasTable('database_replication_states')) {
            Schema::create('database_replication_states', function (Blueprint $table): void {
                $table->string('key', 32)->primary();
                $table->string('status', 16);
                $table->string('provider', 64);
                $table->string('cluster_id', 100);
                $table->string('dataset_id', 100);
                $table->string('environment', 32);
                $table->string('primary_region', 64);
                $table->string('writer_endpoint_id', 100);
                $table->string('reader_endpoint_id', 100);
                $table->string('writer_instance_id', 100);
                $table->string('conflicting_writer_instance_id', 100)->nullable();
                $table->string('control_failure_code', 64)->nullable();
                $table->unsignedBigInteger('topology_epoch');
                $table->unsignedSmallInteger('replica_count');
                $table->unsignedSmallInteger('healthy_replica_count');
                $table->unsignedSmallInteger('synchronous_replica_count');
                $table->unsignedInteger('maximum_replica_lag_ms');
                $table->unsignedBigInteger('data_loss_bytes');
                $table->json('checks');
                $table->string('last_operation_id', 100);
                $table->string('source_key_id', 32);
                $table->char('source_payload_hash', 64);
                $table->json('source_payload');
                $table->text('source_signature');
                $table->dateTime('observed_at');
                $table->dateTime('last_healthy_at')->nullable();
                $table->dateTime('last_failure_at')->nullable();
                $table->timestamps();

                $table->index(['status', 'observed_at'], 'db_replication_state_status_idx');
            });
        }

        if (! Schema::hasTable('database_replication_event_chain_heads')) {
            Schema::create('database_replication_event_chain_heads', function (Blueprint $table): void {
                $table->string('key', 32)->primary();
                $table->unsignedBigInteger('sequence')->default(0);
                $table->char('last_hash', 64)->nullable();
                $table->timestamps();
            });
        }

        DB::table('database_replication_event_chain_heads')->insertOrIgnore([
            'key' => 'primary',
            'sequence' => 0,
            'last_hash' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if (! Schema::hasTable('database_replication_events')) {
            Schema::create('database_replication_events', function (Blueprint $table): void {
                $table->id();
                $table->uuid('public_id')->unique();
                $table->unsignedBigInteger('sequence')->unique();
                $table->unsignedTinyInteger('schema_version')->default(1);
                $table->string('event_type', 40);
                $table->string('status', 16);
                $table->string('operation_id', 100)->unique(
                    'db_replication_event_operation_unique',
                );
                $table->string('provider', 64);
                $table->string('cluster_id', 100);
                $table->unsignedBigInteger('topology_epoch');
                $table->string('writer_instance_id', 100);
                $table->string('previous_writer_instance_id', 100)->nullable();
                $table->json('checks');
                $table->string('source_key_id', 32);
                $table->json('source_payload');
                $table->char('source_payload_hash', 64);
                $table->text('source_signature');
                $table->string('signing_key_id', 32);
                $table->char('previous_hash', 64)->nullable();
                $table->char('record_hash', 64)->unique();
                $table->char('signature', 64);
                $table->dateTime('observed_at');
                $table->dateTime('recorded_at');

                $table->index(
                    ['status', 'observed_at', 'sequence'],
                    'db_replication_event_status_idx',
                );
                $table->index(
                    ['topology_epoch', 'sequence'],
                    'db_replication_event_epoch_idx',
                );
            });
        }

        $this->dropImmutabilityGuards();
        $this->createImmutabilityGuards();
    }

    public function down(): void
    {
        if (Schema::hasTable('database_replication_events')
            && DB::table('database_replication_events')->exists()) {
            throw new RuntimeException(
                'Database replication rollback refused: append-only events exist.',
            );
        }

        $this->dropImmutabilityGuards();
        Schema::dropIfExists('database_replication_events');
        Schema::dropIfExists('database_replication_event_chain_heads');
        Schema::dropIfExists('database_replication_states');
    }

    private function createImmutabilityGuards(): void
    {
        match (DB::getDriverName()) {
            'mysql', 'mariadb' => $this->createMysqlGuards(),
            'sqlite' => $this->createSqliteGuards(),
            'pgsql' => $this->createPostgresGuards(),
            default => throw new RuntimeException(
                'Database replication event immutability is unsupported for this driver.',
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
            "CREATE TRIGGER `%s` BEFORE UPDATE ON `database_replication_events` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Database replication events are append-only'",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER `%s` BEFORE DELETE ON `database_replication_events` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Database replication events are append-only'",
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
            "CREATE TRIGGER %s BEFORE UPDATE ON database_replication_events BEGIN SELECT RAISE(ABORT, 'Database replication events are append-only'); END",
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            "CREATE TRIGGER %s BEFORE DELETE ON database_replication_events BEGIN SELECT RAISE(ABORT, 'Database replication events are append-only'); END",
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
            CREATE FUNCTION prevent_database_replication_event_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'Database replication events are append-only';
            END;
            $$ LANGUAGE plpgsql
        SQL);
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE UPDATE ON database_replication_events FOR EACH ROW EXECUTE FUNCTION prevent_database_replication_event_mutation()',
            self::UPDATE_TRIGGER,
        ));
        DB::unprepared(sprintf(
            'CREATE TRIGGER %s BEFORE DELETE ON database_replication_events FOR EACH ROW EXECUTE FUNCTION prevent_database_replication_event_mutation()',
            self::DELETE_TRIGGER,
        ));
    }

    private function dropPostgresGuards(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::UPDATE_TRIGGER.' ON database_replication_events');
        DB::unprepared('DROP TRIGGER IF EXISTS '.self::DELETE_TRIGGER.' ON database_replication_events');
        DB::unprepared('DROP FUNCTION IF EXISTS prevent_database_replication_event_mutation()');
    }
};
