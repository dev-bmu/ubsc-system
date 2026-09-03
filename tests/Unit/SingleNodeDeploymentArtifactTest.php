<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

final class SingleNodeDeploymentArtifactTest extends TestCase
{
    public function test_dispatcher_selects_exactly_one_profile_and_rejects_unknown_topology(): void
    {
        $script = $this->artifact('deploy/scripts/activate-production-topology.sh');

        self::assertStringContainsString('artisan production:topology --no-interaction', $script);
        self::assertStringContainsString('single_node)', $script);
        self::assertStringContainsString('atomic-single-node-rollout.sh', $script);
        self::assertStringContainsString('multi_node)', $script);
        self::assertStringContainsString('atomic-node-rollout.sh', $script);
        self::assertStringContainsString('Unsupported production topology', $script);
        self::assertSame(1, substr_count($script, 'atomic-single-node-rollout.sh'));
        self::assertSame(1, substr_count($script, 'atomic-node-rollout.sh'));
    }

    public function test_single_node_candidate_is_fully_prepared_before_atomic_switch(): void
    {
        $rollout = $this->artifact('deploy/scripts/atomic-single-node-rollout.sh');
        $prepare = $this->position($rollout, 'prepare-single-node-release.sh');
        $switch = $this->position(
            $rollout,
            'atomic_link "${CANDIDATE_RELEASE}" "${CURRENT_LINK}"',
        );
        $reload = $this->position(
            $rollout,
            'run_bounded "${RUNTIME_RELOAD_HOOK}" "${CANDIDATE_RELEASE}"',
        );

        self::assertLessThan($switch, $prepare);
        self::assertLessThan($reload, $switch);
        self::assertStringContainsString('flock --exclusive --timeout', $rollout);
        self::assertStringContainsString('verify_local_release', $rollout);
        self::assertStringContainsString(
            'atomic_link "${OLD_RELEASE}" "${CURRENT_LINK}"',
            $rollout,
        );
        self::assertStringContainsString('without reversing database migrations', $rollout);
        self::assertStringNotContainsString('migrate:rollback', $rollout);
        self::assertStringNotContainsString('rm -rf', $rollout);
    }

    public function test_single_node_prepare_orders_contract_storage_migration_and_recovery_safely(): void
    {
        $script = $this->artifact('deploy/scripts/prepare-single-node-release.sh');
        $clear = $this->position($script, 'run_artisan config:clear');
        $contract = $this->position($script, 'run_artisan production:check --strict');
        $optimize = $this->position($script, 'run_artisan optimize');
        $storage = $this->position($script, 'run_artisan production:storage-sentinel');
        $migration = $this->position($script, 'run_artisan migrate --force --isolated');
        $recovery = $this->position($script, 'run_artisan production:single-recovery-check');

        self::assertLessThan($contract, $clear);
        self::assertLessThan($optimize, $contract);
        self::assertLessThan($storage, $optimize);
        self::assertLessThan($migration, $storage);
        self::assertLessThan($recovery, $migration);
        self::assertStringContainsString('--signal=TERM', $script);
        self::assertStringContainsString('--kill-after=10s', $script);
        self::assertStringNotContainsString('migrate:rollback', $script);
    }

    public function test_post_switch_activation_does_not_mutate_schema_or_rebuild_candidate(): void
    {
        $script = $this->artifact('deploy/scripts/activate-single-node-release.sh');

        self::assertStringContainsString('reload-process-supervision.sh', $script);
        self::assertStringContainsString('queue:restart', $script);
        self::assertStringContainsString('verify-process-supervision.sh', $script);
        self::assertStringContainsString('monitoring:collect --quiet', $script);
        self::assertStringNotContainsString('artisan migrate', $script);
        self::assertStringNotContainsString('config:clear', $script);
        self::assertStringNotContainsString('run_artisan optimize', $script);
    }

    public function test_single_node_overlay_is_explicit_and_keeps_multi_node_controls_installed(): void
    {
        $environment = $this->artifact('deploy/single-node.env.example');

        foreach ([
            'PRODUCTION_TOPOLOGY=single_node',
            'PRODUCTION_APP_INSTANCES=1',
            'SINGLE_NODE_CONTRACT_ENFORCE=true',
            'DEPLOYMENT_STRATEGY=atomic_single_node',
            'SINGLE_NODE_RELEASE_STORAGE_LINKED=true',
            'SINGLE_NODE_EXTERNAL_BACKUP_RUNNER=true',
            'SINGLE_NODE_BINLOG_ARCHIVING=true',
            'EXTERNAL_MONITORING_INGEST_ENABLED=true',
            'EXTERNAL_MONITORING_INGEST_KEYS={',
            'OBSERVABILITY_EXTERNAL_SLI_CONNECTED=true',
            'DB_HA_ENABLED=false',
            'DB_AUTOMATIC_FAILOVER=false',
            'LOAD_BALANCER_ENABLED=false',
            'LOAD_BALANCER_AUTOMATIC_FAILOVER=false',
            'PROCESS_SUPERVISION_ENFORCE=true',
            'CAPACITY_PLANNING_ENABLED=true',
            'RESILIENCE_DRILLS_ENABLED=true',
        ] as $declaration) {
            self::assertStringContainsString($declaration, $environment);
        }

        self::assertStringContainsString('remain present but config makes them dormant', $environment);
        self::assertStringNotContainsString('BEGIN PRIVATE KEY', $environment);
        self::assertStringContainsString('DB_PASSWORD=replace-', $environment);
        self::assertStringContainsString('REDIS_PASSWORD=replace-', $environment);
    }

    public function test_multi_node_capabilities_are_topology_gated_instead_of_deleted(): void
    {
        foreach ([
            'config/high_availability.php',
            'config/database_replication.php',
            'config/deployment.php',
            'config/ddos_protection.php',
            'config/disaster_recovery.php',
            'config/observability.php',
            'config/capacity_planning.php',
            'config/resilience_drills.php',
        ] as $path) {
            $configuration = $this->artifact($path);
            self::assertStringContainsString('$isMultiNode', $configuration, $path);
            self::assertStringContainsString('PRODUCTION_TOPOLOGY', $configuration, $path);
        }

        self::assertFileExists($this->path('deploy/scripts/atomic-node-rollout.sh'));
        self::assertFileExists($this->path('deploy/scripts/verify-production-readiness.sh'));
        self::assertFileExists($this->path('deploy/replication/README.md'));
    }

    public function test_single_node_readiness_requires_runtime_recovery_and_process_proofs(): void
    {
        $script = $this->artifact('deploy/scripts/verify-single-node-readiness.sh');

        foreach ([
            'production:check --strict --probe',
            'production:single-recovery-check',
            'background-jobs:doctor --probe-backends',
            'invoices:pdf:doctor --probe-storage',
            'verify-process-supervision.sh',
            'monitoring:collect --quiet',
            'monitoring:alerts:deliver --quiet',
            'production:storage-sentinel --check',
        ] as $proof) {
            self::assertStringContainsString($proof, $script);
        }

        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringNotContainsString('artisan migrate', $script);
    }

    private function artifact(string $relativePath): string
    {
        $contents = file_get_contents($this->path($relativePath));
        self::assertIsString($contents);

        return $contents;
    }

    private function path(string $relativePath): string
    {
        return dirname(__DIR__, 2).'/'.$relativePath;
    }

    private function position(string $contents, string $needle): int
    {
        $position = strpos($contents, $needle);
        self::assertIsInt($position, "Missing single-node deployment step: {$needle}");

        return $position;
    }
}
