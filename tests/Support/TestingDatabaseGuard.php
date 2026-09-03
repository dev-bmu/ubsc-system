<?php

namespace Tests\Support;

use RuntimeException;

final class TestingDatabaseGuard
{
    /**
     * Refuse to boot Laravel tests unless the resolved database is disposable.
     *
     * This check intentionally evaluates Laravel's bootstrapped configuration,
     * not only environment variables. It therefore also catches stale or
     * concurrently-created configuration caches before RefreshDatabase runs.
     */
    public static function assertSafe(string $environment, string $driver, string $database): void
    {
        $environment = strtolower(trim($environment));
        $driver = strtolower(trim($driver));
        $database = trim($database);

        $isEphemeralSqlite = $driver === 'sqlite' && $database === ':memory:';
        $isIsolatedRaceDatabase = in_array($driver, ['mysql', 'mariadb'], true)
            && preg_match('/\Aubsc_race_[a-z0-9_]+\z/', strtolower($database)) === 1;

        if ($environment === 'testing' && ($isEphemeralSqlite || $isIsolatedRaceDatabase)) {
            return;
        }

        throw new RuntimeException(sprintf(
            'Test database safety guard refused environment [%s], driver [%s], database [%s]. '.
            'Only SQLite :memory: or an isolated ubsc_race_* database may be used by tests.',
            $environment !== '' ? $environment : '(empty)',
            $driver !== '' ? $driver : '(empty)',
            $database !== '' ? $database : '(empty)',
        ));
    }
}
