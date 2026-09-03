<?php

namespace Tests\Unit;

use App\Exceptions\DatabaseReplicationContractViolation;
use App\Services\Production\DatabaseReplicationAttestationVerifier;
use App\Services\Production\DatabaseReplicationContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class DatabaseReplicationContractTest extends TestCase
{
    private static ?string $publicKey = null;

    protected function setUp(): void
    {
        parent::setUp();

        if (self::$publicKey === null) {
            $options = [
                'private_key_bits' => 2_048,
                'private_key_type' => OPENSSL_KEYTYPE_RSA,
            ];
            $windowsConfig = 'C:/xampp/php/extras/ssl/openssl.cnf';
            if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsConfig)) {
                $options['config'] = $windowsConfig;
            }
            $key = openssl_pkey_new($options);
            self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $key);
            $details = openssl_pkey_get_details($key);
            self::assertIsArray($details);
            self::$publicKey = (string) $details['key'];
        }
    }

    public function test_complete_single_writer_replication_contract_passes(): void
    {
        $contract = $this->contract();
        $report = $contract->report();

        self::assertTrue($contract->shouldEnforce());
        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_multi_writer_automatic_failback_and_missing_fencing_are_rejected(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['topology']['single_writer'] = false;
        $configuration['database_replication']['topology']['automatic_failback'] = true;
        $configuration['database_replication']['topology']['quorum_required'] = false;
        $configuration['database_replication']['topology']['stale_writer_fencing_required'] = false;
        $configuration['database_replication']['topology']['maximum_data_loss_bytes'] = 1;

        $contract = $this->contract($configuration);
        $failed = $this->failedCodes($contract->report());

        self::assertContains('topology.single_writer', $failed);
        self::assertContains('topology.split_brain_fencing', $failed);

        $this->expectException(DatabaseReplicationContractViolation::class);
        $contract->assertSatisfied();
    }

    public function test_transactional_connection_can_never_use_global_read_split(): void
    {
        $configuration = $this->configuration();
        $configuration['database']['connections']['mariadb']['read'] = [
            'host' => 'reader.database.internal',
        ];

        $report = $this->contract($configuration)->report();

        self::assertContains('connection.transactional_writer', $this->failedCodes($report));
    }

    public function test_writer_connection_requires_a_stable_dns_endpoint_not_an_ip_literal(): void
    {
        $configuration = $this->configuration();
        $configuration['database']['connections']['mariadb']['url'] = null;
        $configuration['database']['connections']['mariadb']['host'] = '2001:db8::42';

        $report = $this->contract($configuration)->report();

        self::assertContains('connection.transactional_writer', $this->failedCodes($report));
    }

    public function test_writer_reader_and_independent_observer_identities_cannot_collapse(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['target']['reader_endpoint_id'] =
            $configuration['database_replication']['target']['writer_endpoint_id'];
        $configuration['database_replication']['target']['independent_observer'] =
            $configuration['database_replication']['target']['provider'];

        $report = $this->contract($configuration)->report();

        self::assertContains('target.bound_identity', $this->failedCodes($report));
    }

    public function test_independent_observer_cannot_reuse_any_dataset_identity(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['target']['independent_observer'] =
            $configuration['database_replication']['target']['dataset_id'];

        $report = $this->contract($configuration)->report();

        self::assertContains('target.bound_identity', $this->failedCodes($report));
    }

    public function test_optional_eventual_reader_requires_isolation_tls_fallback_and_causal_window(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['application_reads']['enabled'] = true;
        $configuration['database_replication']['application_reads']['fallback_to_writer'] = false;
        $configuration['database_replication']['application_reads']['read_after_write_seconds'] = 0;
        $configuration['database']['connections']['mariadb_replica']['host'] = 'writer.database.internal';
        $configuration['database']['connections']['mariadb_replica']['read_only'] = false;

        $report = $this->contract($configuration)->report();

        self::assertContains('connection.replica_read_policy', $this->failedCodes($report));
    }

    public function test_replication_and_recovery_must_reference_the_same_dataset(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['target']['dataset_id'] = 'another-dataset';

        $report = $this->contract($configuration)->report();

        self::assertContains('target.recovery_alignment', $this->failedCodes($report));
    }

    public function test_stale_observation_and_ledger_windows_are_rejected(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['observation']['warning_after_seconds'] = 600;
        $configuration['database_replication']['observation']['outage_after_seconds'] = 1_200;
        $configuration['database_replication']['ledger']['verification_warning_after_seconds'] = 86_400;
        $configuration['database_replication']['ledger']['verification_outage_after_seconds'] = 172_800;

        $failed = $this->failedCodes($this->contract($configuration)->report());

        self::assertContains('telemetry.freshness', $failed);
        self::assertContains('telemetry.ledger_cadence', $failed);
    }

    public function test_replication_attestation_rotation_rejects_duplicate_public_key_material(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['attestation']['active_key_ids'] = [
            'observer-v1',
            'observer-v2',
        ];
        $configuration['database_replication']['attestation']['verification_keys']['observer-v2'] =
            $configuration['database_replication']['attestation']['verification_keys']['observer-v1'];

        $report = $this->contract($configuration)->report();

        self::assertContains('attestation.independent_source', $this->failedCodes($report));
    }

    public function test_replication_attestation_validates_inactive_historical_keys(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['attestation']['verification_keys']['observer-old'] =
            'not-a-public-key';

        $malformed = $this->contract($configuration)->report();
        self::assertContains('attestation.independent_source', $this->failedCodes($malformed));

        $configuration = $this->configuration();
        $configuration['database_replication']['attestation']['verification_keys']['observer-old'] =
            $configuration['database_replication']['attestation']['verification_keys']['observer-v1'];

        $duplicate = $this->contract($configuration)->report();
        self::assertContains('attestation.independent_source', $this->failedCodes($duplicate));
    }

    public function test_reports_never_disclose_database_credentials_or_signing_material(): void
    {
        $encoded = json_encode($this->contract()->report(), JSON_THROW_ON_ERROR);

        self::assertStringNotContainsString('database-password', $encoded);
        self::assertStringNotContainsString('replication-ledger-test-key', $encoded);
        self::assertStringNotContainsString('PUBLIC KEY', $encoded);
    }

    public function test_ledger_key_must_be_strong_and_independent_from_application_secrets(): void
    {
        $configuration = $this->configuration();
        $key = $configuration['database_replication']['ledger']['signing_keys']['ledger-v1'];
        $configuration['app']['key'] = $key;

        $reused = $this->contract($configuration)->report();
        self::assertContains('ledger.key_independence', $this->failedCodes($reused));

        $configuration['app']['key'] = 'another-application-key-with-independent-domain';
        $configuration['database_replication']['ledger']['signing_keys']['ledger-v1'] =
            str_repeat('x', 40);
        $weak = $this->contract($configuration)->report();

        self::assertContains('ledger.signing_keyring', $this->failedCodes($weak));
        self::assertContains('ledger.key_independence', $this->failedCodes($weak));
    }

    public function test_replication_key_rotation_validates_every_distinct_historical_key(): void
    {
        $configuration = $this->configuration();
        $configuration['database_replication']['ledger']['signing_keys']['ledger-v2'] =
            $configuration['database_replication']['ledger']['signing_keys']['ledger-v1'];
        $duplicate = $this->contract($configuration)->report();

        self::assertContains('ledger.unique_key_material', $this->failedCodes($duplicate));

        $configuration = $this->configuration();
        $configuration['database_replication']['ledger']['signing_keys']['ledger-old'] =
            str_repeat('x', 40);
        $weakHistorical = $this->contract($configuration)->report();

        self::assertContains('ledger.signing_keyring', $this->failedCodes($weakHistorical));
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): DatabaseReplicationContract
    {
        $repository = new Repository($configuration ?? $this->configuration());

        return new DatabaseReplicationContract(
            $repository,
            new DatabaseReplicationAttestationVerifier($repository),
        );
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        $sslCa = constant('PDO::MYSQL_ATTR_SSL_CA');
        $verify = constant('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT');

        return [
            'database_replication' => [
                'enforce' => true,
                'enabled' => true,
                'target' => [
                    'provider' => 'managed-database',
                    'cluster_id' => 'ubsc-cluster-v1',
                    'dataset_id' => 'ubsc-relational-v1',
                    'environment' => 'production',
                    'primary_region' => 'ap-southeast-3',
                    'writer_endpoint_id' => 'ubsc-writer-endpoint',
                    'reader_endpoint_id' => 'ubsc-reader-endpoint',
                    'independent_observer' => 'ubsc-replication-observer',
                ],
                'topology' => [
                    'managed_service' => true,
                    'mode' => 'synchronous',
                    'allowed_modes' => ['synchronous', 'semisynchronous'],
                    'single_writer' => true,
                    'automatic_failover' => true,
                    'automatic_failback' => false,
                    'minimum_availability_zones' => 2,
                    'minimum_replicas' => 1,
                    'minimum_synchronous_replicas' => 1,
                    'quorum_required' => true,
                    'stale_writer_fencing_required' => true,
                    'promotion_catchup_required' => true,
                    'maximum_data_loss_bytes' => 0,
                    'failover_rto_seconds' => 60,
                    'maximum_failover_rto_seconds' => 120,
                ],
                'engine' => [
                    'gtid_required' => true,
                    'row_binlog_required' => true,
                    'replica_read_only_required' => true,
                    'tls_required' => true,
                    'tls_verify_peer' => true,
                ],
                'lag' => ['warning_ms' => 2_000, 'outage_ms' => 10_000],
                'observation' => [
                    'enabled' => true,
                    'warning_after_seconds' => 120,
                    'outage_after_seconds' => 300,
                ],
                'application_reads' => [
                    'enabled' => false,
                    'connection' => 'mariadb_replica',
                    'fallback_to_writer' => true,
                    'read_after_write_seconds' => 30,
                ],
                'attestation' => [
                    'required' => true,
                    'active_key_ids' => ['observer-v1'],
                    'verification_keys' => [
                        'observer-v1' => 'base64:'.base64_encode((string) self::$publicKey),
                    ],
                ],
                'ledger' => [
                    'active_key_id' => 'ledger-v1',
                    'signing_keys' => [
                        'ledger-v1' => 'replication-ledger-test-key-version-one',
                    ],
                    'minimum_key_bytes' => 32,
                    'verification_warning_after_seconds' => 7_200,
                    'verification_outage_after_seconds' => 14_400,
                ],
            ],
            'disaster_recovery' => [
                'target' => [
                    'provider' => 'managed-database',
                    'dataset_id' => 'ubsc-relational-v1',
                    'primary_region' => 'ap-southeast-3',
                ],
            ],
            'database' => [
                'default' => 'mariadb',
                'connections' => [
                    'mariadb' => [
                        'driver' => 'mariadb',
                        'url' => 'mariadb://ubsc:database-password@writer.database.internal:3306/ubsc',
                        'options' => [
                            $sslCa => '/run/secrets/database-ca.pem',
                            $verify => true,
                        ],
                    ],
                    'mariadb_replica' => [
                        'driver' => 'mariadb',
                        'host' => 'reader.database.internal',
                        'read_only' => true,
                        'options' => [
                            $sslCa => '/run/secrets/database-ca.pem',
                            $verify => true,
                        ],
                    ],
                ],
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
