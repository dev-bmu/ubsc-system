<?php

namespace Tests\Unit;

use App\Exceptions\HighAvailabilityContractViolation;
use App\Services\Production\HighAvailabilityContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class HighAvailabilityContractTest extends TestCase
{
    public function test_complete_managed_high_availability_contract_passes(): void
    {
        $report = $this->contract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_database_requires_managed_multi_az_writer_tls_and_bounded_failover(): void
    {
        $configuration = $this->configuration();
        $configuration['high_availability']['database']['automatic_failover'] = false;
        $configuration['high_availability']['database']['failover_rto_seconds'] = 0;
        $configuration['database']['connections']['mariadb']['url'] = 'mariadb://user:secret@127.0.0.1/ubsc';
        $configuration['database']['connections']['mariadb']['options'][
            constant('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')
        ] = false;

        $contract = $this->contract($configuration);
        $report = $contract->report();

        self::assertFalse($report['valid']);
        self::assertContains('database.managed_multi_az', $this->failedCodes($report));
        self::assertContains('database.stable_failover_endpoint', $this->failedCodes($report));
        self::assertContains('database.failover_target', $this->failedCodes($report));
        self::assertContains('database.tls_verified', $this->failedCodes($report));

        $this->expectException(HighAvailabilityContractViolation::class);
        $contract->assertSatisfied();
    }

    public function test_load_balancer_requires_two_stateless_identifiable_nodes(): void
    {
        $configuration = $this->configuration();
        $configuration['high_availability']['load_balancer']['enabled'] = false;
        $configuration['high_availability']['load_balancer']['health_path'] = '/up';
        $configuration['high_availability']['load_balancer']['instance_id'] = '';
        $configuration['high_availability']['load_balancer']['sticky_sessions'] = true;
        $configuration['high_availability']['load_balancer']['forwarded_for_mode'] = 'append';
        $configuration['production']['application_instances'] = 1;
        $configuration['security']['trusted_proxies'] = '*';

        $report = $this->contract($configuration)->report();
        $failed = $this->failedCodes($report);

        self::assertContains('load_balancer.two_nodes', $failed);
        self::assertContains('load_balancer.edge_high_availability', $failed);
        self::assertContains('load_balancer.readiness_routing', $failed);
        self::assertContains('load_balancer.node_identity', $failed);
        self::assertContains('load_balancer.trusted_proxies', $failed);
        self::assertContains('load_balancer.forwarded_for_normalization', $failed);
        self::assertContains('load_balancer.routing_policy', $failed);
    }

    public function test_load_balancer_edge_cannot_be_a_single_failure_domain(): void
    {
        $configuration = $this->configuration();
        $configuration['high_availability']['load_balancer']['managed_service'] = false;
        $configuration['high_availability']['load_balancer']['ha_enabled'] = false;
        $configuration['high_availability']['load_balancer']['automatic_failover'] = false;
        $configuration['high_availability']['load_balancer']['minimum_failure_domains'] = 1;
        $configuration['high_availability']['load_balancer']['failover_rto_seconds'] = 121;

        $report = $this->contract($configuration)->report();

        self::assertContains(
            'load_balancer.edge_high_availability',
            $this->failedCodes($report),
        );
    }

    public function test_redis_requires_secure_dedicated_managed_failover_endpoints(): void
    {
        $configuration = $this->configuration();
        $configuration['high_availability']['redis']['automatic_failover'] = false;
        $configuration['database']['redis']['cache']['url'] = $configuration['database']['redis']['session']['url'];
        $configuration['database']['redis']['queue']['url'] = 'redis://default:queue-secret@queue.redis.internal:6379/0';

        $report = $this->contract($configuration)->report();
        $failed = $this->failedCodes($report);

        self::assertContains('redis.managed_replication', $failed);
        self::assertContains('redis.secure_endpoints', $failed);
        self::assertContains('redis.physical_isolation', $failed);
    }

    public function test_redis_workload_policies_prevent_session_and_queue_eviction(): void
    {
        $configuration = $this->configuration();
        $configuration['high_availability']['redis']['session_maxmemory_policy'] = 'allkeys-lru';
        $configuration['high_availability']['redis']['cache_maxmemory_policy'] = 'noeviction';
        $configuration['high_availability']['redis']['traffic_maxmemory_policy'] = 'noeviction';
        $configuration['high_availability']['redis']['queue_persistence'] = 'none';

        $report = $this->contract($configuration)->report();

        self::assertContains('redis.workload_policies', $this->failedCodes($report));
    }

    public function test_session_endpoint_must_participate_in_runtime_readiness(): void
    {
        $configuration = $this->configuration();
        $configuration['monitoring']['readiness']['required_checks'] = ['database', 'cache'];

        $report = $this->contract($configuration)->report();

        self::assertContains('redis.session_runtime_gating', $this->failedCodes($report));
        self::assertContains('redis.lock_runtime_gating', $this->failedCodes($report));
        self::assertContains('redis.traffic_runtime_gating', $this->failedCodes($report));
    }

    public function test_coordination_endpoint_must_be_dedicated_noeviction_and_ready(): void
    {
        $configuration = $this->configuration();
        $configuration['cache']['stores']['redis']['lock_connection'] = 'cache';
        $configuration['high_availability']['redis']['coordination_maxmemory_policy'] = 'allkeys-lru';

        $report = $this->contract($configuration)->report();
        $failed = $this->failedCodes($report);

        self::assertContains('redis.physical_isolation', $failed);
        self::assertContains('redis.workload_policies', $failed);
    }

    public function test_ha_check_requires_enforcement_release_identity_and_bounded_readiness(): void
    {
        $configuration = $this->configuration();
        $configuration['high_availability']['enforce'] = false;
        $configuration['monitoring']['release'] = 'replace-with-release';
        $configuration['high_availability']['load_balancer']['health_timeout_seconds'] = 4;
        $configuration['monitoring']['readiness']['attempts'] = 2;
        $configuration['monitoring']['readiness']['total_budget_ms'] = 4_000;

        $report = $this->contract($configuration)->report();
        $failed = $this->failedCodes($report);

        self::assertContains('contract.enforcement', $failed);
        self::assertContains('load_balancer.release_identity', $failed);
        self::assertContains('load_balancer.routing_policy', $failed);
        self::assertContains('load_balancer.readiness_fail_fast', $failed);
    }

    public function test_reports_never_disclose_database_or_redis_credentials(): void
    {
        $encoded = json_encode($this->contract()->report(), JSON_THROW_ON_ERROR);

        self::assertStringNotContainsString('database-secret', $encoded);
        self::assertStringNotContainsString('session-secret', $encoded);
        self::assertStringNotContainsString('cache-secret', $encoded);
        self::assertStringNotContainsString('traffic-secret', $encoded);
        self::assertStringNotContainsString('queue-secret', $encoded);
        self::assertStringNotContainsString('coordination-secret', $encoded);
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): HighAvailabilityContract
    {
        return new HighAvailabilityContract(new Repository(
            $configuration ?? $this->configuration(),
        ));
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        $sslCaAttribute = constant('PDO::MYSQL_ATTR_SSL_CA');
        $verifyServerAttribute = constant('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT');

        return [
            'high_availability' => [
                'enforce' => true,
                'database' => [
                    'managed_service' => true,
                    'ha_enabled' => true,
                    'automatic_failover' => true,
                    'endpoint_kind' => 'cluster',
                    'minimum_availability_zones' => 2,
                    'failover_rto_seconds' => 60,
                    'tls_required' => true,
                    'tls_verify_peer' => true,
                    'tls_ca' => '/run/secrets/managed-db-ca.pem',
                    'allowed_endpoint_kinds' => ['cluster', 'proxy'],
                    'maximum_failover_rto_seconds' => 120,
                ],
                'load_balancer' => [
                    'enabled' => true,
                    'managed_service' => true,
                    'ha_enabled' => true,
                    'automatic_failover' => true,
                    'failover_rto_seconds' => 60,
                    'maximum_failover_rto_seconds' => 120,
                    'minimum_failure_domains' => 2,
                    'health_path' => '/health/ready',
                    'instance_id' => 'ubsc-app-01',
                    'expose_instance_header' => true,
                    'expose_release_header' => true,
                    'forwarded_for_mode' => 'replace',
                    'readiness_edge_protected' => true,
                    'sticky_sessions' => false,
                    'health_interval_seconds' => 5,
                    'health_timeout_seconds' => 5,
                    'connection_drain_seconds' => 30,
                ],
                'redis' => [
                    'managed_service' => true,
                    'ha_enabled' => true,
                    'automatic_failover' => true,
                    'topology' => 'replicated',
                    'minimum_replicas' => 1,
                    'tls_required' => true,
                    'tls_verify_peer' => true,
                    'auth_required' => true,
                    'dedicated_workload_endpoints' => true,
                    'session_maxmemory_policy' => 'noeviction',
                    'cache_maxmemory_policy' => 'allkeys-lru',
                    'traffic_maxmemory_policy' => 'allkeys-lru',
                    'queue_maxmemory_policy' => 'noeviction',
                    'coordination_maxmemory_policy' => 'noeviction',
                    'queue_persistence' => 'provider_managed',
                    'allowed_cache_policies' => ['allkeys-lru', 'allkeys-lfu'],
                    'allowed_queue_persistence' => ['provider_managed', 'aof_everysec'],
                ],
            ],
            'production' => ['application_instances' => 2],
            'app' => ['env' => 'production', 'url' => 'https://ubsportcenter.co.id'],
            'security' => ['trusted_proxies' => '10.0.0.0/24'],
            'monitoring' => [
                'release' => 'release-20260823',
                'readiness' => [
                    'required_checks' => ['database', 'cache', 'sessions', 'locks', 'traffic'],
                    'attempts' => 1,
                    'total_budget_ms' => 4_000,
                ],
            ],
            'session' => ['driver' => 'redis', 'connection' => 'session'],
            'cache' => [
                'default' => 'redis',
                'limiter' => 'traffic',
                'stores' => [
                    'redis' => [
                        'driver' => 'redis',
                        'connection' => 'cache',
                        'lock_connection' => 'coordination',
                    ],
                    'traffic' => [
                        'driver' => 'redis',
                        'connection' => 'traffic',
                        'lock_connection' => 'traffic',
                    ],
                ],
            ],
            'queue' => [
                'default' => 'redis',
                'connections' => [
                    'redis' => ['driver' => 'redis', 'connection' => 'queue'],
                ],
            ],
            'database' => [
                'default' => 'mariadb',
                'connections' => [
                    'mariadb' => [
                        'driver' => 'mariadb',
                        'url' => 'mariadb://ubsc:database-secret@writer.db.internal:3306/ubsc',
                        'options' => [
                            $sslCaAttribute => '/run/secrets/managed-db-ca.pem',
                            $verifyServerAttribute => true,
                            \PDO::ATTR_TIMEOUT => 3,
                        ],
                    ],
                ],
                'redis' => [
                    'session' => [
                        'url' => 'rediss://default:session-secret@session.redis.internal:6379/0',
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'context' => $this->redisTlsContext(),
                    ],
                    'cache' => [
                        'url' => 'rediss://default:cache-secret@cache.redis.internal:6379/0',
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'context' => $this->redisTlsContext(),
                    ],
                    'traffic' => [
                        'url' => 'rediss://default:traffic-secret@traffic.redis.internal:6379/0',
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'context' => $this->redisTlsContext(),
                    ],
                    'queue' => [
                        'url' => 'rediss://default:queue-secret@queue.redis.internal:6379/0',
                        'timeout' => 2,
                        'read_timeout' => 6,
                        'context' => $this->redisTlsContext(),
                    ],
                    'coordination' => [
                        'url' => 'rediss://default:coordination-secret@coordination.redis.internal:6379/0',
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'context' => $this->redisTlsContext(),
                    ],
                ],
            ],
        ];
    }

    /** @return array{ssl:array{verify_peer:bool,verify_peer_name:bool,allow_self_signed:bool}} */
    private function redisTlsContext(): array
    {
        return [
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
            ],
        ];
    }

    /**
     * @param  array{checks:list<array{code:string,status:string,message:string}>}  $report
     * @return list<string>
     */
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
}
