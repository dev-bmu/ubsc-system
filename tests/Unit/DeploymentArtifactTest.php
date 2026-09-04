<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

final class DeploymentArtifactTest extends TestCase
{
    public function test_release_activation_rebuilds_and_revalidates_config_before_migration(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $clear = $this->position($script, 'run_artisan config:clear --no-interaction');
        $optimize = $this->position($script, 'run_artisan optimize');
        $cachedCheck = $this->position(
            $script,
            'run_artisan production:check --strict --probe',
        );
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        self::assertLessThan($optimize, $clear);
        self::assertLessThan($cachedCheck, $optimize);
        self::assertLessThan($migration, $cachedCheck);
        self::assertStringNotContainsString('artisan about --only=environment', $script);
    }

    public function test_every_release_activation_command_is_os_bounded(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');

        self::assertStringContainsString(
            'ACTIVATE_RELEASE_COMMAND_TIMEOUT_SECONDS',
            $script,
        );
        self::assertStringContainsString('--signal=TERM', $script);
        self::assertStringContainsString('--kill-after=10s', $script);
        self::assertStringContainsString('run_bounded "${PHP_BINARY}" artisan', $script);
        self::assertStringContainsString(
            'run_bounded bash "${SCRIPT_DIRECTORY}/${script}"',
            $script,
        );
        self::assertStringNotContainsString("\nphp artisan ", $script);
        self::assertStringNotContainsString("\nbash \"\${SCRIPT_DIRECTORY}/", $script);
    }

    public function test_fallback_load_balancer_replaces_forwarded_ip_and_bounds_health_checks(): void
    {
        $configuration = $this->artifact(
            'deploy/load-balancer/haproxy.cfg.example',
        );

        self::assertStringContainsString(
            'http-request del-header X-Forwarded-For',
            $configuration,
        );
        self::assertStringContainsString(
            'http-request set-header X-Forwarded-For %[var(txn.ubsc_client_ip)]',
            $configuration,
        );
        self::assertStringContainsString(
            'acl ubsc_managed_edge src -f /etc/haproxy/ubsc-edge-cidrs.lst',
            $configuration,
        );
        self::assertStringContainsString(
            'acl ubsc_client_header_once req.hdr_cnt(X-Verified-Client-IP) eq 1',
            $configuration,
        );
        self::assertStringContainsString(
            'http-request del-header X-Verified-Client-IP',
            $configuration,
        );
        self::assertStringContainsString('timeout check 5s', $configuration);
        self::assertStringContainsString(
            'http-request deny deny_status 429 if ubsc_readiness',
            $configuration,
        );
        self::assertStringContainsString(
            'http-request deny deny_status 421 unless ubsc_canonical_host',
            $configuration,
        );
        self::assertStringContainsString('hdr Host PUBLIC_HOSTNAME', $configuration);
        self::assertStringContainsString('timeout queue 5s', $configuration);
        self::assertStringContainsString('10.0.1.11:8443 check ssl verify required', $configuration);
        self::assertStringContainsString('verifyhost ORIGIN_HOSTNAME', $configuration);
        self::assertStringContainsString('maxconn 256 maxqueue 512', $configuration);
        self::assertStringNotContainsString('10.0.1.11:8080', $configuration);
    }

    public function test_load_balancer_acceptance_requires_the_expected_release_across_distinct_nodes(): void
    {
        $script = $this->artifact('deploy/scripts/verify-load-balancer.sh');

        self::assertStringContainsString('x-ubsc-instance:', strtolower($script));
        self::assertStringContainsString('x-ubsc-release:', strtolower($script));
        self::assertStringContainsString('${#SEEN_RELEASES[@]} != 1', $script);
        self::assertStringContainsString('EXPECTED_RELEASE_DIGEST', $script);
        self::assertStringContainsString(
            'a healthy node is not serving the expected release',
            $script,
        );
        self::assertStringContainsString('sha256sum', $script);
        self::assertStringContainsString(
            '${#SEEN_INSTANCES[@]} < REQUIRED_DISTINCT',
            $script,
        );
        self::assertStringContainsString(
            '${#SEEN_INSTANCES[@]} > EXPECTED_NODES',
            $script,
        );
        self::assertStringContainsString('REQUIRED_DISTINCT * REQUIRED_DISTINCT', $script);
        self::assertStringContainsString('SAMPLES > 600', $script);
        self::assertStringContainsString(': > "${HEADER_FILE}"', $script);
    }

    public function test_post_rollout_readiness_gate_requires_all_five_production_proofs(): void
    {
        $script = $this->artifact(
            'deploy/scripts/verify-production-readiness.sh',
        );

        foreach ([
            'production:check --strict --probe',
            'production:deployment-check --strict',
            'production:ha-check',
            '--expected-nodes="${EXPECTED_NODES}"',
            '--public-origin="${PUBLIC_ORIGIN}"',
            '--expected-release="${EXPECTED_RELEASE}"',
            'verify-load-balancer.sh',
            'verify-edge-security.sh',
            'verify-database-replication.sh',
            'background-jobs:doctor --probe-backends',
            'invoices:pdf:doctor --probe-storage',
            'monitoring:alerts:canary',
            '--operation-id="${READINESS_OPERATION_ID}"',
            'monitoring:logs:await-receipt',
            'monitoring:collect --quiet',
            'monitoring:alerts:deliver --quiet',
            'verify-recovery-observability.sh',
            'verify-process-supervision.sh',
            'verify-capacity-control.sh',
            'verify-resilience-drills.sh',
        ] as $proof) {
            self::assertStringContainsString($proof, $script);
        }

        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString(
            'PRODUCTION_READINESS_OPERATION_ID must be a new UUIDv4',
            $script,
        );
        self::assertStringNotContainsString('readiness-${BASHPID}', $script);
        self::assertStringContainsString('[14/14]', $script);
        self::assertStringNotContainsString('/13]', $script);
        foreach (range(1, 14) as $step) {
            self::assertSame(
                1,
                substr_count($script, "[{$step}/14]"),
                "Production readiness step {$step} must exist exactly once.",
            );
        }
        self::assertStringNotContainsString('artisan migrate', $script);
        self::assertStringNotContainsString('storage:link', $script);
        self::assertStringNotContainsString('sleep ', $script);
        self::assertLessThan(
            $this->position($script, 'monitoring:logs:await-receipt'),
            $this->position($script, 'monitoring:alerts:canary'),
        );
        self::assertLessThan(
            $this->position($script, 'run_bounded bash "${SCRIPT_DIRECTORY}/verify-recovery-observability.sh"'),
            $this->position($script, 'monitoring:logs:await-receipt'),
        );
    }

    public function test_atomic_node_rollout_drains_switches_verifies_and_rolls_back_without_reversing_data(): void
    {
        $script = $this->artifact('deploy/scripts/atomic-node-rollout.sh');

        foreach ([
            'flock --exclusive --timeout',
            'verify-node-runtime.sh',
            'DEPLOYMENT_DRAIN_HOOK',
            'atomic_link "${CANDIDATE_RELEASE}" "${CURRENT_LINK}"',
            'activate-release.sh',
            'verify_local_release',
            'atomic_link "${OLD_RELEASE}" "${CURRENT_LINK}"',
            'DEPLOYMENT_UNDRAIN_HOOK',
        ] as $required) {
            self::assertStringContainsString($required, $script);
        }

        self::assertLessThan(
            $this->position($script, 'run_bounded "${UNDRAIN_HOOK}" "${INSTANCE_ID}" "${EXPECTED_RELEASE}"'),
            $this->position($script, 'verify_local_release'),
        );
        self::assertStringContainsString('without reversing database migrations', $script);
        self::assertStringNotContainsString('migrate:rollback', $script);
        self::assertStringNotContainsString('rm -rf', $script);
    }

    public function test_release_and_runtime_boot_both_enforce_the_deployment_contract(): void
    {
        $activation = $this->artifact('deploy/scripts/activate-release.sh');
        $provider = $this->artifact('app/Providers/ProductionContractServiceProvider.php');
        $migration = $this->position(
            $activation,
            'run_artisan migrate --force --isolated --no-interaction',
        );

        self::assertSame(2, substr_count(
            $activation,
            'run_artisan production:deployment-check --strict',
        ));
        self::assertLessThan(
            $migration,
            $this->position($activation, 'run_artisan production:deployment-check --strict'),
        );
        self::assertStringContainsString('DeploymentContract $deployment', $provider);
        self::assertStringContainsString('if (! $deployment->shouldEnforce())', $provider);
        self::assertStringContainsString('$deployment->assertSatisfied();', $provider);
        self::assertStringContainsString("'production:deployment-check'", $provider);
    }

    public function test_production_overlay_declares_zero_downtime_rollout_and_managed_edge_controls(): void
    {
        $environment = $this->artifact('deploy/production.env.example');

        foreach ([
            'DEPLOYMENT_CONTRACT_ENFORCE=true',
            'DEPLOYMENT_STRATEGY=rolling',
            'DEPLOYMENT_IMMUTABLE_RELEASES=true',
            'DEPLOYMENT_ATOMIC_TRAFFIC_SWITCH=true',
            'DEPLOYMENT_HEALTH_GATED=true',
            'DEPLOYMENT_CONNECTION_DRAINING=true',
            'DEPLOYMENT_AUTOMATIC_APP_ROLLBACK=true',
            'DEPLOYMENT_MAX_UNAVAILABLE=1',
            'DEPLOYMENT_EXPAND_CONTRACT_REQUIRED=true',
            'DEPLOYMENT_SCHEMA_BACKWARD_COMPATIBLE_RELEASES=2',
            'DEPLOYMENT_AUTOMATIC_DB_ROLLBACK=false',
            'EDGE_MANAGED_DNS=true',
            'EDGE_CDN_ENABLED=true',
            'EDGE_WAF_ENABLED=true',
            'EDGE_DDOS_PROTECTION=true',
            'EDGE_ORIGIN_TLS=true',
            'EDGE_ORIGIN_ACCESS_RESTRICTED=true',
            'EDGE_CERTIFICATE_AUTO_RENEWAL=true',
        ] as $declaration) {
            self::assertStringContainsString($declaration, $environment);
        }
    }

    public function test_edge_verifier_requires_https_certificate_readiness_and_security_headers(): void
    {
        $script = $this->artifact('deploy/scripts/verify-edge-security.sh');

        foreach ([
            "--proto '=https'",
            '--tlsv1.2',
            'strict-transport-security',
            'content-security-policy',
            'x-content-type-options',
            'personalized HTML or its CSP nonce',
            '/health/ready?edge-acceptance=1',
            'openssl x509',
            'CERTIFICATE_MIN_VALIDITY_SECONDS',
        ] as $required) {
            self::assertStringContainsString($required, $script);
        }
    }

    public function test_private_nginx_origin_uses_tls_restricted_ingress_and_loopback_health(): void
    {
        $configuration = $this->artifact('deploy/nginx/ubsc-origin.conf.example');

        foreach ([
            'ssl_protocols TLSv1.2 TLSv1.3',
            'if ($ubsc_load_balancer_allowed = 0) { return 403; }',
            'listen 127.0.0.1:8080',
            'location = /health/ready',
            'location = /index.php',
            'fastcgi_param SCRIPT_FILENAME $realpath_root/index.php',
            'fastcgi_param HTTPS on;',
            'fastcgi_param SERVER_PORT 443;',
            'server_name PUBLIC_HOSTNAME ORIGIN_HOSTNAME;',
            'server_tokens off',
        ] as $required) {
            self::assertStringContainsString($required, $configuration);
        }

        $zones = $this->artifact('deploy/nginx/00-ubsc-traffic-zones.conf.example');
        self::assertStringContainsString(
            'geo $realip_remote_addr $ubsc_load_balancer_allowed',
            $zones,
        );
        self::assertStringContainsString('LOAD_BALANCER_CIDR 1;', $zones);
        self::assertStringNotContainsString('allow LOAD_BALANCER_CIDR;', $configuration);
    }

    public function test_live_observability_gate_requires_current_external_availability(): void
    {
        $command = $this->artifact('app/Console/Commands/CheckObservability.php');

        self::assertStringContainsString(
            'ExternalAvailabilityConfiguration $externalAvailability',
            $command,
        );
        self::assertStringContainsString(
            "'external_availability_status' => \$external['status']",
            $command,
        );
        self::assertStringContainsString(
            "\$external['status'] !== 'operational'",
            $command,
        );
        self::assertStringContainsString(
            "\$logReceipt['status'] !== 'operational'",
            $command,
        );
        self::assertStringContainsString("option('require-log-receipt')", $command);
    }

    public function test_external_availability_workflow_pins_every_third_party_action(): void
    {
        $workflow = $this->artifact('.github/workflows/external-availability.yml');

        self::assertStringNotContainsString('actions/checkout@v', $workflow);
        self::assertStringNotContainsString('actions/setup-node@v', $workflow);
        self::assertStringNotContainsString('actions/upload-artifact@v', $workflow);
        self::assertStringContainsString('persist-credentials: false', $workflow);
        self::assertStringContainsString(
            "vars.UBSC_EXTERNAL_MONITORING_ENABLED == 'true'",
            $workflow,
        );
        self::assertStringContainsString('verify-edge-security.sh "$UBSC_BASE_URL"', $workflow);
        self::assertStringContainsString('EDGE_OUTCOME: ${{ steps.edge.outcome }}', $workflow);
        self::assertMatchesRegularExpression(
            '/actions\/checkout@[0-9a-f]{40}/',
            $workflow,
        );
        self::assertMatchesRegularExpression(
            '/actions\/setup-node@[0-9a-f]{40}/',
            $workflow,
        );
        self::assertMatchesRegularExpression(
            '/actions\/upload-artifact@[0-9a-f]{40}/',
            $workflow,
        );
    }

    public function test_required_application_quality_gate_is_complete_and_supply_chain_bounded(): void
    {
        $workflow = $this->artifact('.github/workflows/application-quality.yml');

        foreach ([
            'pull_request:',
            'push:',
            'merge_group:',
            'permissions:',
            'contents: read',
            'persist-credentials: false',
            'APP_ENV: testing',
            'DB_CONNECTION: sqlite',
            'DB_DATABASE: ":memory:"',
            'composer validate --no-check-publish --strict',
            'composer audit --locked',
            "git ls-files -z '*.php' | xargs -0 -n1 php -l",
            'php artisan test',
            'npm ci --ignore-scripts',
            'npm audit --audit-level=high',
            'for script in scripts/*.mjs; do node --check "$script"; done',
            'bash -n deploy/scripts/*.sh',
            'npm run build',
            'name: Required application quality',
        ] as $proof) {
            self::assertStringContainsString($proof, $workflow);
        }

        self::assertStringNotContainsString('pull_request_target:', $workflow);
        self::assertStringNotContainsString('actions/checkout@v', $workflow);
        self::assertStringNotContainsString('actions/setup-node@v', $workflow);
        self::assertMatchesRegularExpression(
            '/actions\/checkout@[0-9a-f]{40}/',
            $workflow,
        );
        self::assertMatchesRegularExpression(
            '/actions\/setup-node@[0-9a-f]{40}/',
            $workflow,
        );
    }

    public function test_local_setup_provisions_environment_before_composer_package_discovery(): void
    {
        $composer = json_decode(
            $this->artifact('composer.json'),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        $setup = $composer['scripts']['setup'] ?? [];

        self::assertSame(
            '@php -r "file_exists(\'.env\') || copy(\'.env.example\', \'.env\');"',
            $setup[0] ?? null,
        );
        self::assertSame('composer install', $setup[1] ?? null);
    }

    public function test_production_overlay_declares_dedicated_coordination_redis(): void
    {
        $environment = $this->artifact('deploy/production.env.example');

        self::assertStringContainsString(
            'REDIS_CACHE_LOCK_CONNECTION=coordination',
            $environment,
        );
        self::assertStringContainsString('REDIS_COORDINATION_URL=rediss://', $environment);
        self::assertStringContainsString(
            'REDIS_COORDINATION_MAXMEMORY_POLICY=noeviction',
            $environment,
        );
        self::assertStringContainsString(
            'APP_MAINTENANCE_STORE=coordination',
            $environment,
        );
    }

    public function test_production_overlay_requires_a_highly_available_managed_edge(): void
    {
        $environment = $this->artifact('deploy/production.env.example');

        foreach ([
            'LOAD_BALANCER_ENABLED=true',
            'LOAD_BALANCER_MANAGED_SERVICE=true',
            'LOAD_BALANCER_HA_ENABLED=true',
            'LOAD_BALANCER_AUTOMATIC_FAILOVER=true',
            'LOAD_BALANCER_MIN_FAILURE_DOMAINS=2',
            'LOAD_BALANCER_FAILOVER_RTO_SECONDS=60',
        ] as $declaration) {
            self::assertStringContainsString($declaration, $environment);
        }
    }

    public function test_production_overlay_declares_recovery_and_off_host_observability_without_secrets(): void
    {
        $environment = $this->artifact('deploy/production.env.example');

        self::assertStringContainsString(
            'DISASTER_RECOVERY_CONTRACT_ENFORCE=true',
            $environment,
        );
        self::assertStringContainsString('DB_PITR_CONTINUOUS=true', $environment);
        self::assertStringContainsString(
            'DB_BACKUP_OBJECT_LOCK_MODE=compliance',
            $environment,
        );
        self::assertStringContainsString('RESTORE_DRILL_ENABLED=true', $environment);
        self::assertStringContainsString(
            'OBSERVABILITY_CONTRACT_ENFORCE=true',
            $environment,
        );
        self::assertStringContainsString('LOG_STACK=daily,json_stderr', $environment);
        self::assertStringContainsString(
            'RECOVERY_EVIDENCE_SIGNING_KEYS={}',
            $environment,
        );
        self::assertStringContainsString('RECOVERY_ATTESTATION_REQUIRED=true', $environment);
        self::assertStringContainsString(
            'RECOVERY_ATTESTATION_VERIFYING_KEYS={}',
            $environment,
        );
        self::assertStringContainsString(
            'OBSERVABILITY_LOG_RECEIPTS_ENABLED=true',
            $environment,
        );
        self::assertStringContainsString(
            'OBSERVABILITY_LOG_RECEIPT_ACTIVE_KEY_IDS=log-sink-v1',
            $environment,
        );
        self::assertStringContainsString(
            'OBSERVABILITY_LOG_RECEIPT_VERIFYING_KEYS={}',
            $environment,
        );
        self::assertStringNotContainsString('PRIVATE KEY', $environment);
        self::assertStringContainsString(
            'RECOVERY_ATTESTATION_ACTIVE_KEY_IDS=verifier-v1',
            $environment,
        );
        self::assertStringContainsString(
            'RECOVERY_EVIDENCE_WARNING_SECONDS=7200',
            $environment,
        );
        self::assertStringContainsString(
            'RECOVERY_EVIDENCE_OUTAGE_SECONDS=14400',
            $environment,
        );
        self::assertStringContainsString('RECOVERY_PRIMARY_REGION=', $environment);
        self::assertStringContainsString('RECOVERY_SECONDARY_REGION=', $environment);
        self::assertStringContainsString(
            'EXTERNAL_MONITORING_INGEST_KEYS={}',
            $environment,
        );
        self::assertStringContainsString('MONITORING_ALERT_WEBHOOK_SECRET=', $environment);
        self::assertStringNotContainsString('base64:replace-', $environment);
    }

    public function test_release_blocks_on_process_contract_and_finishes_with_live_verification(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $processContract = $this->position(
            $script,
            'run_artisan production:process-check --strict',
        );
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        $reload = $this->position(
            $script,
            'reload-process-supervision.sh',
        );
        $restart = $this->position($script, 'run_artisan queue:restart');
        $liveVerification = $this->position(
            $script,
            'verify-process-supervision.sh',
        );

        self::assertLessThan($migration, $processContract);
        self::assertLessThan($reload, $migration);
        self::assertLessThan($restart, $reload);
        self::assertLessThan($liveVerification, $restart);
    }

    public function test_release_fails_closed_on_recovery_and_observability_before_migration(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $recovery = $this->position(
            $script,
            'run_artisan production:recovery-check --strict',
        );
        $observability = $this->position(
            $script,
            'run_artisan production:observability-check --strict',
        );
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        $preMigrationLive = $this->position(
            $script,
            'verify-database-recovery.sh',
        );
        $live = $this->position($script, 'verify-recovery-observability.sh');
        $canary = $this->position(
            $script,
            'run_artisan monitoring:alerts:canary --quiet',
        );

        self::assertLessThan($migration, $recovery);
        self::assertLessThan($migration, $observability);
        self::assertLessThan($migration, $preMigrationLive);
        self::assertLessThan($canary, $migration);
        self::assertLessThan($live, $canary);
        self::assertLessThan($live, $migration);
    }

    public function test_live_recovery_observability_verifier_is_bounded_and_checks_evidence(): void
    {
        $script = $this->artifact(
            'deploy/scripts/verify-recovery-observability.sh',
        );

        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString(
            'recovery:evidence-verify --record-heartbeat --quiet',
            $script,
        );
        self::assertStringContainsString(
            'production:recovery-check --strict --live',
            $script,
        );
        self::assertStringContainsString(
            'production:observability-check',
            $script,
        );
        self::assertStringContainsString('--require-log-receipt', $script);
    }

    public function test_pre_migration_database_recovery_gate_is_bounded_and_live(): void
    {
        $script = $this->artifact('deploy/scripts/verify-database-recovery.sh');

        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString('RECOVERY_COMMAND_TIMEOUT_SECONDS', $script);
        self::assertStringContainsString(
            'recovery:evidence-verify --record-heartbeat --quiet',
            $script,
        );
        self::assertStringContainsString(
            'production:recovery-check --strict --live',
            $script,
        );
        self::assertStringNotContainsString('sleep ', $script);
    }

    public function test_release_requires_replication_contract_and_fresh_signed_topology_before_schema_mutation(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $staticContract = $this->position(
            $script,
            'run_artisan production:replication-check --strict',
        );
        $preMigrationLive = $this->position(
            $script,
            'verify-database-replication.sh',
        );
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        $bootstrap = $this->position(
            $script,
            'run_artisan replication:attestation-import --bootstrap-if-empty --fail-on-unhealthy --quiet',
        );
        $ledger = $this->position(
            $script,
            'run_artisan replication:ledger-verify --record-heartbeat --quiet',
        );
        $postActivationLive = $this->lastPosition(
            $script,
            'verify-database-replication.sh',
        );

        self::assertLessThan($migration, $staticContract);
        self::assertLessThan($migration, $preMigrationLive);
        self::assertLessThan($bootstrap, $migration);
        self::assertLessThan($ledger, $bootstrap);
        self::assertGreaterThan($migration, $postActivationLive);
        self::assertSame(2, substr_count($script, 'verify-database-replication.sh'));
    }

    public function test_live_replication_gate_is_bounded_and_verifies_existing_ledger_or_first_run_attestation(): void
    {
        $script = $this->artifact('deploy/scripts/verify-database-replication.sh');
        $command = $this->artifact(
            'app/Console/Commands/CheckDatabaseReplication.php',
        );

        self::assertStringContainsString(
            'production:replication-check --strict --live',
            $script,
        );
        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString('REPLICATION_COMMAND_TIMEOUT_SECONDS', $script);
        self::assertStringNotContainsString('sleep ', $script);
        self::assertStringContainsString('verifyAndRecordHeartbeat', $command);
        self::assertStringContainsString('bootstrap.attestation_file', $command);
        self::assertStringContainsString('$tableCount === 0', $command);
        self::assertStringContainsString('$tableCount !== count($tables)', $command);
    }

    public function test_production_overlay_declares_fail_closed_replication_without_private_credentials(): void
    {
        $environment = $this->artifact('deploy/production.env.example');

        foreach ([
            'DATABASE_REPLICATION_CONTRACT_ENFORCE=true',
            'DB_REPLICATION_ENABLED=true',
            'DB_REPLICATION_MANAGED_SERVICE=true',
            'DB_REPLICATION_SINGLE_WRITER=true',
            'DB_REPLICATION_AUTOMATIC_FAILOVER=true',
            'DB_REPLICATION_AUTOMATIC_FAILBACK=false',
            'DB_REPLICATION_QUORUM_REQUIRED=true',
            'DB_REPLICATION_FENCING_REQUIRED=true',
            'DB_REPLICATION_PROMOTION_CATCHUP_REQUIRED=true',
            'DB_REPLICATION_MAX_DATA_LOSS_BYTES=0',
            'DB_REPLICATION_REPLICA_READ_ONLY_REQUIRED=true',
            'DB_REPLICATION_ATTESTATION_REQUIRED=true',
            'DB_REPLICA_READS_ENABLED=false',
        ] as $declaration) {
            self::assertStringContainsString($declaration, $environment);
        }
        self::assertStringContainsString(
            'DB_REPLICATION_ATTESTATION_VERIFYING_KEYS={}',
            $environment,
        );
        self::assertStringContainsString(
            'DB_REPLICATION_LEDGER_SIGNING_KEYS={}',
            $environment,
        );
        self::assertStringContainsString(
            'REPLICATION_IMPORT_TIMEOUT_SECONDS=30',
            $environment,
        );
        self::assertStringNotContainsString('BEGIN PRIVATE KEY', $environment);
        self::assertStringNotContainsString('DB_REPLICATION_PRIVATE_KEY', $environment);
    }

    public function test_production_process_boot_enforces_replication_even_if_release_script_is_bypassed(): void
    {
        $provider = $this->artifact(
            'app/Providers/ProductionContractServiceProvider.php',
        );

        self::assertStringContainsString(
            'DatabaseReplicationContract $databaseReplication',
            $provider,
        );
        self::assertStringContainsString(
            'if (! $databaseReplication->shouldEnforce())',
            $provider,
        );
        self::assertStringContainsString(
            '$databaseReplication->assertSatisfied();',
            $provider,
        );
        self::assertStringContainsString(
            "'production:replication-check'",
            $provider,
        );
    }

    public function test_release_fails_closed_on_capacity_contract_and_finishes_with_live_capacity_verification(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $capacityContract = $this->position(
            $script,
            'run_artisan production:capacity-check --strict',
        );
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        $processVerification = $this->position(
            $script,
            'verify-process-supervision.sh',
        );
        $liveCapacity = $this->position(
            $script,
            'verify-capacity-control.sh',
        );

        self::assertLessThan($migration, $capacityContract);
        self::assertLessThan($liveCapacity, $processVerification);
    }

    public function test_live_capacity_verifier_is_bounded_and_requires_a_non_blocked_signed_plan(): void
    {
        $script = $this->artifact('deploy/scripts/verify-capacity-control.sh');

        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString('CAPACITY_VERIFY_WAIT_SECONDS', $script);
        self::assertStringContainsString('umask 077', $script);
        self::assertStringContainsString(
            'capacity:plan --json --fail-on-blocked',
            $script,
        );
        self::assertStringContainsString(
            'production:capacity-check --strict --live',
            $script,
        );
    }

    public function test_production_overlay_declares_fail_closed_capacity_control_without_embedding_keys(): void
    {
        $environment = $this->artifact('deploy/production.env.example');

        self::assertStringContainsString('CAPACITY_PLANNING_ENFORCE=true', $environment);
        self::assertStringContainsString('CAPACITY_AUTOSCALING_MODE=signed_plan', $environment);
        self::assertStringContainsString('CAPACITY_REQUIRE_DATABASE_TELEMETRY=true', $environment);
        self::assertStringContainsString('CAPACITY_DECISION_RETENTION_DAYS=30', $environment);
        self::assertStringContainsString('CAPACITY_EVIDENCE_EXPECTED_INSTANCES=2', $environment);
        self::assertStringContainsString('CAPACITY_MANAGED_TARGETS=web,queue:', $environment);
        self::assertStringContainsString('CAPACITY_MINIMUM_OBSERVATION_SPACING_SECONDS=15', $environment);
        self::assertStringContainsString('CAPACITY_MAXIMUM_OBSERVATION_SPACING_SECONDS=75', $environment);
        self::assertStringContainsString('CAPACITY_CONVERGENCE_TIMEOUT_SECONDS=300', $environment);
        self::assertStringContainsString('CAPACITY_OBSERVATION_SIGNING_KEYS={}', $environment);
        self::assertStringContainsString('CAPACITY_EVIDENCE_SIGNING_KEYS={}', $environment);
        self::assertStringContainsString('CAPACITY_PLAN_SIGNING_KEYS={}', $environment);
        self::assertStringNotContainsString('base64:replace-capacity', $environment);
    }

    public function test_capacity_workflow_uses_protected_topology_values_and_pinned_actions(): void
    {
        $workflow = $this->artifact('.github/workflows/capacity-test.yml');

        self::assertStringContainsString('vars.CAPACITY_TARGET_ENVIRONMENT', $workflow);
        self::assertStringContainsString('vars.CAPACITY_INFRASTRUCTURE_PROFILE', $workflow);
        self::assertStringContainsString('vars.CAPACITY_EVIDENCE_EXPECTED_INSTANCES', $workflow);
        self::assertStringNotContainsString('inputs.application_instances', $workflow);
        self::assertStringNotContainsString('actions/checkout@v', $workflow);
        self::assertStringNotContainsString('actions/setup-node@v', $workflow);
        self::assertStringNotContainsString('grafana/setup-k6-action@v', $workflow);
        self::assertStringNotContainsString('actions/upload-artifact@v', $workflow);
    }

    public function test_provider_adapter_template_carries_an_independent_complete_safety_contract_without_secrets(): void
    {
        $environment = $this->artifact('deploy/capacity/adapter.env.example');
        $applicationEnvironment = $this->artifact('deploy/production.env.example');
        $targets = explode(',', $this->environmentValue($environment, 'CAPACITY_MANAGED_TARGETS'));
        $bounds = json_decode(
            $this->environmentValue($environment, 'CAPACITY_TARGET_BOUNDS'),
            true,
            16,
            JSON_THROW_ON_ERROR,
        );

        foreach ([
            'APP_RELEASE',
            'CAPACITY_TARGET_ENVIRONMENT',
            'CAPACITY_INFRASTRUCTURE_PROFILE',
            'CAPACITY_PLATFORM_PROVIDER',
            'CAPACITY_MANAGED_TARGETS',
            'CAPACITY_REQUIRED_EVIDENCE_SCOPES',
            'CAPACITY_SCALE_DOWN_THRESHOLD_PERCENT',
            'CAPACITY_MAX_SCALE_UP_STEP',
            'CAPACITY_MAX_SCALE_UP_PERCENT',
            'CAPACITY_MAX_SCALE_DOWN_STEP',
        ] as $name) {
            self::assertSame(
                $this->environmentValue($applicationEnvironment, $name),
                $this->environmentValue($environment, $name),
                "Provider adapter contract drifted from application setting [{$name}].",
            );
        }

        self::assertStringContainsString('CAPACITY_MANAGED_TARGETS=web,queue:critical', $environment);
        self::assertStringContainsString('CAPACITY_REQUIRED_EVIDENCE_SCOPES=public_read,booking_checkout,admin,authentication,write', $environment);
        self::assertStringContainsString('CAPACITY_MAX_SCALE_UP_STEP=4', $environment);
        self::assertStringContainsString('CAPACITY_MAX_SCALE_UP_PERCENT=50', $environment);
        self::assertStringContainsString('CAPACITY_MAX_SCALE_DOWN_STEP=1', $environment);
        self::assertStringContainsString('"web":{"minimum_instances":2,"maximum_instances":20}', $environment);
        self::assertStringContainsString('"queue:critical":{"minimum_instances":2,"maximum_instances":12}', $environment);
        self::assertStringContainsString('"queue:default":{"minimum_instances":1,"maximum_instances":8}', $environment);
        self::assertSame(9, substr_count($environment, '"minimum_instances"'));
        self::assertSame(9, substr_count($environment, '"maximum_instances"'));
        self::assertSame($targets, array_values(array_unique($targets)));
        $boundedTargets = array_keys($bounds);
        sort($targets, SORT_STRING);
        sort($boundedTargets, SORT_STRING);
        self::assertSame($targets, $boundedTargets);
        self::assertSame([
            'web' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'CAPACITY_WEB_MIN_INSTANCES'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'CAPACITY_WEB_MAX_INSTANCES'),
            ],
            'queue:critical' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_CRITICAL'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_CRITICAL'),
            ],
            'queue:documents' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_DOCUMENTS'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_DOCUMENTS'),
            ],
            'queue:notifications' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_NOTIFICATIONS'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_NOTIFICATIONS'),
            ],
            'queue:media_image' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_MEDIA_IMAGE'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_MEDIA_IMAGE'),
            ],
            'queue:media_video' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_MEDIA_VIDEO'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_MEDIA_VIDEO'),
            ],
            'queue:media_maintenance' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_MEDIA_MAINTENANCE'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_MEDIA_MAINTENANCE'),
            ],
            'queue:maintenance' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_MAINTENANCE'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_MAINTENANCE'),
            ],
            'queue:default' => [
                'minimum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MIN_DEFAULT'),
                'maximum_instances' => (int) $this->environmentValue($applicationEnvironment, 'BACKGROUND_WORKERS_MAX_DEFAULT'),
            ],
        ], $bounds);
        self::assertStringContainsString("CAPACITY_PLAN_VERIFYING_KEYS='{}'", $environment);
        self::assertStringNotContainsString('base64:', $environment);
        self::assertStringNotContainsString('hex:', $environment);
    }

    public function test_release_fails_closed_on_resilience_contract_and_finishes_with_live_evidence_verification(): void
    {
        $script = $this->artifact('deploy/scripts/activate-release.sh');
        $static = $this->position(
            $script,
            'run_artisan production:resilience-check --strict',
        );
        $migration = $this->position(
            $script,
            'run_artisan migrate --force --isolated --no-interaction',
        );
        $capacity = $this->position($script, 'verify-capacity-control.sh');
        $firstLive = $this->position($script, 'verify-resilience-drills.sh');
        $lastLive = $this->lastPosition($script, 'verify-resilience-drills.sh');

        self::assertLessThan($migration, $static);
        self::assertLessThan($migration, $firstLive);
        self::assertLessThan($lastLive, $capacity);
        self::assertSame(2, substr_count($script, 'verify-resilience-drills.sh'));
        self::assertStringContainsString('[39/39]', $script);
    }

    public function test_live_resilience_verifier_is_bounded_and_requires_fresh_successful_evidence(): void
    {
        $script = $this->artifact('deploy/scripts/verify-resilience-drills.sh');

        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString(
            'resilience:evidence:verify --record-heartbeat --quiet',
            $script,
        );
        self::assertStringContainsString(
            'production:resilience-check --strict --live',
            $script,
        );
        self::assertStringNotContainsString('sleep ', $script);
    }

    public function test_production_overlay_declares_safe_resilience_game_days_without_private_keys(): void
    {
        $environment = $this->artifact('deploy/production.env.example');
        $adapter = $this->artifact('deploy/resilience/orchestrator.env.example');

        foreach ([
            'APP_RELEASE',
            'RESILIENCE_TARGET_ENVIRONMENT',
            'RESILIENCE_TARGET_INFRASTRUCTURE_PROFILE',
            'RESILIENCE_PROVIDER',
            'RESILIENCE_ORCHESTRATOR',
            'RESILIENCE_REQUIRED_SCENARIOS',
            'RESILIENCE_MAX_CAMPAIGN_SECONDS',
            'RESILIENCE_PRODUCTION_INJECTION_FORBIDDEN',
            'RESILIENCE_EXTERNAL_ORCHESTRATOR_REQUIRED',
            'RESILIENCE_MANUAL_APPROVAL_REQUIRED',
            'RESILIENCE_CHANGE_REFERENCE_REQUIRED',
            'RESILIENCE_SYNTHETIC_TRAFFIC_ONLY',
            'RESILIENCE_KILL_SWITCH_REQUIRED',
            'RESILIENCE_ONE_FAULT_AT_A_TIME',
            'RESILIENCE_MAX_BLAST_RADIUS_PERCENT',
            'RESILIENCE_MINIMUM_HEALTHY_INSTANCES',
            'RESILIENCE_MAX_SCENARIO_SECONDS',
            'RESILIENCE_ABORT_ERROR_RATE_PERCENT',
            'RESILIENCE_ABORT_P95_MS',
        ] as $name) {
            self::assertSame(
                $this->environmentValue($environment, $name),
                $this->environmentValue($adapter, $name),
                "Resilience orchestrator contract drifted from application setting [{$name}].",
            );
        }

        self::assertSame([
            'application_node_loss' => 180,
            'load_balancer_failover' => (int) $this->environmentValue(
                $environment,
                'LOAD_BALANCER_FAILOVER_RTO_SECONDS',
            ),
            'queue_worker_restart' => 180,
            'cache_primary_failover' => 300,
            'database_writer_failover' => (int) $this->environmentValue(
                $environment,
                'DB_FAILOVER_RTO_SECONDS',
            ),
        ], json_decode(
            $this->environmentValue($adapter, 'RESILIENCE_SCENARIO_RECOVERY_OBJECTIVES'),
            true,
            8,
            JSON_THROW_ON_ERROR,
        ));

        self::assertStringContainsString('RESILIENCE_DRILLS_ENABLED=true', $environment);
        self::assertStringContainsString('RESILIENCE_DRILLS_ENFORCE=true', $environment);
        self::assertStringContainsString(
            'RESILIENCE_TARGET_ENVIRONMENT=staging',
            $environment,
        );
        self::assertStringContainsString(
            'RESILIENCE_PRODUCTION_INJECTION_FORBIDDEN=true',
            $environment,
        );
        self::assertStringContainsString(
            'RESILIENCE_SYNTHETIC_TRAFFIC_ONLY=true',
            $environment,
        );
        self::assertStringContainsString(
            'RESILIENCE_ONE_FAULT_AT_A_TIME=true',
            $environment,
        );
        self::assertStringContainsString(
            'application_node_loss,load_balancer_failover,queue_worker_restart,cache_primary_failover,database_writer_failover',
            $environment,
        );
        self::assertStringContainsString('RESILIENCE_EVIDENCE_VERIFYING_KEYS={}', $environment);
        self::assertStringContainsString(
            'RESILIENCE_EVIDENCE_ACTIVE_KEY_IDS=orchestrator-v1',
            $environment,
        );
        self::assertStringContainsString('RESILIENCE_LEDGER_SIGNING_KEYS={}', $environment);
        self::assertStringNotContainsString('PRIVATE KEY', $environment);
        self::assertStringNotContainsString('PRIVATE KEY', $adapter);
        self::assertStringNotContainsString('APP_KEY=', $adapter);
        self::assertStringNotContainsString('RESILIENCE_LEDGER_SIGNING_KEYS', $adapter);
    }

    public function test_resilience_evidence_example_matches_the_strict_runner_contract(): void
    {
        $document = $this->artifact('deploy/resilience/evidence.example.json');
        $envelope = json_decode($document, true, 32, JSON_THROW_ON_ERROR);
        $adapter = $this->artifact('deploy/resilience/orchestrator.env.example');
        $objectives = json_decode(
            $this->environmentValue($adapter, 'RESILIENCE_SCENARIO_RECOVERY_OBJECTIVES'),
            true,
            8,
            JSON_THROW_ON_ERROR,
        );

        self::assertIsArray($envelope);
        self::assertEqualsCanonicalizing(
            ['schema_version', 'key_id', 'payload', 'signature'],
            array_keys($envelope),
        );
        self::assertSame(1, $envelope['schema_version']);
        self::assertSame(
            $this->environmentValue($adapter, 'RESILIENCE_EVIDENCE_KEY_ID'),
            $envelope['key_id'],
        );
        self::assertIsArray($envelope['payload']);
        self::assertEqualsCanonicalizing([
            'approval_reference',
            'approval_verified',
            'campaign_id',
            'change_reference_verified',
            'completed_at',
            'environment',
            'infrastructure_profile',
            'orchestrator',
            'orchestrator_identity_verified',
            'production_access_denied',
            'provider',
            'release',
            'scenarios',
            'schema_version',
            'started_at',
            'traffic_mode',
        ], array_keys($envelope['payload']));

        $scenarioKeys = [];
        foreach ($envelope['payload']['scenarios'] as $scenario) {
            self::assertIsArray($scenario);
            self::assertEqualsCanonicalizing([
                'abort_triggered',
                'blast_radius_percent',
                'checks',
                'completed_at',
                'detection_seconds',
                'expected_recovery_seconds',
                'fault_domain',
                'healthy_instances_remaining',
                'key',
                'outcome',
                'peak_error_rate_basis_points',
                'peak_p95_ms',
                'recovery_seconds',
                'started_at',
            ], array_keys($scenario));
            self::assertArrayHasKey($scenario['key'], $objectives);
            self::assertSame(
                $objectives[$scenario['key']],
                $scenario['expected_recovery_seconds'],
            );
            foreach ([
                'blast_radius_percent',
                'detection_seconds',
                'expected_recovery_seconds',
                'healthy_instances_remaining',
                'peak_error_rate_basis_points',
                'peak_p95_ms',
                'recovery_seconds',
            ] as $measurement) {
                self::assertIsInt($scenario[$measurement]);
            }
            self::assertEqualsCanonicalizing([
                'abort_guard_active',
                'alert_delivered',
                'booking_integrity',
                'kill_switch_armed',
                'membership_integrity',
                'monitoring_active',
                'no_data_loss',
                'no_duplicate_reservations',
                'payment_integrity',
                'preflight_healthy',
                'readiness_recovered',
                'steady_state_recovered',
            ], array_keys($scenario['checks']));
            $scenarioKeys[] = $scenario['key'];
        }

        self::assertEqualsCanonicalizing(array_keys($objectives), $scenarioKeys);
        self::assertLessThanOrEqual(
            (int) $this->environmentValue(
                $this->artifact('deploy/production.env.example'),
                'RESILIENCE_EVIDENCE_MAX_ENVELOPE_BYTES',
            ),
            strlen($document),
        );
        self::assertStringNotContainsString('PRIVATE KEY', $document);
    }

    public function test_required_mariadb_gate_races_the_resilience_ledger_across_processes(): void
    {
        $workflow = $this->artifact('.github/workflows/mariadb-concurrency.yml');
        $runner = $this->artifact('tests/Support/run-resilience-ledger-race.php');

        self::assertStringContainsString(
            'tests/Integration/MariaDbResilienceLedgerConcurrencyTest.php',
            $workflow,
        );
        self::assertStringContainsString('--stop-on-failure', $workflow);
        self::assertStringNotContainsString('actions/checkout@v', $workflow);
        self::assertStringNotContainsString('shivammathur/setup-php@v', $workflow);
        self::assertMatchesRegularExpression(
            '/actions\/checkout@[0-9a-f]{40}/',
            $workflow,
        );
        self::assertMatchesRegularExpression(
            '/shivammathur\/setup-php@[0-9a-f]{40}/',
            $workflow,
        );
        self::assertStringContainsString('TestingDatabaseGuard::assertSafe', $runner);
        self::assertStringContainsString("str_starts_with(\$key, 'resilience_drills.')", $runner);
    }

    public function test_required_mariadb_gate_races_the_database_recovery_ledger(): void
    {
        $workflow = $this->artifact('.github/workflows/mariadb-concurrency.yml');
        $runner = $this->artifact('tests/Support/run-recovery-ledger-race.php');

        self::assertStringContainsString(
            'tests/Integration/MariaDbRecoveryLedgerConcurrencyTest.php',
            $workflow,
        );
        self::assertStringContainsString(
            'tests/Feature/RecoveryEvidenceTest.php',
            $workflow,
        );
        self::assertLessThan(
            $this->position(
                $workflow,
                'tests/Integration/MariaDbRecoveryLedgerConcurrencyTest.php',
            ),
            $this->position($workflow, 'tests/Feature/RecoveryEvidenceTest.php'),
        );
        self::assertStringContainsString('TestingDatabaseGuard::assertSafe', $runner);
        self::assertStringContainsString(
            "str_starts_with(\$key, 'disaster_recovery.')",
            $runner,
        );
        self::assertStringContainsString(
            "str_starts_with(\$key, 'monitoring.backup.')",
            $runner,
        );
    }

    public function test_required_mariadb_gate_pins_its_database_image_by_digest(): void
    {
        $workflow = $this->artifact('.github/workflows/mariadb-concurrency.yml');

        self::assertMatchesRegularExpression(
            '/image: mariadb:10\.11\.[0-9]+@sha256:[0-9a-f]{64}/',
            $workflow,
        );
        self::assertStringNotContainsString('image: mariadb:10.11\n', $workflow);
    }

    public function test_required_mariadb_gate_races_replication_writer_election_and_fencing(): void
    {
        $workflow = $this->artifact('.github/workflows/mariadb-concurrency.yml');
        $runner = $this->artifact(
            'tests/Support/run-replication-control-plane-race.php',
        );

        self::assertStringContainsString(
            'tests/Feature/DatabaseReplicationControlPlaneTest.php',
            $workflow,
        );
        self::assertStringContainsString(
            'tests/Integration/MariaDbReplicationControlPlaneConcurrencyTest.php',
            $workflow,
        );
        self::assertLessThan(
            $this->position(
                $workflow,
                'tests/Integration/MariaDbReplicationControlPlaneConcurrencyTest.php',
            ),
            $this->position(
                $workflow,
                'tests/Feature/DatabaseReplicationControlPlaneTest.php',
            ),
        );
        self::assertStringContainsString('TestingDatabaseGuard::assertSafe', $runner);
        self::assertStringContainsString(
            "str_starts_with(\$key, 'database_replication.')",
            $runner,
        );
    }

    public function test_github_concurrency_governance_verifier_is_read_only_and_fail_closed(): void
    {
        $script = $this->artifact(
            'scripts/verify-github-concurrency-gate.mjs',
        );
        $runbook = $this->artifact('.github/CONCURRENCY_CI.md');
        $workflow = $this->artifact('.github/workflows/repository-governance.yml');

        self::assertStringContainsString(
            'const REQUIRED_CHECKS = [',
            $script,
        );
        self::assertStringContainsString(
            "'Required multi-process concurrency (MariaDB/InnoDB)'",
            $script,
        );
        self::assertStringContainsString(
            "const API_ORIGIN = 'https://api.github.com'",
            $script,
        );
        self::assertStringContainsString(
            'strict_required_status_checks_policy === true',
            $script,
        );
        self::assertStringContainsString('dismiss_stale_reviews_on_push === true', $script);
        self::assertStringContainsString('require_code_owner_review === true', $script);
        self::assertStringContainsString('require_last_push_approval === true', $script);
        self::assertStringContainsString('required_review_thread_resolution === true', $script);
        self::assertStringContainsString("['deletion', 'non_fast_forward']", $script);
        self::assertStringContainsString('required.integration_id > 0', $script);
        self::assertStringContainsString('REQUIRED_CHECKS.every', $script);
        self::assertStringContainsString(
            'check?.app?.id === requiredCheck.integration_id',
            $script,
        );
        self::assertStringContainsString('Required application quality', $script);
        self::assertStringContainsString('/rules/branches/', $script);
        self::assertStringContainsString('/check-runs?filter=latest', $script);
        self::assertStringContainsString("check?.app?.slug === 'github-actions'", $script);
        self::assertStringContainsString("method: 'GET'", $script);
        self::assertStringNotContainsString("method: 'POST'", $script);
        self::assertStringNotContainsString("method: 'PATCH'", $script);
        self::assertStringNotContainsString("method: 'PUT'", $script);
        self::assertStringNotContainsString(
            'Critical multi-process concurrency / Required multi-process concurrency',
            $runbook,
        );
        self::assertStringContainsString(
            'node scripts/verify-github-concurrency-gate.mjs --rules-only',
            $workflow,
        );
        self::assertStringContainsString('persist-credentials: false', $workflow);
        self::assertStringContainsString('checks: read', $workflow);
        self::assertStringContainsString('statuses: read', $workflow);
        self::assertStringContainsString('governance audit', $runbook);
        self::assertStringContainsString('Block branch deletion', $runbook);
    }

    public function test_off_host_log_receipt_adapter_is_durable_replay_safe_and_public_key_only(): void
    {
        $signer = $this->artifact('scripts/publish-log-ingestion-receipt.mjs');
        $poster = $this->artifact('scripts/post-log-ingestion-receipt.mjs');
        $routes = $this->artifact('routes/monitoring.php');
        $provider = $this->artifact('app/Providers/MonitoringServiceProvider.php');
        $runbook = $this->artifact('deploy/observability/README.md');
        $environment = $this->artifact('deploy/production.env.example');

        self::assertStringContainsString("open(outputPath, 'wx', 0o600)", $signer);
        self::assertStringContainsString('await handle.sync()', $signer);
        self::assertStringContainsString('const body = await readFile', $poster);
        self::assertStringContainsString('for (let attempt = 1;', $poster);
        self::assertStringContainsString('duplicate !== \'boolean\'', $poster);
        self::assertStringContainsString('throttle:monitoring-log-receipts', $routes);
        self::assertStringContainsString("Limit::perMinute(300)->by('monitoring-log-receipts:global')", $provider);
        self::assertStringContainsString('replay the existing outbox file', $runbook);
        self::assertStringContainsString('private key run outside', strtolower($runbook));
        self::assertStringContainsString('OBSERVABILITY_LOG_RECEIPT_VERIFYING_KEYS=', $environment);
        self::assertStringNotContainsString('OBSERVABILITY_LOG_RECEIPT_PRIVATE', $environment);
    }

    public function test_every_workflow_checkout_discards_repository_credentials(): void
    {
        foreach ([
            '.github/workflows/application-quality.yml',
            '.github/workflows/mariadb-concurrency.yml',
            '.github/workflows/external-availability.yml',
            '.github/workflows/capacity-test.yml',
            '.github/workflows/repository-governance.yml',
        ] as $artifact) {
            $workflow = $this->artifact($artifact);

            self::assertSame(
                substr_count($workflow, 'uses: actions/checkout@'),
                substr_count($workflow, 'persist-credentials: false'),
                "Every checkout in {$artifact} must discard its credential.",
            );
        }
    }

    public function test_every_third_party_action_is_pinned_to_an_immutable_commit(): void
    {
        $workflows = glob(dirname(__DIR__, 2).'/.github/workflows/*.yml');
        self::assertIsArray($workflows);
        self::assertNotEmpty($workflows);

        foreach ($workflows as $path) {
            $workflow = file_get_contents($path);
            self::assertIsString($workflow);
            preg_match_all('/^\s*uses:\s+([^\s#]+)/m', $workflow, $matches);
            self::assertNotEmpty(
                $matches[1],
                basename($path).' must declare at least one pinned action.',
            );

            foreach ($matches[1] as $action) {
                self::assertMatchesRegularExpression(
                    '/\A[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+@[a-f0-9]{40}\z/',
                    $action,
                    "Third-party action [{$action}] in ".basename($path).' is not immutable.',
                );
            }
        }
    }

    public function test_replication_attestation_artifacts_keep_private_keys_outside_application_hosts(): void
    {
        $signer = $this->artifact(
            'scripts/sign-database-replication-attestation.mjs',
        );
        $runbook = $this->artifact('deploy/replication/README.md');
        $importer = $this->artifact(
            'deploy/scripts/import-database-replication-attestation.sh',
        );

        self::assertStringContainsString("sign('sha256'", $signer);
        self::assertStringContainsString("flag: 'wx'", $signer);
        self::assertStringContainsString(
            'replication:attestation-import',
            $runbook,
        );
        self::assertStringContainsString('one-click promote', strtolower($runbook));
        foreach ([
            'deploy/replication/topology.payload.example.json',
            'deploy/replication/failover.payload.example.json',
            'deploy/replication/failover-failed.payload.example.json',
            'deploy/replication/failback.payload.example.json',
            'deploy/replication/drill.payload.example.json',
        ] as $path) {
            $payload = $this->artifact($path);
            self::assertIsArray(json_decode($payload, true, 32, JSON_THROW_ON_ERROR));
            self::assertStringNotContainsString('PRIVATE KEY', $payload);
        }
        self::assertStringNotContainsString('BEGIN PRIVATE KEY', $signer);
        self::assertStringNotContainsString('BEGIN PRIVATE KEY', $runbook);
        self::assertStringContainsString('--file=-', $importer);
        self::assertStringContainsString('--fail-on-unhealthy', $importer);
        self::assertStringContainsString('--kill-after=5s', $importer);
        self::assertStringNotContainsString('mktemp', $importer);
        self::assertStringNotContainsString('PRIVATE KEY', $importer);
    }

    public function test_recovery_verifier_artifacts_never_embed_private_keys(): void
    {
        $signer = $this->artifact('scripts/sign-recovery-attestation.mjs');
        $runbook = $this->artifact('deploy/recovery/README.md');

        self::assertStringContainsString("sign('sha256'", $signer);
        self::assertStringContainsString("'pitr_observation'", $signer);
        self::assertStringContainsString("flag: 'wx'", $signer);
        self::assertStringContainsString('recovery:attestation-import', $runbook);
        self::assertStringContainsString('There is deliberately no restore button', $runbook);
        foreach ([
            'deploy/recovery/pitr.payload.example.json',
            'deploy/recovery/backup.payload.example.json',
            'deploy/recovery/backup-failure.payload.example.json',
            'deploy/recovery/restore-drill.payload.example.json',
        ] as $path) {
            $payload = $this->artifact($path);
            self::assertIsArray(json_decode($payload, true, 32, JSON_THROW_ON_ERROR));
            self::assertStringNotContainsString('PRIVATE KEY', $payload);
        }
        self::assertStringNotContainsString('BEGIN PRIVATE KEY', $signer);
        self::assertStringNotContainsString('BEGIN PRIVATE KEY', $runbook);
    }

    public function test_recovery_signer_and_php_verifier_have_a_cross_runtime_contract(): void
    {
        $workflow = $this->artifact('.github/workflows/mariadb-concurrency.yml');

        self::assertStringContainsString(
            'tests/Unit/RecoveryAttestationInteropTest.php',
            $workflow,
        );
    }

    public function test_supervisor_profiles_isolate_every_queue_and_remove_the_legacy_pool(): void
    {
        foreach (['database', 'redis'] as $profile) {
            $configuration = $this->artifact(
                "deploy/supervisor/ubsc-{$profile}.conf.example",
            );

            self::assertStringNotContainsString('ubsc-short', $configuration);
            self::assertStringContainsString('[program:ubsc-documents]', $configuration);
            self::assertStringContainsString('[program:ubsc-notifications]', $configuration);
            self::assertStringContainsString('[program:ubsc-media-maintenance]', $configuration);
            self::assertStringContainsString('[program:ubsc-default]', $configuration);
            self::assertSame(8, substr_count($configuration, 'command=/usr/bin/php artisan queue:work'));
            self::assertSame(9, substr_count($configuration, 'autorestart=true'));
        }
    }

    public function test_live_process_verifier_checks_host_restart_and_dead_man_heartbeats(): void
    {
        $script = $this->artifact('deploy/scripts/verify-process-supervision.sh');

        self::assertStringContainsString('systemctl is-enabled --quiet', $script);
        self::assertStringContainsString('systemctl is-active --quiet', $script);
        self::assertStringContainsString('--property=Restart', $script);
        self::assertStringContainsString('--kill-after=5s', $script);
        self::assertStringContainsString('production:process-check --strict --live', $script);
        self::assertStringContainsString('background-jobs:doctor --probe-backends', $script);
        self::assertStringContainsString('ubsc-media-video', $script);
    }

    public function test_release_reload_applies_configuration_and_refreshes_the_scheduler(): void
    {
        $script = $this->artifact('deploy/scripts/reload-process-supervision.sh');
        $reread = $this->position($script, '"${SUPERVISORCTL_BINARY}" reread');
        $update = $this->position($script, '"${SUPERVISORCTL_BINARY}" update');
        $scheduler = $this->position(
            $script,
            '"${SUPERVISORCTL_BINARY}" restart ubsc:ubsc-scheduler',
        );

        self::assertLessThan($update, $reread);
        self::assertLessThan($scheduler, $update);
        self::assertStringContainsString('production:process-check --strict', $script);
        self::assertStringContainsString('--kill-after=5s', $script);
    }

    public function test_systemd_drop_in_recovers_the_supervisor_daemon_itself(): void
    {
        $configuration = $this->artifact(
            'deploy/systemd/supervisor-ubsc-recovery.conf.example',
        );

        self::assertStringContainsString('Restart=on-failure', $configuration);
        self::assertStringContainsString('RestartSec=5s', $configuration);
        self::assertStringContainsString('TimeoutStopSec=1200s', $configuration);
        self::assertStringContainsString('StartLimitBurst=10', $configuration);
    }

    private function artifact(string $relativePath): string
    {
        $contents = file_get_contents(dirname(__DIR__, 2).'/'.$relativePath);

        self::assertIsString($contents);

        return $contents;
    }

    private function position(string $contents, string $needle): int
    {
        $position = strpos($contents, $needle);

        self::assertIsInt($position, "Missing deployment step: {$needle}");

        return $position;
    }

    private function lastPosition(string $contents, string $needle): int
    {
        $position = strrpos($contents, $needle);

        self::assertIsInt($position, "Missing deployment step: {$needle}");

        return $position;
    }

    private function environmentValue(string $contents, string $name): string
    {
        self::assertMatchesRegularExpression(
            '/^'.preg_quote($name, '/').'=(.*)$/m',
            $contents,
        );
        preg_match('/^'.preg_quote($name, '/').'=(.*)$/m', $contents, $matches);

        $value = trim((string) ($matches[1] ?? ''));
        if (strlen($value) >= 2
            && in_array($value[0], ["'", '"'], true)
            && $value[0] === $value[strlen($value) - 1]) {
            return substr($value, 1, -1);
        }

        return $value;
    }
}
