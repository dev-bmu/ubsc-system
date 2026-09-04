<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

final class PricingReferenceDataDeploymentArtifactTest extends TestCase
{
    public function test_local_setup_repairs_reference_data_after_migrations(): void
    {
        $composer = json_decode(
            $this->artifact('composer.json'),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        $commands = $composer['scripts']['setup'];

        $migration = array_search('@php artisan migrate --force', $commands, true);
        $synchronization = array_search(
            '@php artisan reference-data:sync --repair --no-interaction',
            $commands,
            true,
        );

        self::assertIsInt($migration);
        self::assertIsInt($synchronization);
        self::assertLessThan($synchronization, $migration);
        self::assertNotContains('@php artisan migrate:fresh', $commands, true);
        self::assertNotContains('@php artisan db:seed', $commands, true);
    }

    public function test_multi_node_release_repairs_reference_data_after_isolated_migrations(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        $synchronization = $this->position(
            $script,
            'run_artisan reference-data:sync --repair --no-interaction',
        );
        $replication = $this->position(
            $script,
            'run_artisan replication:attestation-import',
        );

        self::assertLessThan($synchronization, $migration);
        self::assertLessThan($replication, $synchronization);
        self::assertStringNotContainsString('migrate:fresh', $script);
        self::assertStringNotContainsString('db:seed', $script);
    }

    public function test_single_node_release_repairs_reference_data_before_post_migration_checks(): void
    {
        $script = $this->artifact('deploy/scripts/prepare-single-node-release.sh');
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated',
        );
        $synchronization = $this->position(
            $script,
            'run_artisan reference-data:sync --repair --no-interaction',
        );
        $postMigrationCheck = strpos(
            $script,
            'run_artisan production:check --strict --probe',
            $synchronization,
        );

        self::assertLessThan($synchronization, $migration);
        self::assertIsInt($postMigrationCheck);
        self::assertGreaterThan($synchronization, $postMigrationCheck);
        self::assertStringNotContainsString('migrate:fresh', $script);
        self::assertStringNotContainsString('db:seed', $script);
    }

    private function artifact(string $path): string
    {
        $contents = file_get_contents(dirname(__DIR__, 2).DIRECTORY_SEPARATOR.$path);

        self::assertIsString($contents);

        return $contents;
    }

    private function position(string $haystack, string $needle): int
    {
        $position = strpos($haystack, $needle);

        self::assertIsInt($position, "Missing deployment contract [{$needle}].");

        return $position;
    }
}
