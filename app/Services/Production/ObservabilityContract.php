<?php

namespace App\Services\Production;

use App\Exceptions\ObservabilityContractViolation;
use Illuminate\Contracts\Config\Repository;

final class ObservabilityContract
{
    public function __construct(
        private readonly Repository $config,
        private readonly ExternalSliKeyring $externalSliKeys,
        private readonly LogReceiptVerifier $logReceipts,
    ) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('observability.enforce', false);
    }

    /** @return array<string, mixed> */
    public function report(): array
    {
        $checks = [];
        $production = strtolower((string) $this->config->get('app.env')) === 'production';
        $enforced = $this->shouldEnforce();

        $this->add(
            $checks,
            'contract.enforcement',
            $enforced ? 'pass' : ($production ? 'fail' : 'warning'),
            $enforced
                ? 'The observability contract is enforced.'
                : 'OBSERVABILITY_CONTRACT_ENFORCE must be true in production.',
        );

        $probeProvider = strtolower(trim((string) $this->config->get(
            'monitoring.external.provider',
            '',
        )));
        $ingestProvider = strtolower(trim((string) $this->config->get(
            'observability.external_sli.provider',
            '',
        )));
        $externalSliValid = (bool) $this->config->get(
            'observability.external_sli.ingest_enabled',
            false,
        )
            && (bool) $this->config->get(
                'observability.signals.external_sli_connected',
                false,
            )
            && $this->externalSliKeys->validKeyIds() !== []
            && (string) $this->config->get(
                'observability.external_sli.metric_key',
                '',
            ) === 'sli.public_availability'
            && preg_match('/^[a-z0-9][a-z0-9_.:-]{0,63}$/', $probeProvider) === 1
            && hash_equals($probeProvider, $ingestProvider);
        $this->add(
            $checks,
            'availability.authenticated_sli_ingest',
            $externalSliValid ? 'pass' : 'fail',
            $externalSliValid
                ? 'External synthetic samples enter the bounded SLO history through a rotatable signed channel.'
                : 'Enable authenticated external SLI ingestion with a non-placeholder 32-byte key ring.',
        );

        $monitoring = (bool) $this->config->get('monitoring.enabled', false);
        $performance = (bool) $this->config->get('performance.enabled', false);
        $this->add(
            $checks,
            'telemetry.bounded_collection',
            $monitoring && $performance ? 'pass' : 'fail',
            $monitoring && $performance
                ? 'Bounded health, throughput, error, latency, and queue telemetry are enabled.'
                : 'MONITORING_ENABLED and PERFORMANCE_METRICS_ENABLED must both be true.',
        );

        $correlation = (bool) $this->config->get(
            'observability.request_correlation.enabled',
            false,
        );
        $acceptIncoming = (bool) $this->config->get(
            'observability.request_correlation.accept_incoming',
            true,
        );
        $header = (string) $this->config->get('observability.request_correlation.header');
        $correlationValid = $correlation
            && ! $acceptIncoming
            && preg_match('/^[A-Za-z][A-Za-z0-9-]{1,63}$/', $header) === 1;
        $this->add(
            $checks,
            'telemetry.request_correlation',
            $correlationValid ? 'pass' : 'fail',
            $correlationValid
                ? 'Every request receives a server-generated correlation identifier.'
                : 'Enable a server-generated request ID and never trust a client value as the trace identity.',
        );

        $stack = (array) $this->config->get('logging.channels.stack.channels', []);
        $requiredChannel = (string) $this->config->get(
            'observability.logs.required_channel',
            'json_stderr',
        );
        $provider = (string) $this->config->get('observability.logs.provider', '');
        $logExportValid = (bool) $this->config->get(
            'observability.logs.off_host_export_enabled',
            false,
        )
            && (bool) $this->config->get('observability.logs.structured_json', false)
            && $provider !== ''
            && ! $this->isPlaceholder($provider)
            && in_array($requiredChannel, $stack, true);
        $this->add(
            $checks,
            'logs.off_host_structured',
            $logExportValid ? 'pass' : 'fail',
            $logExportValid
                ? 'Sanitized JSON logs are declared for off-host export.'
                : 'Enable structured off-host log export and include json_stderr in LOG_STACK.',
        );

        $receiptProvider = strtolower(trim((string) $this->config->get(
            'observability.log_receipts.provider',
            '',
        )));
        $receiptMaximumAge = (int) $this->config->get(
            'observability.log_receipts.maximum_age_seconds',
            0,
        );
        $receiptRetention = (int) $this->config->get(
            'observability.log_receipts.minimum_retention_days',
            0,
        );
        $receiptWait = (int) $this->config->get(
            'observability.log_receipts.wait_seconds',
            0,
        );
        $receiptPoll = (int) $this->config->get(
            'observability.log_receipts.poll_milliseconds',
            0,
        );
        $logReceiptValid = (bool) $this->config->get(
            'observability.log_receipts.enabled',
            false,
        )
            && $receiptProvider !== ''
            && ! $this->isPlaceholder($receiptProvider)
            && hash_equals(strtolower($provider), $receiptProvider)
            && $this->logReceipts->hasValidActiveKeyConfiguration()
            && $receiptMaximumAge >= 60
            && $receiptMaximumAge <= 1_800
            && $receiptRetention >= 30
            && $receiptRetention <= 3_650
            && $receiptWait >= 5
            && $receiptWait <= 120
            && $receiptPoll >= 100
            && $receiptPoll <= 2_000;
        $this->add(
            $checks,
            'logs.provider_signed_receipts',
            $logReceiptValid ? 'pass' : 'fail',
            $logReceiptValid
                ? 'Off-host log ingestion requires current provider-signed, release-bound receipts.'
                : 'Configure bounded provider-signed log receipts with active public verification keys.',
        );

        $externalEnabled = (bool) $this->config->get('monitoring.external.enabled', false);
        $externalUrl = (string) $this->config->get('monitoring.external.check_url', '');
        $externalInterval = (int) $this->config->get(
            'monitoring.external.interval_seconds',
            0,
        );
        $externalValid = $externalEnabled
            && $this->isSafeHttpsUrl($externalUrl)
            && $this->sameOrigin(
                $externalUrl,
                (string) $this->config->get('app.url', ''),
            )
            && $this->requiredExternalPathsAreValid()
            && $externalInterval >= 60
            && $externalInterval <= 300;
        $this->add(
            $checks,
            'availability.independent_probe',
            $externalValid ? 'pass' : 'fail',
            $externalValid
                ? 'An independent HTTPS availability probe runs at a bounded interval.'
                : 'Configure an independent HTTPS readiness probe at least every five minutes.',
        );

        $channels = array_values(array_unique(array_map(
            static fn (mixed $channel): string => strtolower(trim((string) $channel)),
            (array) $this->config->get('monitoring.alerting.channels', []),
        )));
        $webhookUrl = (string) $this->config->get('monitoring.alerting.webhook.url', '');
        $webhookSecret = (string) $this->config->get('monitoring.alerting.webhook.secret', '');
        $alertsValid = in_array('log', $channels, true)
            && in_array('webhook', $channels, true)
            && $this->isSafeOffHostHttpsUrl($webhookUrl)
            && $this->isStrongSecret($webhookSecret);
        $this->add(
            $checks,
            'alerting.off_host_with_fallback',
            $alertsValid ? 'pass' : 'fail',
            $alertsValid
                ? 'Signed off-host incident delivery and a sanitized local fallback are configured.'
                : 'Production alerting requires log and webhook channels, HTTPS, and a 32-byte minimum HMAC secret.',
        );

        $pendingWarning = (int) $this->config->get(
            'observability.alerting.pending_warning',
            0,
        );
        $pendingOutage = (int) $this->config->get(
            'observability.alerting.pending_outage',
            0,
        );
        $oldestWarning = (int) $this->config->get(
            'observability.alerting.oldest_warning_seconds',
            0,
        );
        $oldestOutage = (int) $this->config->get(
            'observability.alerting.oldest_outage_seconds',
            0,
        );
        $dispatcherWarning = (int) $this->config->get(
            'observability.alerting.dispatcher_warning_after_seconds',
            0,
        );
        $dispatcherOutage = (int) $this->config->get(
            'observability.alerting.dispatcher_outage_after_seconds',
            0,
        );
        $offHostWarning = (int) $this->config->get(
            'observability.alerting.off_host_warning_after_seconds',
            90_000,
        );
        $offHostOutage = (int) $this->config->get(
            'observability.alerting.off_host_outage_after_seconds',
            172_800,
        );
        $connectTimeout = (int) $this->config->get(
            'monitoring.alerting.webhook.connect_timeout_seconds',
            2,
        );
        $requestTimeout = (int) $this->config->get(
            'monitoring.alerting.webhook.timeout_seconds',
            5,
        );
        $processingStale = (int) $this->config->get(
            'monitoring.alerting.processing_stale_seconds',
            180,
        );
        $canaryReuse = (int) $this->config->get(
            'observability.alerting.canary_reuse_seconds',
            600,
        );
        $thresholdsValid = $pendingWarning >= 1
            && $pendingWarning < $pendingOutage
            && $pendingOutage <= 10_000
            && $oldestWarning >= 60
            && $oldestWarning < $oldestOutage
            && $oldestOutage <= 21_600
            && $dispatcherWarning >= 60
            && $dispatcherWarning < $dispatcherOutage
            && $dispatcherOutage <= 3_600
            && $offHostWarning >= 3_600
            && $offHostWarning < $offHostOutage
            && $offHostOutage <= 604_800
            && $connectTimeout >= 1
            && $connectTimeout <= 10
            && $requestTimeout > $connectTimeout
            && $requestTimeout <= 30
            && $processingStale >= $requestTimeout + 30
            && $processingStale <= 900
            && $canaryReuse >= 60
            && $canaryReuse <= 900;
        $this->add(
            $checks,
            'alerting.self_monitoring',
            $thresholdsValid ? 'pass' : 'fail',
            $thresholdsValid
                ? 'Alert dispatcher liveness and outbox backlog have ordered warning/outage boundaries.'
                : 'Alert liveness, backlog, off-host proof, HTTP timeout, and processing-lease boundaries must be ordered and bounded.',
        );

        $definitions = collect((array) $this->config->get('monitoring.slos.definitions', []))
            ->filter(static fn (mixed $definition): bool => is_array($definition))
            ->keyBy(static fn (array $definition): string => (string) ($definition['key'] ?? ''));
        $required = [
            'internal_health' => ['source' => 'internal_rollups', 'metric' => null],
            'public_availability' => ['source' => 'external_synthetic', 'metric' => 'sli.public_availability'],
            'booking_success' => ['source' => 'request_sli_rollups', 'metric' => 'sli.booking_success'],
            'request_latency' => ['source' => 'request_sli_rollups', 'metric' => 'sli.request_latency'],
        ];
        $slosValid = true;

        foreach ($required as $key => $requirement) {
            $definition = $definitions->get($key);
            $target = is_array($definition) ? ($definition['target_percent'] ?? null) : null;
            $slosValid = $slosValid
                && is_array($definition)
                && ($definition['source'] ?? null) === $requirement['source']
                && is_numeric($target)
                && (float) $target >= 90
                && (float) $target < 100;

            if ($requirement['metric'] !== null) {
                $metricKey = is_array($definition)
                    ? (string) ($definition['metric_key'] ?? '')
                    : '';
                $slosValid = $slosValid
                    && hash_equals($requirement['metric'], $metricKey);
            }
        }

        $this->add(
            $checks,
            'slo.objectives',
            $slosValid ? 'pass' : 'fail',
            $slosValid
                ? 'Health, public availability, booking success, and request latency have explicit SLI sources and targets.'
                : 'All four production SLOs need a target from 90% up to (but not including) 100% and their approved SLI source.',
        );

        $burn = (array) $this->config->get('observability.slo.burn_rate', []);
        $fastShort = (float) ($burn['fast_short_window'] ?? 0);
        $fastLong = (float) ($burn['fast_long_window'] ?? 0);
        $slowShort = (float) ($burn['slow_short_window'] ?? 0);
        $slowLong = (float) ($burn['slow_long_window'] ?? 0);
        $burnValid = $fastShort > $fastLong
            && $fastLong >= $slowLong
            && $fastShort > $slowShort
            && $slowShort > $slowLong
            && $slowLong >= 1;
        $this->add(
            $checks,
            'slo.burn_rate_boundaries',
            $burnValid ? 'pass' : 'fail',
            $burnValid
                ? 'Fast and sustained error-budget burn boundaries are ordered and bounded.'
                : 'SLO burn-rate boundaries must progress from the strict fast window to the sustained slow window.',
        );

        foreach ([
            'external_sli_connected' => 'External synthetic SLI export',
            'centralized_security_events' => 'Centralized security-event telemetry',
            'apm_connected' => 'Off-host APM/tracing',
        ] as $key => $label) {
            $connected = (bool) $this->config->get("observability.signals.{$key}", false);
            $this->add(
                $checks,
                'signals.'.$key,
                $connected ? 'pass' : 'warning',
                $connected
                    ? "{$label} is declared connected."
                    : "{$label} is not yet declared connected.",
            );
        }

        return $this->summarize($checks);
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();

        if (! $report['valid']) {
            throw ObservabilityContractViolation::fromCodes(
                $this->codesWithStatus($report, 'fail'),
            );
        }
    }

    private function isSafeHttpsUrl(string $url): bool
    {
        $parts = parse_url($url);

        return is_array($parts)
            && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
            && trim((string) ($parts['host'] ?? '')) !== ''
            && ! isset($parts['user'], $parts['pass']);
    }

    private function sameOrigin(string $left, string $right): bool
    {
        $leftParts = parse_url($left);
        $rightParts = parse_url($right);
        if (! is_array($leftParts)
            || ! is_array($rightParts)
            || ! $this->isSafeHttpsUrl($left)
            || ! $this->isSafeHttpsUrl($right)) {
            return false;
        }

        $leftPort = isset($leftParts['port']) ? (int) $leftParts['port'] : 443;
        $rightPort = isset($rightParts['port']) ? (int) $rightParts['port'] : 443;

        return hash_equals(
            strtolower((string) $leftParts['host']),
            strtolower((string) $rightParts['host']),
        ) && $leftPort === $rightPort;
    }

    private function requiredExternalPathsAreValid(): bool
    {
        $paths = $this->config->get('monitoring.external.required_paths', []);
        if (! is_array($paths)
            || $paths === []
            || ! collect($paths)->every(
                static fn (mixed $path): bool => is_string($path)
                    && preg_match('/^\/[A-Za-z0-9._~!$&\'()*+,;=:@%\/-]{0,255}$/', $path) === 1,
            )
            || count($paths) !== count(array_unique($paths))) {
            return false;
        }

        return collect(['/up', '/health/ready', '/'])->every(
            static fn (string $path): bool => in_array($path, $paths, true),
        );
    }

    private function isSafeOffHostHttpsUrl(string $url): bool
    {
        if (! $this->isSafeHttpsUrl($url)) {
            return false;
        }

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $applicationHost = strtolower((string) parse_url(
            (string) $this->config->get('app.url', ''),
            PHP_URL_HOST,
        ));
        if ($host === 'localhost'
            || str_ends_with($host, '.localhost')
            || ($applicationHost !== '' && hash_equals($applicationHost, $host))) {
            return false;
        }
        if (filter_var($host, FILTER_VALIDATE_IP) !== false
            && filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            ) === false) {
            return false;
        }

        return true;
    }

    private function isStrongSecret(string $value): bool
    {
        return strlen($value) >= 32
            && preg_match('/replace|example|placeholder|secret-manager/i', $value) !== 1
            && count(array_unique(unpack('C*', $value) ?: [])) >= 8;
    }

    private function isPlaceholder(string $value): bool
    {
        return preg_match('/replace|example|placeholder|unknown/i', $value) === 1;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function summarize(array $checks): array
    {
        $failures = count(array_filter($checks, fn (array $check): bool => $check['status'] === 'fail'));
        $warnings = count(array_filter($checks, fn (array $check): bool => $check['status'] === 'warning'));

        return [
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => array_values($checks),
        ];
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }

    /** @return list<string> */
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
