<?php

namespace Tests\Unit;

use App\Exceptions\ProductionContractViolation;
use App\Services\Production\ProductionContract;
use App\Services\Production\ProductionRuntimeContract;
use App\Services\Production\ProductionTopologyResolver;
use App\Services\Production\SingleNodeProductionContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class SingleNodeProductionContractTest extends TestCase
{
    public function test_complete_single_node_profile_passes_strict_validation(): void
    {
        $report = $this->singleContract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame('single_node', $report['topology']);
        self::assertSame('single_failure_domain', $report['availability']);
        self::assertContains('database_replication', $report['standby_capabilities']);
    }

    public function test_single_node_rejects_fake_replication_and_load_balancer_claims(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['enabled'] = true;
        $configuration['high_availability']['load_balancer']['enabled'] = true;

        $contract = $this->singleContract($configuration);
        $report = $contract->report();
        $failures = $this->failedCodes($report);

        self::assertContains('standby.database_replication', $failures);
        self::assertContains('standby.load_balancer', $failures);

        $this->expectException(ProductionContractViolation::class);
        $contract->assertSatisfied();
    }

    public function test_single_node_rejects_release_local_storage_and_missing_recovery(): void
    {
        $configuration = $this->configuration();
        $configuration['single_node']['storage']['persistent_root'] = '/srv/ubsc/releases/current/storage';
        $configuration['single_node']['storage']['release_storage_linked'] = false;
        $configuration['disaster_recovery']['backup']['offsite'] = false;
        $configuration['single_node']['recovery']['binlog_archiving'] = false;

        $failures = $this->failedCodes($this->singleContract($configuration)->report());

        self::assertContains('storage.persistent_root', $failures);
        self::assertContains('storage.release_symlink', $failures);
        self::assertContains('recovery.verified_offsite_backup', $failures);
        self::assertContains('recovery.point_in_time', $failures);
    }

    public function test_redis_workloads_must_be_logically_isolated_and_authenticated(): void
    {
        $configuration = $this->configuration();
        $configuration['database']['redis']['traffic']['database'] = 1;
        $configuration['database']['redis']['queue']['password'] = '';

        $failures = $this->failedCodes($this->singleContract($configuration)->report());

        self::assertContains('redis.logical_isolation', $failures);
        self::assertContains('redis.authentication', $failures);
    }

    public function test_placeholder_credentials_and_off_host_endpoints_are_rejected(): void
    {
        $configuration = $this->configuration();
        $configuration['database']['connections']['mariadb']['username'] = 'replace_with_db_user';
        $configuration['database']['connections']['mariadb']['password'] = 'replace_with_db_password';
        $configuration['database']['redis']['session']['password'] = 'change-me-redis-secret';
        $configuration['monitoring']['external']['check_url'] = 'https://status.example.net/ubsc';
        $configuration['monitoring']['alerting']['webhook']['url'] = 'https://alerts.example.net/ubsc';
        $configuration['monitoring']['alerting']['webhook']['secret'] = 'replace_with_webhook_secret';

        $failures = $this->failedCodes($this->singleContract($configuration)->report());

        self::assertContains('database.least_privilege_identity', $failures);
        self::assertContains('database.credentials_present', $failures);
        self::assertContains('redis.authentication', $failures);
        self::assertContains('monitoring.external_availability', $failures);
        self::assertContains('monitoring.off_host_alerts', $failures);
    }

    public function test_process_supervision_cannot_pass_with_a_placeholder_artifact(): void
    {
        $configuration = $this->configuration();
        $configuration['process_supervision']['active_config_path'] = '/replace/with/supervisor.conf';

        $failures = $this->failedCodes($this->singleContract($configuration)->report());

        self::assertContains('operations.process_supervision', $failures);
    }

    public function test_external_monitor_flag_without_signed_ingest_proof_is_rejected(): void
    {
        $configuration = $this->configuration();
        $configuration['observability']['external_sli']['ingest_enabled'] = false;
        $configuration['observability']['external_sli']['signing_keys'] = [];

        $failures = $this->failedCodes($this->singleContract($configuration)->report());

        self::assertContains('monitoring.external_availability', $failures);
    }

    public function test_runtime_coordinator_routes_single_node_and_rejects_unknown_topology(): void
    {
        $configuration = $this->configuration();
        $repository = new Repository($configuration);
        $coordinator = new ProductionRuntimeContract(
            new ProductionTopologyResolver($repository),
            new ProductionContract($repository),
            new SingleNodeProductionContract($repository),
        );

        self::assertTrue($coordinator->report()['valid']);
        self::assertSame('single_node', $coordinator->report()['topology']);

        $repository->set('production.topology', 'automatic');
        $report = $coordinator->report();
        self::assertFalse($report['valid']);
        self::assertSame(['topology.supported'], $this->failedCodes($report));
    }

    /** @param array<string, mixed>|null $configuration */
    private function singleContract(?array $configuration = null): SingleNodeProductionContract
    {
        return new SingleNodeProductionContract(new Repository(
            $configuration ?? $this->configuration(),
        ));
    }

    /** @param array<string, mixed> $report @return list<string> */
    private function failedCodes(array $report): array
    {
        return array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        $redis = static fn (int $database, bool $queue = false): array => [
            'host' => '127.0.0.1',
            'port' => 6379,
            'database' => $database,
            'password' => 'R3dis-UBSC-2026-Random-Key!',
            'timeout' => 2,
            'read_timeout' => $queue ? 6 : 2,
            'max_retries' => 3,
            'backoff_base' => 100,
            'backoff_cap' => 1_000,
        ];
        $durable = [
            'media' => ['path' => 'domain.media'],
            'identity_documents' => ['path' => 'domain.identities'],
            'invoice_documents' => ['path' => 'domain.invoices'],
            'gallery_originals' => ['path' => 'domain.gallery_originals'],
            'gallery_staging' => ['path' => 'domain.gallery_staging'],
            'gallery_public' => ['path' => 'domain.gallery_public'],
        ];

        return [
            'app' => [
                'env' => 'production',
                'debug' => false,
                'url' => 'https://ubsportcenter.co.id',
                'maintenance' => ['driver' => 'cache', 'store' => 'coordination'],
            ],
            'production' => [
                'enforce' => true,
                'topology' => 'single_node',
                'application_instances' => 1,
                'durable_disks' => $durable,
            ],
            'single_node' => [
                'enforce' => true,
                'database' => [
                    'allowed_drivers' => ['mysql', 'mariadb'],
                    'maximum_connect_timeout_seconds' => 3,
                    'minimum_transaction_attempts' => 2,
                ],
                'redis' => [
                    'auth_required' => true,
                    'persistence' => 'aof_everysec',
                    'allowed_persistence' => ['aof_everysec'],
                    'required_noeviction_workloads' => ['session', 'queue', 'coordination'],
                ],
                'storage' => [
                    'persistent_root' => '/srv/ubsc/shared/storage',
                    'release_storage_linked' => true,
                    'allowed_drivers' => ['local', 's3'],
                    'required_durable_disks' => array_keys($durable),
                ],
                'deployment' => [
                    'runtime_reload_hook' => '/usr/local/libexec/ubsc-reload-runtime',
                ],
                'recovery' => [
                    'external_backup_runner' => true,
                    'binlog_archiving' => true,
                ],
                'standby' => ['database_replication'],
            ],
            'monitoring' => [
                'enabled' => true,
                'release' => '2026.08.26-deadbeef',
                'external' => [
                    'enabled' => true,
                    'provider' => 'ubsc-independent-monitor',
                    'check_url' => 'https://ubsportcenter.co.id/health/ready',
                    'interval_seconds' => 300,
                ],
                'backup' => ['enabled' => true],
                'readiness' => [
                    'required_checks' => ['database', 'cache', 'locks'],
                    'deep_checks' => ['queues', 'storage'],
                ],
                'alerting' => [
                    'channels' => ['log', 'webhook'],
                    'webhook' => [
                        'url' => 'https://alerts.ubsportcenter.co.id/incidents',
                        'secret' => 'Alerts-UBSC-2026-Random-Key!',
                    ],
                ],
            ],
            'database' => [
                'default' => 'mariadb',
                'connections' => [
                    'mariadb' => [
                        'driver' => 'mariadb',
                        'host' => '127.0.0.1',
                        'username' => 'ubsc_app',
                        'password' => 'Database-UBSC-2026-Random-Key!',
                        'strict' => true,
                    ],
                ],
                'redis' => [
                    'session' => $redis(3),
                    'cache' => $redis(1),
                    'queue' => $redis(2, true),
                    'coordination' => $redis(4),
                    'traffic' => $redis(5),
                ],
            ],
            'resilience' => ['database' => ['transaction_attempts' => 3]],
            'database_replication' => [
                'enabled' => false,
                'application_reads' => ['enabled' => false],
            ],
            'high_availability' => [
                'database' => [
                    'managed_service' => false,
                    'ha_enabled' => false,
                    'automatic_failover' => false,
                    'tls_required' => false,
                    'tls_verify_peer' => false,
                    'tls_ca' => null,
                ],
                'load_balancer' => ['enabled' => false, 'automatic_failover' => false],
                'redis' => [
                    'session_maxmemory_policy' => 'noeviction',
                    'cache_maxmemory_policy' => 'allkeys-lru',
                    'traffic_maxmemory_policy' => 'allkeys-lfu',
                    'queue_maxmemory_policy' => 'noeviction',
                    'coordination_maxmemory_policy' => 'noeviction',
                ],
            ],
            'session' => ['driver' => 'redis', 'connection' => 'session'],
            'cache' => [
                'default' => 'redis',
                'stores' => [
                    'redis' => [
                        'driver' => 'redis',
                        'connection' => 'cache',
                        'lock_connection' => 'coordination',
                    ],
                    'coordination' => [
                        'driver' => 'redis',
                        'connection' => 'coordination',
                    ],
                    'traffic' => ['driver' => 'redis', 'connection' => 'traffic'],
                ],
            ],
            'queue' => [
                'default' => 'redis',
                'connections' => [
                    'redis' => [
                        'driver' => 'redis',
                        'connection' => 'queue',
                        'block_for' => 5,
                        'after_commit' => true,
                    ],
                ],
            ],
            'domain' => [
                'media' => 'persistent-local',
                'identities' => 'persistent-local',
                'invoices' => 'persistent-local',
                'gallery_originals' => 'persistent-local',
                'gallery_staging' => 'persistent-local',
                'gallery_public' => 'persistent-local',
            ],
            'filesystems' => [
                'disks' => [
                    'persistent-local' => [
                        'driver' => 'local',
                        'root' => '/srv/ubsc/current/storage/app',
                        'throw' => true,
                    ],
                ],
            ],
            'deployment' => [
                'strategy' => 'atomic_single_node',
                'orchestrator' => [
                    'immutable_releases' => true,
                    'atomic_traffic_switch' => true,
                    'health_gated' => true,
                    'automatic_application_rollback' => true,
                    'maximum_unavailable' => 1,
                    'minimum_healthy_instances' => 1,
                    'retained_releases' => 5,
                ],
                'schema' => [
                    'expand_contract_required' => true,
                    'backward_compatible_releases' => 2,
                    'automatic_database_rollback' => false,
                ],
                'runtime' => [
                    'application_root' => '/srv/ubsc',
                    'releases_root' => '/srv/ubsc/releases',
                    'current_link' => '/srv/ubsc/current',
                    'local_readiness_url' => 'http://127.0.0.1:8080/health/ready',
                ],
                'edge' => [
                    'provider' => 'cloudflare',
                    'managed_dns' => true,
                    'cdn_enabled' => true,
                    'waf_enabled' => true,
                    'ddos_protection' => true,
                    'tls_termination' => true,
                    'origin_tls' => true,
                    'origin_access_restricted' => true,
                    'certificate_auto_renewal' => true,
                    'minimum_tls_version' => '1.2',
                ],
            ],
            'ddos_protection' => [
                'application' => [
                    'enabled' => true,
                    'limiter_store' => 'traffic',
                    'resource_envelope' => ['enabled' => true],
                ],
                'edge' => [
                    'always_on' => true,
                    'anycast_or_global_scrubbing' => true,
                    'automatic_l3_l4_mitigation' => true,
                    'automatic_l7_mitigation' => true,
                    'managed_waf_rules' => true,
                ],
                'origin' => [
                    'public_direct_access_disabled' => true,
                    'public_dns_disclosure_prevented' => true,
                ],
                'client_identity' => [
                    'provider_header' => 'x-verified-client-ip',
                    'edge_strips_spoofed_headers' => true,
                ],
            ],
            'disaster_recovery' => [
                'backup' => [
                    'enabled' => true,
                    'scope' => 'database',
                    'encrypted' => true,
                    'offsite' => true,
                    'immutable' => true,
                    'retention_days' => 35,
                    'minimum_retention_days' => 35,
                    'expected_interval_seconds' => 86_400,
                ],
                'pitr' => [
                    'enabled' => true,
                    'continuous' => true,
                    'retention_days' => 14,
                    'minimum_retention_days' => 14,
                ],
                'restore_drill' => [
                    'enabled' => true,
                    'interval_days' => 90,
                    'maximum_interval_days' => 90,
                    'isolated_target_required' => true,
                    'production_target_forbidden' => true,
                ],
            ],
            'process_supervision' => [
                'enforce' => true,
                'active_config_path' => '/etc/supervisor/conf.d/ubsc.conf',
            ],
            'capacity_planning' => ['enabled' => false],
            'resilience_drills' => ['enabled' => false],
            'observability' => [
                'external_sli' => [
                    'ingest_enabled' => true,
                    'provider' => 'ubsc-independent-monitor',
                    'signing_keys' => [
                        'monitor-v1' => 'External-Monitor-2026-Random-Key!',
                    ],
                ],
                'logs' => [
                    'off_host_export_enabled' => true,
                    'provider' => 'vector-loki',
                    'structured_json' => true,
                    'required_channel' => 'json_stderr',
                ],
            ],
            'logging' => [
                'channels' => ['stack' => ['channels' => ['daily', 'json_stderr']]],
            ],
        ];
    }
}
