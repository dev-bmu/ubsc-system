<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tests\Support\TestingDatabaseGuard;

final class TestingDatabaseGuardTest extends TestCase
{
    #[DataProvider('safeDatabases')]
    public function test_it_accepts_only_disposable_test_databases(
        string $environment,
        string $driver,
        string $database,
    ): void {
        TestingDatabaseGuard::assertSafe($environment, $driver, $database);

        $this->addToAssertionCount(1);
    }

    #[DataProvider('unsafeDatabases')]
    public function test_it_refuses_non_disposable_databases(
        string $environment,
        string $driver,
        string $database,
    ): void {
        $this->expectException(RuntimeException::class);

        TestingDatabaseGuard::assertSafe($environment, $driver, $database);
    }

    /** @return array<string, array{string, string, string}> */
    public static function safeDatabases(): array
    {
        return [
            'in-memory SQLite' => ['testing', 'sqlite', ':memory:'],
            'isolated MariaDB race schema' => ['testing', 'mysql', 'ubsc_race_ci_123'],
            'isolated database with normalized casing' => ['TESTING', 'MariaDB', 'UBSC_RACE_LOCAL'],
        ];
    }

    /** @return array<string, array{string, string, string}> */
    public static function unsafeDatabases(): array
    {
        return [
            'real local database' => ['local', 'mysql', 'ubsc'],
            'real database disguised as testing' => ['testing', 'mysql', 'ubsc'],
            'file-backed SQLite database' => ['testing', 'sqlite', 'database/database.sqlite'],
            'production environment with isolated-looking name' => ['production', 'mysql', 'ubsc_race_ci'],
            'empty database configuration' => ['testing', 'mysql', ''],
        ];
    }
}
