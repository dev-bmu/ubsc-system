<?php

namespace Tests\Unit;

use App\Exceptions\ObservabilityContractViolation;
use App\Services\Production\ExternalSliKeyring;
use App\Services\Production\LogReceiptVerifier;
use App\Services\Production\ObservabilityContract;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class ObservabilityContractTest extends TestCase
{
    private static ?string $logReceiptPublicKey = null;

    public function test_complete_observability_contract_is_strictly_valid(): void
    {
        $report = $this->contract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_request_ids_must_be_server_generated_and_structured_logs_off_host(): void
    {
        $configuration = $this->configuration();
        $configuration['observability']['request_correlation']['accept_incoming'] = true;
        $configuration['logging']['channels']['stack']['channels'] = ['daily'];
        $configuration['observability']['logs']['provider'] = 'replace-with-provider';

        $report = $this->contract($configuration)->report();

        self::assertContains('telemetry.request_correlation', $this->failedCodes($report));
        self::assertContains('logs.off_host_structured', $this->failedCodes($report));
    }

    public function test_log_export_requires_provider_signed_receipts_from_the_same_provider(): void
    {
        $configuration = $this->configuration();
        $configuration['observability']['log_receipts']['provider'] = 'another-provider';
        $configuration['observability']['log_receipts']['verification_keys'] = [];

        $report = $this->contract($configuration)->report();

        self::assertContains('logs.provider_signed_receipts', $this->failedCodes($report));
    }

    public function test_alerting_requires_signed_https_off_host_delivery_and_local_fallback(): void
    {
        $configuration = $this->configuration();
        $configuration['monitoring']['alerting']['channels'] = ['webhook'];
        $configuration['monitoring']['alerting']['webhook']['url'] = 'http://alerts.internal/events';
        $configuration['monitoring']['alerting']['webhook']['secret'] = 'short';

        $report = $this->contract($configuration)->report();

        self::assertContains('alerting.off_host_with_fallback', $this->failedCodes($report));
        $this->expectException(ObservabilityContractViolation::class);
        $this->contract($configuration)->assertSatisfied();
    }

    public function test_alert_dispatcher_thresholds_and_burn_boundaries_must_be_ordered(): void
    {
        $configuration = $this->configuration();
        $configuration['observability']['alerting']['pending_warning'] = 100;
        $configuration['observability']['alerting']['pending_outage'] = 25;
        $configuration['observability']['slo']['burn_rate']['fast_short_window'] = 2;
        $configuration['observability']['slo']['burn_rate']['fast_long_window'] = 6;

        $report = $this->contract($configuration)->report();

        self::assertContains('alerting.self_monitoring', $this->failedCodes($report));
        self::assertContains('slo.burn_rate_boundaries', $this->failedCodes($report));
    }

    public function test_alert_secrets_destinations_and_liveness_windows_cannot_only_look_configured(): void
    {
        $configuration = $this->configuration();
        $configuration['monitoring']['alerting']['webhook']['url'] = 'https://ubsportcenter.co.id/alerts';
        $configuration['monitoring']['alerting']['webhook']['secret'] = str_repeat('x', 40);
        $configuration['observability']['alerting']['dispatcher_outage_after_seconds'] = 86_400;
        $configuration['observability']['alerting']['canary_reuse_seconds'] = 3_600;

        $report = $this->contract($configuration)->report();

        self::assertContains('alerting.off_host_with_fallback', $this->failedCodes($report));
        self::assertContains('alerting.self_monitoring', $this->failedCodes($report));
    }

    public function test_external_sli_declaration_requires_authenticated_ingestion_and_metric_binding(): void
    {
        $configuration = $this->configuration();
        $configuration['observability']['external_sli']['signing_keys']['v1'] = str_repeat('x', 40);
        $configuration['monitoring']['slos']['definitions'][1]['metric_key'] = 'sli.wrong';

        $report = $this->contract($configuration)->report();

        self::assertContains('availability.authenticated_sli_ingest', $this->failedCodes($report));
        self::assertContains('slo.objectives', $this->failedCodes($report));
    }

    public function test_external_probe_must_monitor_the_application_origin_and_required_paths(): void
    {
        $configuration = $this->configuration();
        $configuration['monitoring']['external']['check_url'] = 'https://status.example.test/health/ready';
        $configuration['monitoring']['external']['required_paths'] = ['/health/ready'];

        $report = $this->contract($configuration)->report();

        self::assertContains('availability.independent_probe', $this->failedCodes($report));
    }

    public function test_a_hundred_percent_slo_is_rejected_as_an_unusable_error_budget(): void
    {
        $configuration = $this->configuration();
        $configuration['monitoring']['slos']['definitions'][0]['target_percent'] = 100;

        $report = $this->contract($configuration)->report();

        self::assertContains('slo.objectives', $this->failedCodes($report));
    }

    public function test_advanced_off_host_signals_are_strict_recommendations(): void
    {
        $configuration = $this->configuration();
        $configuration['observability']['signals']['apm_connected'] = false;

        $report = $this->contract($configuration)->report();

        self::assertTrue($report['valid']);
        self::assertFalse($report['strict_valid']);
        self::assertContains('signals.apm_connected', $this->warningCodes($report));
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): ObservabilityContract
    {
        $repository = new Repository($configuration ?? $this->configuration());

        return new ObservabilityContract(
            $repository,
            new ExternalSliKeyring($repository),
            new LogReceiptVerifier($repository),
        );
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        return [
            'app' => [
                'env' => 'production',
                'url' => 'https://ubsportcenter.co.id',
            ],
            'performance' => ['enabled' => true],
            'logging' => [
                'channels' => [
                    'stack' => ['channels' => ['daily', 'json_stderr']],
                ],
            ],
            'monitoring' => [
                'enabled' => true,
                'external' => [
                    'enabled' => true,
                    'provider' => 'github-actions',
                    'check_url' => 'https://ubsportcenter.co.id/health/ready',
                    'interval_seconds' => 300,
                    'required_paths' => ['/up', '/health/ready', '/'],
                ],
                'alerting' => [
                    'channels' => ['log', 'webhook'],
                    'webhook' => [
                        'url' => 'https://alerts.operations.example/events',
                        'secret' => 'monitoring-webhook-signing-key-2026-v1',
                        'connect_timeout_seconds' => 2,
                        'timeout_seconds' => 5,
                    ],
                    'processing_stale_seconds' => 180,
                ],
                'slos' => [
                    'definitions' => [
                        $this->slo('internal_health', 'internal_rollups', 99.9),
                        $this->slo('public_availability', 'external_synthetic', 99.9),
                        $this->slo('booking_success', 'request_sli_rollups', 99.9),
                        $this->slo('request_latency', 'request_sli_rollups', 99.0),
                    ],
                ],
            ],
            'observability' => [
                'enforce' => true,
                'request_correlation' => [
                    'enabled' => true,
                    'accept_incoming' => false,
                    'header' => 'X-Request-ID',
                ],
                'logs' => [
                    'off_host_export_enabled' => true,
                    'provider' => 'managed-log-drain',
                    'structured_json' => true,
                    'required_channel' => 'json_stderr',
                ],
                'log_receipts' => [
                    'enabled' => true,
                    'provider' => 'managed-log-drain',
                    'active_key_ids' => ['log-sink-v1'],
                    'verification_keys' => [
                        'log-sink-v1' => self::logReceiptPublicKey(),
                    ],
                    'maximum_age_seconds' => 600,
                    'minimum_retention_days' => 90,
                    'wait_seconds' => 60,
                    'poll_milliseconds' => 500,
                ],
                'signals' => [
                    'external_sli_connected' => true,
                    'centralized_security_events' => true,
                    'apm_connected' => true,
                ],
                'external_sli' => [
                    'ingest_enabled' => true,
                    'provider' => 'github-actions',
                    'metric_key' => 'sli.public_availability',
                    'minimum_key_bytes' => 32,
                    'signing_keys' => [
                        'v1' => 'external-synthetic-signing-key-2026-v1',
                    ],
                ],
                'alerting' => [
                    'pending_warning' => 25,
                    'pending_outage' => 100,
                    'oldest_warning_seconds' => 300,
                    'oldest_outage_seconds' => 900,
                    'dispatcher_warning_after_seconds' => 180,
                    'dispatcher_outage_after_seconds' => 600,
                    'canary_reuse_seconds' => 600,
                    'off_host_warning_after_seconds' => 90_000,
                    'off_host_outage_after_seconds' => 172_800,
                ],
                'slo' => [
                    'burn_rate' => [
                        'fast_short_window' => 14.4,
                        'fast_long_window' => 6.0,
                        'slow_short_window' => 6.0,
                        'slow_long_window' => 3.0,
                    ],
                ],
            ],
        ];
    }

    private static function logReceiptPublicKey(): string
    {
        if (self::$logReceiptPublicKey !== null) {
            return self::$logReceiptPublicKey;
        }

        $options = [
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
            'private_key_bits' => 2048,
        ];
        $windowsConfig = 'C:/xampp/php/extras/ssl/openssl.cnf';
        if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsConfig)) {
            $options['config'] = $windowsConfig;
        }
        $privateKey = openssl_pkey_new($options);
        self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $privateKey);
        $details = openssl_pkey_get_details($privateKey);
        self::assertIsArray($details);
        self::assertIsString($details['key'] ?? null);

        return self::$logReceiptPublicKey = $details['key'];
    }

    /** @return array<string, mixed> */
    private function slo(string $key, string $source, float $target): array
    {
        $metric = match ($source) {
            'external_synthetic' => ['metric_key' => 'sli.public_availability'],
            'request_sli_rollups' => ['metric_key' => 'sli.'.$key],
            default => [],
        };

        return compact('key', 'source') + $metric + ['target_percent' => $target];
    }

    /** @param array{checks:list<array{code:string,status:string,message:string}>} $report */
    private function failedCodes(array $report): array
    {
        return $this->codes($report, 'fail');
    }

    /** @param array{checks:list<array{code:string,status:string,message:string}>} $report */
    private function warningCodes(array $report): array
    {
        return $this->codes($report, 'warning');
    }

    /** @return list<string> */
    private function codes(array $report, string $status): array
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
