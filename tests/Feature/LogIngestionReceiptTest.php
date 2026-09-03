<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Models\MonitoringLogReceipt;
use App\Services\Monitoring\LogExportReceiptStatus;
use App\Services\Production\LogReceiptVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use LogicException;
use RuntimeException;
use Tests\TestCase;

final class LogIngestionReceiptTest extends TestCase
{
    use RefreshDatabase;

    private \OpenSSLAsymmetricKey $privateKey;

    private string $privatePem;

    protected function setUp(): void
    {
        parent::setUp();

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-25T10:00:00Z'));
        $options = [
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
            'private_key_bits' => 2048,
        ];
        $windowsConfig = 'C:/xampp/php/extras/ssl/openssl.cnf';
        if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsConfig)) {
            $options['config'] = $windowsConfig;
        }
        $key = openssl_pkey_new($options);
        self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $key);
        $this->privateKey = $key;
        $privatePem = '';
        self::assertTrue(openssl_pkey_export($key, $privatePem, null, $options));
        $this->privatePem = $privatePem;
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);
        self::assertIsString($details['key'] ?? null);

        config()->set('app.env', 'production');
        config()->set('monitoring.release', 'release-2026.08.25-a1b2c3d');
        config()->set('observability.log_receipts', [
            'enabled' => true,
            'provider' => 'managed-log-drain',
            'active_key_ids' => ['log-sink-v1'],
            'verification_keys' => ['log-sink-v1' => $details['key']],
            'maximum_envelope_bytes' => 32_768,
            'maximum_age_seconds' => 600,
            'maximum_clock_skew_seconds' => 120,
            'minimum_retention_days' => 90,
            'wait_seconds' => 5,
            'poll_milliseconds' => 100,
            'warning_after_seconds' => 90_000,
            'outage_after_seconds' => 172_800,
            'heartbeat_key' => 'monitoring-log-export-receipt',
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();

        parent::tearDown();
    }

    public function test_provider_signed_receipt_is_idempotent_append_only_and_operation_bound(): void
    {
        $operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        $envelope = $this->envelope($operationId);

        $this->postJson('/monitoring/log-receipts', $envelope)
            ->assertAccepted()
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private')
            ->assertExactJson(['accepted' => true, 'duplicate' => false]);
        $this->postJson('/monitoring/log-receipts', $envelope)
            ->assertOk()
            ->assertExactJson(['accepted' => true, 'duplicate' => true]);

        $this->assertDatabaseCount('monitoring_log_receipts', 1);
        self::assertSame(0, Artisan::call('monitoring:logs:await-receipt', [
            'operation-id' => $operationId,
            '--wait' => 5,
            '--poll-ms' => 100,
            '--quiet' => true,
        ]));
        self::assertSame(
            MonitoringStatus::Operational->value,
            MonitoringHeartbeat::query()->findOrFail(
                'monitoring-log-export-receipt',
            )->status,
        );
        self::assertSame(
            MonitoringStatus::Operational->value,
            app(LogExportReceiptStatus::class)->summary()['status'],
        );

        $conflict = $this->payload($operationId);
        $conflict['receipt_id'] = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        $conflict['source_event_sha256'] = hash('sha256', 'different-retained-event');
        $this->postJson('/monitoring/log-receipts', $this->sign($conflict))
            ->assertUnauthorized();

        $receipt = MonitoringLogReceipt::query()->sole();
        try {
            $receipt->forceFill(['provider' => 'tampered'])->save();
            self::fail('Append-only log receipt was mutated.');
        } catch (LogicException) {
            self::assertSame('managed-log-drain', $receipt->refresh()->provider);
        }
    }

    public function test_invalid_stale_private_key_and_tampered_receipts_fail_closed(): void
    {
        $operationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        $invalidSignature = $this->envelope($operationId);
        $invalidSignature['signature'] = base64_encode('not-a-signature');
        $this->postJson('/monitoring/log-receipts', $invalidSignature)
            ->assertUnauthorized();

        $stale = $this->payload($operationId);
        $stale['ingested_at'] = now('UTC')->subMinutes(11)->toIso8601String();
        $stale['retention_until'] = now('UTC')->subMinutes(11)->addDays(90)->toIso8601String();
        $this->postJson('/monitoring/log-receipts', $this->sign($stale))
            ->assertUnauthorized();

        config()->set('observability.log_receipts.verification_keys', [
            'log-sink-v1' => $this->privatePem,
        ]);
        self::assertFalse(app(LogReceiptVerifier::class)->hasValidActiveKeyConfiguration());
        $this->postJson('/monitoring/log-receipts', $this->envelope($operationId))
            ->assertUnauthorized();
        $this->assertDatabaseCount('monitoring_log_receipts', 0);
    }

    public function test_latest_invalid_receipt_or_expired_runtime_evidence_never_falls_back_green(): void
    {
        $operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        $this->postJson('/monitoring/log-receipts', $this->envelope($operationId))
            ->assertAccepted();

        CarbonImmutable::setTestNow(now('UTC')->addSeconds(90_001));
        self::assertSame(
            MonitoringStatus::Degraded->value,
            app(LogExportReceiptStatus::class)->summary()['status'],
        );
        CarbonImmutable::setTestNow(now('UTC')->addSeconds(82_800));
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(LogExportReceiptStatus::class)->summary()['status'],
        );

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-25T10:00:30Z'));
        DB::table('monitoring_log_receipts')->where('operation_id', $operationId)->update([
            'source_event_sha256' => hash('sha256', 'tampered'),
        ]);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(LogExportReceiptStatus::class)->summary()['status'],
        );
        self::assertSame(1, Artisan::call('monitoring:logs:await-receipt', [
            'operation-id' => $operationId,
            '--wait' => 5,
            '--poll-ms' => 100,
            '--quiet' => true,
        ]));
    }

    public function test_receipt_migration_refuses_destructive_rollback_with_evidence(): void
    {
        $this->postJson(
            '/monitoring/log-receipts',
            $this->envelope('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
        )->assertAccepted();

        $migration = require database_path(
            'migrations/2026_08_25_000001_create_monitoring_log_receipts.php',
        );
        $this->expectException(RuntimeException::class);
        $migration->down();
    }

    public function test_transport_rejects_oversized_or_non_json_evidence_before_verification(): void
    {
        $this->call(
            'POST',
            '/monitoring/log-receipts',
            server: [
                'CONTENT_TYPE' => 'application/json',
                'CONTENT_LENGTH' => '32769',
            ],
            content: '{}',
        )->assertStatus(413)
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private');

        $this->post('/monitoring/log-receipts', ['value' => 'not-json'])
            ->assertStatus(415)
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private');
    }

    /** @return array<string, mixed> */
    private function envelope(string $operationId): array
    {
        return $this->sign($this->payload($operationId));
    }

    /** @return array<string, mixed> */
    private function payload(string $operationId): array
    {
        return [
            'schema_version' => 1,
            'receipt_id' => '11111111-1111-4111-8111-111111111111',
            'operation_id' => $operationId,
            'event' => 'observability.canary',
            'provider' => 'managed-log-drain',
            'environment' => 'production',
            'release' => 'release-2026.08.25-a1b2c3d',
            'ingested_at' => now('UTC')->toIso8601String(),
            'retention_until' => now('UTC')->addDays(90)->toIso8601String(),
            'source_event_sha256' => hash('sha256', 'retained-canonical-log-event'),
        ];
    }

    /** @param array<string, mixed> $payload */
    private function sign(array $payload): array
    {
        $signature = '';
        self::assertTrue(openssl_sign(
            app(LogReceiptVerifier::class)->canonicalJson($payload),
            $signature,
            $this->privateKey,
            OPENSSL_ALGO_SHA256,
        ));

        return [
            'schema_version' => 1,
            'key_id' => 'log-sink-v1',
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }
}
