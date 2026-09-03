<?php

namespace App\Services\Production;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\DatabaseManager;
use RuntimeException;

class DatabaseWriterProbe
{
    public function __construct(private readonly DatabaseManager $database) {}

    public function assertWritable(?string $connectionName = null): void
    {
        $connection = $this->database->connection($connectionName);
        $driver = strtolower($connection->getDriverName());

        switch ($driver) {
            case 'mysql':
            case 'mariadb':
                $this->assertMySqlWriter($connection);
                break;
            case 'pgsql':
                $this->assertPostgresWriter($connection);
                break;
            case 'sqlsrv':
                $this->assertSqlServerWriter($connection);
                break;
            case 'sqlite':
                // SQLite remains available only for isolated local/testing probes.
                $this->assertConnectionResponds($connection);
                break;
            default:
                throw new RuntimeException('Unsupported database writer probe.');
        }
    }

    private function assertMySqlWriter(ConnectionInterface $connection): void
    {
        $row = $connection->selectOne('SELECT @@global.read_only AS read_only');

        if ($row === null || $this->truthyDatabaseValue($this->rowValue($row, 'read_only'))) {
            throw new RuntimeException('Database endpoint is not writable.');
        }
    }

    private function assertPostgresWriter(ConnectionInterface $connection): void
    {
        $row = $connection->selectOne('SELECT pg_is_in_recovery() AS in_recovery');

        if ($row === null || $this->truthyDatabaseValue($this->rowValue($row, 'in_recovery'))) {
            throw new RuntimeException('Database endpoint is not writable.');
        }
    }

    private function assertSqlServerWriter(ConnectionInterface $connection): void
    {
        $row = $connection->selectOne(
            "SELECT DATABASEPROPERTYEX(DB_NAME(), 'Updateability') AS updateability",
        );
        $updateability = strtoupper(trim((string) $this->rowValue($row, 'updateability')));

        if ($row === null || $updateability !== 'READ_WRITE') {
            throw new RuntimeException('Database endpoint is not writable.');
        }
    }

    private function assertConnectionResponds(ConnectionInterface $connection): void
    {
        if ($connection->selectOne('SELECT 1 AS healthy') === null) {
            throw new RuntimeException('Database endpoint is unavailable.');
        }
    }

    private function rowValue(mixed $row, string $key): mixed
    {
        if (is_array($row)) {
            return $row[$key] ?? null;
        }

        if (is_object($row)) {
            return $row->{$key} ?? null;
        }

        return null;
    }

    private function truthyDatabaseValue(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array(strtolower(trim((string) $value)), ['1', 'on', 'true', 't', 'yes'], true);
    }
}
