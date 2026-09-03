<?php

namespace Tests\Unit;

use App\Services\Production\LogReceiptVerifier;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class LogReceiptInteropTest extends TestCase
{
    public function test_external_log_provider_signer_and_php_verifier_share_one_contract(): void
    {
        $node = (new ExecutableFinder)->find('node');
        if ($node === null) {
            self::markTestSkipped('Node.js is unavailable for cross-runtime log-receipt verification.');
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
        self::assertTrue(openssl_pkey_export($key, $privatePem, null, $options));
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);

        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ubsc-log-receipt-'.bin2hex(random_bytes(8));
        $keyPath = $prefix.'.private.pem';
        $outputPath = $prefix.'.receipt.json';
        $operationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
        $sourceHash = hash('sha256', 'provider-retained-canonical-event');

        try {
            self::assertNotFalse(file_put_contents($keyPath, $privatePem, LOCK_EX));
            $process = new Process([
                $node,
                base_path('scripts/publish-log-ingestion-receipt.mjs'),
                $operationId,
                $sourceHash,
                $keyPath,
                'log-sink-v1',
                $outputPath,
            ], base_path(), [
                'UBSC_LOG_RECEIPT_BASE_URL' => 'https://ubsportcenter.co.id',
                'UBSC_LOG_RECEIPT_PROVIDER' => 'managed-log-drain',
                'UBSC_LOG_RECEIPT_ENVIRONMENT' => 'production',
                'UBSC_LOG_RECEIPT_RELEASE' => 'release-2026.08.25-a1b2c3d',
                'UBSC_LOG_RETENTION_DAYS' => '90',
            ], null, 20);
            $process->run();
            self::assertTrue(
                $process->isSuccessful(),
                trim($process->getErrorOutput() ?: $process->getOutput()),
            );

            $document = file_get_contents($outputPath);
            self::assertIsString($document);
            $envelope = json_decode($document, true, 16, JSON_THROW_ON_ERROR);
            self::assertIsArray($envelope);
            config()->set('observability.log_receipts.active_key_ids', ['log-sink-v1']);
            config()->set('observability.log_receipts.verification_keys', [
                'log-sink-v1' => 'base64:'.base64_encode((string) $details['key']),
            ]);
            $verifier = app(LogReceiptVerifier::class);

            self::assertTrue($verifier->hasValidActiveKeyConfiguration());
            self::assertSame($operationId, $envelope['payload']['operation_id']);
            self::assertSame($sourceHash, $envelope['payload']['source_event_sha256']);
            self::assertTrue($verifier->verify(
                $envelope['payload'],
                $envelope['key_id'],
                $envelope['signature'],
            ));

            $envelope['payload']['operation_id'] = 'tampered-operation';
            self::assertFalse($verifier->verify(
                $envelope['payload'],
                $envelope['key_id'],
                $envelope['signature'],
            ));
        } finally {
            foreach ([$keyPath, $outputPath] as $path) {
                if (is_file($path)) {
                    unlink($path);
                }
            }
        }
    }
}
