<?php

namespace Tests\Unit;

use App\Exceptions\ProductionContractViolation;
use App\Services\Production\ProductionContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class ProductionContractTest extends TestCase
{
    public function test_complete_multi_node_contract_passes_strict_validation(): void
    {
        $report = $this->contract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_node_local_durable_storage_fails_closed(): void
    {
        $config = $this->configuration();
        $config['filesystems']['disks']['shared-public']['driver'] = 'local';
        $contract = $this->contract($config);
        $report = $contract->report();

        self::assertFalse($report['valid']);
        self::assertContains(
            'storage.media',
            $this->codesWithStatus($report, 'fail'),
        );

        $this->expectException(ProductionContractViolation::class);
        $contract->assertSatisfied();
    }

    public function test_session_cache_and_queue_redis_workloads_must_be_isolated(): void
    {
        $config = $this->configuration();
        $config['database']['redis']['cache'] = $config['database']['redis']['session'];
        $report = $this->contract($config)->report();

        self::assertFalse($report['valid']);
        self::assertContains(
            'redis.workload_isolation',
            $this->codesWithStatus($report, 'fail'),
        );
    }

    public function test_selected_redis_connection_must_resolve(): void
    {
        $config = $this->configuration();
        unset($config['database']['redis']['session']);
        $report = $this->contract($config)->report();

        self::assertFalse($report['valid']);
        self::assertContains(
            'redis.connections_resolve',
            $this->codesWithStatus($report, 'fail'),
        );
    }

    public function test_distributed_lock_connection_must_resolve_and_be_isolated(): void
    {
        $config = $this->configuration();
        $config['cache']['stores']['redis']['lock_connection'] = 'default';
        unset($config['database']['redis']['default']);

        $report = $this->contract($config)->report();

        self::assertContains('redis.connections_resolve', $this->codesWithStatus($report, 'fail'));
    }

    public function test_redis_queue_socket_timeout_must_exceed_blocking_interval(): void
    {
        $config = $this->configuration();
        $config['database']['redis']['queue']['read_timeout'] = 5;

        $report = $this->contract($config)->report();

        self::assertContains('queue.redis_blocking_timeout', $this->codesWithStatus($report, 'fail'));
    }

    public function test_release_activation_requires_environment_enforcement_and_immutable_identity(): void
    {
        $config = $this->configuration();
        $config['app']['env'] = 'staging';
        $config['production']['enforce'] = false;
        $config['monitoring']['release'] = 'replace-with-immutable-release-id';

        $report = $this->contract($config)->report();
        $failed = $this->codesWithStatus($report, 'fail');

        self::assertContains('runtime.production_environment', $failed);
        self::assertContains('contract.enforcement', $failed);
        self::assertContains('release.identity', $failed);
    }

    public function test_private_artifacts_cannot_use_a_public_object_disk(): void
    {
        $config = $this->configuration();
        $config['filesystems']['disks']['shared-private']['visibility'] = 'public';
        $report = $this->contract($config)->report();

        self::assertFalse($report['valid']);
        self::assertContains(
            'storage.identity_documents',
            $this->codesWithStatus($report, 'fail'),
        );
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): ProductionContract
    {
        return new ProductionContract(new Repository(
            $configuration ?? $this->configuration(),
        ));
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        return [
            'production' => [
                'enforce' => true,
                'topology' => 'multi_node',
                'application_instances' => 2,
                'shared_state' => [
                    'session_drivers' => ['redis', 'database'],
                    'cache_drivers' => ['redis', 'database', 'dynamodb'],
                    'queue_drivers' => ['redis', 'database', 'sqs'],
                    'durable_disk_drivers' => ['s3'],
                ],
                'durable_disks' => [
                    'media' => ['path' => 'domain.media', 'visibility' => 'public'],
                    'identity_documents' => ['path' => 'domain.identities', 'visibility' => 'private'],
                    'invoice_documents' => ['path' => 'domain.invoices', 'visibility' => 'private'],
                    'gallery_originals' => ['path' => 'domain.gallery_originals', 'visibility' => 'private'],
                    'gallery_staging' => ['path' => 'domain.gallery_staging', 'visibility' => 'private'],
                    'gallery_public' => ['path' => 'domain.gallery_public', 'visibility' => 'public'],
                ],
                'recommended' => [
                    'session_driver' => 'redis',
                    'cache_driver' => 'redis',
                    'queue_driver' => 'redis',
                ],
            ],
            'app' => [
                'env' => 'production',
                'maintenance' => ['driver' => 'cache', 'store' => 'coordination'],
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
                        'lock_connection' => 'coordination',
                    ],
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
            'database' => [
                'redis' => [
                    'session' => [
                        'url' => 'rediss://session.internal/0',
                        'host' => 'session.internal',
                        'port' => 6379,
                        'database' => 0,
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'max_retries' => 3,
                        'backoff_base' => 100,
                        'backoff_cap' => 1000,
                    ],
                    'cache' => [
                        'url' => 'rediss://cache.internal/0',
                        'host' => 'cache.internal',
                        'port' => 6379,
                        'database' => 0,
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'max_retries' => 3,
                        'backoff_base' => 100,
                        'backoff_cap' => 1000,
                    ],
                    'queue' => [
                        'url' => 'rediss://queue.internal/0',
                        'host' => 'queue.internal',
                        'port' => 6379,
                        'database' => 0,
                        'timeout' => 2,
                        'read_timeout' => 6,
                        'max_retries' => 3,
                        'backoff_base' => 100,
                        'backoff_cap' => 1000,
                    ],
                    'coordination' => [
                        'url' => 'rediss://coordination.internal/0',
                        'host' => 'coordination.internal',
                        'port' => 6379,
                        'database' => 0,
                        'timeout' => 2,
                        'read_timeout' => 2,
                        'max_retries' => 3,
                        'backoff_base' => 100,
                        'backoff_cap' => 1000,
                    ],
                ],
            ],
            'domain' => [
                'media' => 'shared-public',
                'identities' => 'shared-private',
                'invoices' => 'shared-private',
                'gallery_originals' => 'shared-private',
                'gallery_staging' => 'shared-private',
                'gallery_public' => 'shared-public',
            ],
            'filesystems' => [
                'disks' => [
                    'shared-private' => [
                        'driver' => 's3',
                        'bucket' => 'ubsc-private',
                        'throw' => true,
                        'http' => [
                            'connect_timeout' => 3,
                            'timeout' => 10,
                        ],
                        'retries' => 2,
                        'visibility' => 'private',
                    ],
                    'shared-public' => [
                        'driver' => 's3',
                        'bucket' => 'ubsc-public',
                        'throw' => true,
                        'http' => [
                            'connect_timeout' => 3,
                            'timeout' => 10,
                        ],
                        'retries' => 2,
                        'visibility' => 'public',
                    ],
                ],
            ],
            'monitoring' => [
                'release' => 'release-20260823',
                'external' => [
                    'enabled' => true,
                    'check_url' => 'https://ubsportcenter.co.id/health/ready',
                ],
                'readiness' => [
                    'required_checks' => ['database', 'cache', 'locks'],
                    'deep_checks' => ['queues', 'storage'],
                ],
            ],
        ];
    }

    /**
     * @param  array{checks:list<array{code:string,status:string,message:string}>}  $report
     * @return list<string>
     */
    private function codesWithStatus(array $report, string $status): array
    {
        return array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === $status,
            ),
        ));
    }
}
