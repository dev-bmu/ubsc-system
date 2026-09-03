<?php

namespace Tests\Unit;

use App\Services\Production\RecoveryAttestationVerifier;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class RecoveryAttestationInteropTest extends TestCase
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
            'evidence_type' => 'pitr_observation',
            'operation_id' => 'cross-runtime-recovery-v1',
            'provider' => 'managed-db',
            'verifier' => 'recovery-verifier-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'backup_destination_id' => 'ubsc-vault-v1',
            'primary_region' => 'ap-southeast-3',
            'recovery_region' => 'ap-southeast-1',
            'latest_recovery_point_at' => '2026-08-24T01:59:00Z',
            'checked_at' => '2026-08-24T02:00:00Z',
            'continuous' => true,
            'restorable' => true,
        ];
        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-recovery-'.bin2hex(random_bytes(8));
        $payloadPath = $prefix.'.payload.json';
        $keyPath = $prefix.'.private.pem';
        $outputPath = $prefix.'.signed.json';
        $invalidOutputPath = $prefix.'.invalid.signed.json';
        $exampleOutputPaths = [];

        try {
            self::assertNotFalse(file_put_contents(
                $payloadPath,
                json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                LOCK_EX,
            ));
            self::assertNotFalse(file_put_contents($keyPath, $privateKey, LOCK_EX));

            $process = new Process([
                $node,
                base_path('scripts/sign-recovery-attestation.mjs'),
                $payloadPath,
                $keyPath,
                'verifier-v1',
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

            config()->set('disaster_recovery.attestation.active_key_ids', ['verifier-v1']);
            config()->set('disaster_recovery.attestation.verification_keys', [
                'verifier-v1' => 'base64:'.base64_encode((string) $details['key']),
            ]);
            $verifier = app(RecoveryAttestationVerifier::class);

            self::assertSame(
                $verifier->canonicalJson($payload),
                $verifier->canonicalJson($envelope['payload']),
            );
            self::assertTrue($verifier->isActiveKey('verifier-v1'));
            self::assertTrue($verifier->verify(
                $envelope['payload'],
                $envelope['key_id'],
                $envelope['signature'],
            ));

            $envelope['payload']['restorable'] = false;
            self::assertFalse($verifier->verify(
                $envelope['payload'],
                $envelope['key_id'],
                $envelope['signature'],
            ));

            $invalid = $payload;
            unset($invalid['restorable']);
            self::assertNotFalse(file_put_contents(
                $payloadPath,
                json_encode($invalid, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                LOCK_EX,
            ));
            $invalidProcess = new Process([
                $node,
                base_path('scripts/sign-recovery-attestation.mjs'),
                $payloadPath,
                $keyPath,
                'verifier-v1',
                $invalidOutputPath,
            ], base_path(), null, null, 20);
            $invalidProcess->run();

            self::assertFalse($invalidProcess->isSuccessful());
            self::assertStringContainsString(
                'missing or unexpected fields',
                $invalidProcess->getErrorOutput(),
            );
            self::assertFileDoesNotExist($invalidOutputPath);

            foreach ([
                'pitr.payload.example.json',
                'backup.payload.example.json',
                'backup-failure.payload.example.json',
                'restore-drill.payload.example.json',
            ] as $index => $example) {
                $exampleOutput = $prefix.'.example-'.$index.'.signed.json';
                $exampleOutputPaths[] = $exampleOutput;
                $exampleProcess = new Process([
                    $node,
                    base_path('scripts/sign-recovery-attestation.mjs'),
                    base_path('deploy/recovery/'.$example),
                    $keyPath,
                    'verifier-v1',
                    $exampleOutput,
                ], base_path(), null, null, 20);
                $exampleProcess->run();

                self::assertTrue(
                    $exampleProcess->isSuccessful(),
                    $example.': '.trim(
                        $exampleProcess->getErrorOutput() ?: $exampleProcess->getOutput(),
                    ),
                );
                self::assertFileExists($exampleOutput);
            }
        } finally {
            foreach (array_merge([
                $payloadPath,
                $keyPath,
                $outputPath,
                $invalidOutputPath,
            ], $exampleOutputPaths) as $path) {
                if (is_file($path)) {
                    unlink($path);
                }
            }
        }
    }
}
