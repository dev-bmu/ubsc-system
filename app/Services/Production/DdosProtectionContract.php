<?php

namespace App\Services\Production;

use App\Exceptions\DdosProtectionContractViolation;
use App\Support\TrustedProxyPolicy;
use Illuminate\Contracts\Config\Repository;

final class DdosProtectionContract
{
    public function __construct(private readonly Repository $config) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('ddos_protection.enforce', false);
    }

    /**
     * @return array{
     *   valid:bool,
     *   strict_valid:bool,
     *   failures:int,
     *   warnings:int,
     *   checks:list<array{code:string,status:string,message:string}>
     * }
     */
    public function report(): array
    {
        $checks = [];
        $production = (string) $this->config->get('app.env', 'production') === 'production';
        $enforced = $this->shouldEnforce();

        $this->add(
            $checks,
            'contract.enforcement',
            $enforced ? 'pass' : ($production ? 'fail' : 'warning'),
            $enforced
                ? 'The layered DDoS protection contract is enforced.'
                : ($production
                    ? 'DDOS_PROTECTION_CONTRACT_ENFORCE must be enabled in production.'
                    : 'DDoS contract enforcement is intentionally disabled outside production.'),
        );

        $applicationEnabled = (bool) $this->config->get(
            'ddos_protection.application.enabled',
            false,
        );
        $envelopeEnabled = (bool) $this->config->get(
            'ddos_protection.application.resource_envelope.enabled',
            false,
        );
        $this->add(
            $checks,
            'application.early_rejection',
            $applicationEnabled && $envelopeEnabled ? 'pass' : 'fail',
            $applicationEnabled && $envelopeEnabled
                ? 'Application traffic limits and a pre-session request resource envelope are enabled.'
                : 'Enable application traffic protection and the request resource envelope.',
        );

        $limiterStore = (string) $this->config->get('cache.limiter', '');
        $limiterDriver = (string) $this->config->get("cache.stores.{$limiterStore}.driver", '');
        $limiterConnection = (string) $this->config->get(
            "cache.stores.{$limiterStore}.connection",
            '',
        );
        $otherConnections = array_filter([
            (string) $this->config->get(
                'cache.stores.'.(string) $this->config->get('cache.default').'.connection',
                '',
            ),
            (string) ($this->config->get('session.connection') ?: ''),
            (string) $this->config->get(
                'cache.stores.'.(string) $this->config->get('cache.default').'.lock_connection',
                '',
            ),
            (string) $this->config->get(
                'queue.connections.'.(string) $this->config->get('queue.default').'.connection',
                '',
            ),
        ]);
        $isolatedLimiter = $limiterStore === 'traffic'
            && $limiterDriver === 'redis'
            && $limiterConnection === 'traffic'
            && ! in_array($limiterConnection, $otherConnections, true);
        $this->add(
            $checks,
            'application.isolated_limiter_state',
            $isolatedLimiter ? 'pass' : 'fail',
            $isolatedLimiter
                ? 'High-cardinality limiter state uses its own Redis workload endpoint.'
                : 'CACHE_LIMITER_STORE must resolve to the isolated Redis traffic connection.',
        );

        $rps = (int) $this->config->get(
            'ddos_protection.application.limits.web.per_ip_per_second',
            0,
        );
        $rpm = (int) $this->config->get(
            'ddos_protection.application.limits.web.per_ip_per_minute',
            0,
        );
        $networkRpm = (int) $this->config->get(
            'ddos_protection.application.limits.web.per_network_per_minute',
            0,
        );
        $globalRps = (int) $this->config->get(
            'ddos_protection.application.limits.web.global_per_second',
            0,
        );
        $globalRpm = (int) $this->config->get(
            'ddos_protection.application.limits.web.global_per_minute',
            0,
        );
        $limitsSafe = $rps >= 10 && $rps <= 500
            && $rpm >= ($rps * 10) && $rpm <= 20_000
            && $networkRpm >= ($rpm * 5) && $networkRpm <= 100_000
            && $globalRps >= ($rps * 10) && $globalRps <= 10_000
            && $globalRpm >= ($globalRps * 20) && $globalRpm <= 300_000
            && $networkRpm <= $globalRpm;
        $this->add(
            $checks,
            'application.layered_limits',
            $limitsSafe ? 'pass' : 'fail',
            $limitsSafe
                ? 'Per-client, network-prefix, and global overload limits preserve legitimate bursts while bounding abuse.'
                : 'Configure bounded per-IP, network-prefix, and global traffic limits with a safe burst-to-sustained ratio.',
        );

        $targetBytes = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_request_target_bytes',
            0,
        );
        $headerBytes = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_header_bytes',
            0,
        );
        $bodyBytes = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.default_body_bytes',
            0,
        );
        $queryBytes = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_query_bytes',
            0,
        );
        $queryParameters = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_query_parameters',
            0,
        );
        $queryDepth = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_query_depth',
            0,
        );
        $headerCount = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_header_count',
            0,
        );
        $cookieBytes = (int) $this->config->get(
            'ddos_protection.application.resource_envelope.maximum_cookie_bytes',
            0,
        );
        $routeBodies = (array) $this->config->get(
            'ddos_protection.application.resource_envelope.route_body_bytes',
            [],
        );
        $requiredUploadRoutes = [
            'profile.update',
            'admin.gallery.upload-sessions.chunks.store',
            'admin.gallery.items.store',
            'admin.facilities.store',
            'admin.facilities.update',
            'admin.facilities.gallery.add',
            'admin.news.store',
            'admin.news.update',
            'admin.reels.store',
            'admin.reels.update',
            'admin.*',
        ];
        $uploadRoutesAreBounded = collect($requiredUploadRoutes)->every(
            static fn (string $route): bool => is_int($routeBodies[$route] ?? null)
                && $routeBodies[$route] >= 262_144
                && $routeBodies[$route] <= 272_629_760,
        )
            && ($routeBodies['profile.update'] ?? PHP_INT_MAX) <= 8_388_608
            && ($routeBodies['admin.gallery.upload-sessions.chunks.store'] ?? PHP_INT_MAX) <= 8_388_608
            && ($routeBodies['admin.gallery.items.store'] ?? PHP_INT_MAX) <= 25_165_824
            && is_int($routeBodies['monitoring.external-sli.ingest'] ?? null)
            && $routeBodies['monitoring.external-sli.ingest'] >= 1_024
            && $routeBodies['monitoring.external-sli.ingest'] <= 16_384
            && is_int($routeBodies['monitoring.log-receipts.ingest'] ?? null)
            && $routeBodies['monitoring.log-receipts.ingest'] >= 1_024
            && $routeBodies['monitoring.log-receipts.ingest'] <= 32_768
            && ($routeBodies['admin.*'] ?? PHP_INT_MAX) <= 16_777_216;
        $envelopeSafe = $targetBytes >= 1_024 && $targetBytes <= 8_192
            && $queryBytes >= 512 && $queryBytes <= 4_096
            && $queryParameters >= 20 && $queryParameters <= 200
            && $queryDepth >= 3 && $queryDepth <= 10
            && $headerCount >= 32 && $headerCount <= 128
            && $headerBytes >= 8_192 && $headerBytes <= 65_536
            && $cookieBytes >= 2_048 && $cookieBytes <= 16_384
            && $bodyBytes >= 262_144 && $bodyBytes <= 4_194_304
            && $uploadRoutesAreBounded;
        $this->add(
            $checks,
            'application.resource_bounds',
            $envelopeSafe ? 'pass' : 'fail',
            $envelopeSafe
                ? 'Default request-target, header, query, cookie, and body allocation is explicitly bounded.'
                : 'Keep the default dynamic request envelope small; grant larger bodies only to named upload routes.',
        );

        $edgeProvider = (string) $this->config->get('deployment.edge.provider', '');
        $managedEdge = $this->validIdentity($edgeProvider)
            && (bool) $this->config->get('deployment.edge.managed_dns', false)
            && (bool) $this->config->get('deployment.edge.cdn_enabled', false)
            && (bool) $this->config->get('deployment.edge.waf_enabled', false)
            && (bool) $this->config->get('deployment.edge.ddos_protection', false);
        $this->add(
            $checks,
            'edge.managed_provider',
            $managedEdge ? 'pass' : 'fail',
            $managedEdge
                ? "Managed edge provider [{$edgeProvider}] owns DNS, CDN, WAF, and DDoS filtering."
                : 'A named managed DNS/CDN/WAF/DDoS provider is mandatory.',
        );

        $networkMitigation = (bool) $this->config->get('ddos_protection.edge.always_on', false)
            && (bool) $this->config->get('ddos_protection.edge.anycast_or_global_scrubbing', false)
            && (bool) $this->config->get('ddos_protection.edge.automatic_l3_l4_mitigation', false)
            && (bool) $this->config->get('ddos_protection.edge.automatic_l7_mitigation', false);
        $this->add(
            $checks,
            'edge.automatic_mitigation',
            $networkMitigation ? 'pass' : 'fail',
            $networkMitigation
                ? 'Always-on global scrubbing automatically mitigates network, protocol, and HTTP floods.'
                : 'Require always-on global scrubbing with automatic L3/L4 and L7 mitigation.',
        );

        $applicationEdge = (bool) $this->config->get('ddos_protection.edge.managed_waf_rules', false)
            && (bool) $this->config->get('ddos_protection.edge.adaptive_rate_limiting', false)
            && (bool) $this->config->get('ddos_protection.edge.bot_management', false)
            && (bool) $this->config->get('ddos_protection.edge.static_asset_caching', false)
            && (bool) $this->config->get('ddos_protection.edge.private_html_cache_bypass', false);
        $this->add(
            $checks,
            'edge.application_controls',
            $applicationEdge ? 'pass' : 'fail',
            $applicationEdge
                ? 'Managed rules, adaptive limits, bot controls, safe static caching, and private HTML bypass are declared.'
                : 'Enable managed WAF rules, adaptive limits, bot controls, and safe cache separation.',
        );

        $originMode = (string) $this->config->get(
            'ddos_protection.origin.authentication_mode',
            '',
        );
        $allowedOriginModes = (array) $this->config->get(
            'ddos_protection.origin.allowed_authentication_modes',
            [],
        );
        $originIsolated = (bool) $this->config->get('deployment.edge.origin_access_restricted', false)
            && (bool) $this->config->get('ddos_protection.origin.public_direct_access_disabled', false)
            && (bool) $this->config->get('ddos_protection.origin.public_dns_disclosure_prevented', false)
            && in_array($originMode, $allowedOriginModes, true);
        $this->add(
            $checks,
            'origin.no_bypass',
            $originIsolated ? 'pass' : 'fail',
            $originIsolated
                ? "Direct public origin bypass is disabled using [{$originMode}] authentication."
                : 'Hide and firewall the origin, then authenticate edge-to-origin traffic over a private network, mTLS, or provider pull.',
        );

        $clientHeader = (string) $this->config->get(
            'ddos_protection.client_identity.provider_header',
            '',
        );
        $trustedProxies = array_values(array_filter(array_map(
            'trim',
            explode(',', (string) $this->config->get('security.trusted_proxies', '')),
        )));
        $clientIdentitySafe = $this->validDedicatedHeader($clientHeader)
            && (bool) $this->config->get('ddos_protection.client_identity.edge_strips_spoofed_headers', false)
            && (bool) $this->config->get('ddos_protection.client_identity.load_balancer_replaces_forwarded_for', false)
            && (string) $this->config->get('high_availability.load_balancer.forwarded_for_mode', '') === 'replace'
            && $trustedProxies !== []
            && collect($trustedProxies)->every(fn (string $proxy): bool => TrustedProxyPolicy::allows($proxy));
        $this->add(
            $checks,
            'origin.authenticated_client_identity',
            $clientIdentitySafe ? 'pass' : 'fail',
            $clientIdentitySafe
                ? 'The edge strips spoofed identity headers and the trusted load balancer emits one canonical client IP.'
                : 'Use one dedicated edge-set client-IP header, replace X-Forwarded-For, and trust only bounded proxy CIDRs.',
        );

        $telemetry = (bool) $this->config->get('ddos_protection.telemetry.security_event_stream', false)
            && (bool) $this->config->get('ddos_protection.telemetry.attack_alerting', false)
            && (bool) $this->config->get('ddos_protection.telemetry.origin_saturation_alerting', false)
            && (bool) $this->config->get('ddos_protection.telemetry.cost_anomaly_alerting', false)
            && (bool) $this->config->get('observability.signals.centralized_security_events', false);
        $this->add(
            $checks,
            'telemetry.attack_visibility',
            $telemetry ? 'pass' : 'fail',
            $telemetry
                ? 'Edge security events, attack alerts, origin saturation, and cost anomalies feed off-host monitoring.'
                : 'Stream edge security events and alert on attacks, saturation, and cost anomalies.',
        );

        $runbook = (string) $this->config->get('ddos_protection.operations.runbook', '');
        $responseSeconds = (int) $this->config->get(
            'ddos_protection.operations.maximum_provider_response_seconds',
            0,
        );
        $exerciseDays = (int) $this->config->get(
            'ddos_protection.operations.exercise_interval_days',
            0,
        );
        $operationsReady = (bool) $this->config->get('ddos_protection.operations.emergency_mode', false)
            && (bool) $this->config->get('ddos_protection.operations.provider_escalation', false)
            && $this->safeRunbook($runbook)
            && $responseSeconds > 0 && $responseSeconds <= 900
            && $exerciseDays > 0 && $exerciseDays <= 90;
        $this->add(
            $checks,
            'operations.response_readiness',
            $operationsReady ? 'pass' : 'fail',
            $operationsReady
                ? 'Emergency mode, provider escalation, a bounded response SLA, and quarterly exercises are required.'
                : 'Configure emergency mode, a provider escalation path, a tracked runbook, a <=15 minute response SLA, and exercises at least quarterly.',
        );

        $verificationMode = (string) $this->config->get(
            'ddos_protection.verification.mode',
            '',
        );
        $verificationHook = (string) $this->config->get(
            'ddos_protection.verification.provider_hook',
            '',
        );
        $responseHeader = (string) $this->config->get(
            'ddos_protection.verification.edge_response_header',
            '',
        );
        $zoneFingerprint = (string) $this->config->get(
            'ddos_protection.verification.provider_zone_fingerprint',
            '',
        );
        $publicOrigin = $this->configuredPublicOrigin();
        $canonicalOrigin = $this->httpsOrigin((string) $this->config->get(
            'seo.canonical_origin',
            '',
        ));
        $liveVerification = $verificationMode === 'provider_api'
            && $this->safeAbsoluteHook($verificationHook)
            && $this->validHeader($responseHeader)
            && $this->validSha256Fingerprint($zoneFingerprint)
            && $publicOrigin !== null
            && $canonicalOrigin !== null
            && hash_equals($publicOrigin, $canonicalOrigin);
        $this->add(
            $checks,
            'verification.provider_state',
            $liveVerification ? 'pass' : 'fail',
            $liveVerification
                ? "Release acceptance binds fresh provider-API evidence to [{$publicOrigin}], its exact provider zone, and an observable edge marker."
                : 'Use provider_api verification, matching canonical HTTPS APP_URL/SEO origins, a trusted hook, the exact provider-zone fingerprint, and a real edge response marker.',
        );

        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $warnings = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'warning',
        ));

        return [
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => $checks,
        ];
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();

        if ($report['valid']) {
            return;
        }

        throw DdosProtectionContractViolation::fromCodes(array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        )));
    }

    public function configuredPublicOrigin(): ?string
    {
        return $this->httpsOrigin((string) $this->config->get('app.url', ''));
    }

    private function httpsOrigin(string $value): ?string
    {
        $value = trim($value);
        if ($value === '' || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $parts = parse_url($value);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || trim((string) ($parts['host'] ?? '')) === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || (isset($parts['port']) && ((int) $parts['port'] < 1 || (int) $parts['port'] > 65_535))
            || ! in_array((string) ($parts['path'] ?? ''), ['', '/'], true)) {
            return null;
        }

        $host = strtolower(rtrim((string) $parts['host'], '.'));
        if (preg_match('/\A[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\z/', $host) !== 1
            || str_contains($host, '..')) {
            return null;
        }

        $port = isset($parts['port']) && (int) $parts['port'] !== 443
            ? ':'.(int) $parts['port']
            : '';

        return 'https://'.$host.$port;
    }

    private function validIdentity(string $value): bool
    {
        return preg_match('/\A[a-z0-9][a-z0-9._:-]{2,95}\z/', $value) === 1
            && preg_match('/replace|example|placeholder|unknown|local-only/i', $value) !== 1;
    }

    private function validDedicatedHeader(string $header): bool
    {
        return $this->validHeader($header)
            && ! in_array($header, ['forwarded', 'x-forwarded-for', 'x-real-ip'], true);
    }

    private function validHeader(string $header): bool
    {
        return preg_match('/\A[a-z0-9][a-z0-9-]{2,63}\z/', $header) === 1
            && preg_match('/replace|example|placeholder|unknown/i', $header) !== 1;
    }

    private function safeAbsoluteHook(string $path): bool
    {
        return preg_match('#\A/usr/local/libexec/[A-Za-z0-9._-]+\z#', $path) === 1
            && preg_match('/replace|example|placeholder|unknown/i', $path) !== 1;
    }

    private function validSha256Fingerprint(string $value): bool
    {
        return preg_match('/\A[a-f0-9]{64}\z/', $value) === 1
            && preg_match('/\A([a-f0-9])\1{63}\z/', $value) !== 1;
    }

    private function safeRunbook(string $path): bool
    {
        return $path === 'docs/DDOS_RESPONSE_OPERATIONS.md';
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }
}
