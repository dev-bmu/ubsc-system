<?php

namespace Tests\Unit;

use App\Services\Production\DatabaseReplicationAttestationVerifier;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class DatabaseReplicationAttestationInteropTest extends TestCase
{
    public function test_external_node_signer_and_php_verifier_share_one_canonical_contract(): void
    {
        $node = (new ExecutableFinder)->find('node');
        if ($node === null) {
            self::markTestSkipped('Node.js is unavailable for cross-runtime attestation verification.');
        }

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
        self::assertTrue(openssl_pkey_export($key, $privateKey, null, $options));
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);

        $payload = [
            'schema_version' => 1,
            'event_type' => 'topology_observation',
            'operation_id' => 'cross-runtime-contract-v1',
            'provider' => 'managed-database',
            'observer' => 'replication-observer-v1',
            'cluster_id' => 'ubsc-cluster-v1',
            'dataset_id' => 'ubsc-dataset-v1',
            'environment' => 'testing',
            'primary_region' => 'ap-southeast-3',
            'writer_endpoint_id' => 'writer-endpoint-v1',
            'reader_endpoint_id' => 'reader-endpoint-v1',
            'writer_instance_id' => 'writer-a',
            'previous_writer_instance_id' => null,
            'topology_epoch' => 7,
            'observed_at' => '2026-08-24T08:00:00Z',
            'replica_count' => 2,
            'healthy_replica_count' => 2,
            'synchronous_replica_count' => 1,
            'maximum_replica_lag_ms' => 80,
            'single_writer' => true,
            'writer_writable' => true,
            'quorum_healthy' => true,
            'stale_writers_fenced' => true,
            'replicas_read_only' => true,
            'gtid_enabled' => true,
            'row_binlog' => true,
            'automatic_failover' => true,
            'cross_az' => true,
            'reader_endpoint_healthy' => true,
            'promotion_caught_up' => true,
            'data_loss_bytes' => 0,
            'change_reference' => '',
        ];
        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-replication-'.bin2hex(random_bytes(8));
        $payloadPath = $prefix.'.payload.json';
        $keyPath = $prefix.'.private.pem';
        $outputPath = $prefix.'.signed.json';
        $invalidOutputPath = $prefix.'.invalid.signed.json';

        try {
            self::assertNotFalse(file_put_contents(
                $payloadPath,
                json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                LOCK_EX,
            ));
            self::assertNotFalse(file_put_contents($keyPath, $privateKey, LOCK_EX));

            $process = new Process([
                $node,
                base_path('scripts/sign-database-replication-attestation.mjs'),
                $payloadPath,
                $keyPath,
                'observer-v1',
                $outputPath,
            ], base_path(), null, null, 20);
            $process->run();
            self::assertTrue(
                $process->isSuccessful(),
                trim($process->getErrorOutput() ?: $process->getOutput()),
            );

            $document = file_get_contents($outputPath);
            self::assertIsString($document);
            $envelope = json_decode($document, true, 16, JSON_THROW_ON_ERROR);
            self::assertIsArray($envelope);

            config()->set('database_replication.attestation.active_key_ids', ['observer-v1']);
            config()->set('database_replication.attestation.verification_keys', [
                'observer-v1' => 'base64:'.base64_encode((string) $details['key']),
            ]);
            $verifier = app(DatabaseReplicationAttestationVerifier::class);

            self::assertSame(
                $verifier->canonicalJson($payload),
                $verifier->canonicalJson($envelope['payload']),
            );
            self::assertTrue($verifier->isActiveKey('observer-v1'));
            self::assertTrue($verifier->verify(
                $envelope['payload'],
                $envelope['key_id'],
                $envelope['signature'],
            ));

            $envelope['payload']['writer_instance_id'] = 'writer-tampered';
            self::assertFalse($verifier->verify(
                $envelope['payload'],
                $envelope['key_id'],
                $envelope['signature'],
            ));

            $invalid = $payload;
            unset($invalid['quorum_healthy']);
            self::assertNotFalse(file_put_contents(
                $payloadPath,
                json_encode($invalid, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                LOCK_EX,
            ));
            $invalidProcess = new Process([
                $node,
                base_path('scripts/sign-database-replication-attestation.mjs'),
                $payloadPath,
                $keyPath,
                'observer-v1',
                $invalidOutputPath,
            ], base_path(), null, null, 20);
            $invalidProcess->run();

            self::assertFalse($invalidProcess->isSuccessful());
            self::assertStringContainsString(
                'missing or unexpected fields',
                $invalidProcess->getErrorOutput(),
            );
            self::assertFileDoesNotExist($invalidOutputPath);
        } finally {
            foreach ([$payloadPath, $keyPath, $outputPath, $invalidOutputPath] as $path) {
                if (is_file($path)) {
                    unlink($path);
                }
            }
        }
    }
}
