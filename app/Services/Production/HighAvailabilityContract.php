<?php

namespace App\Services\Production;

use App\Exceptions\HighAvailabilityContractViolation;
use App\Support\TrustedProxyPolicy;
use Illuminate\Contracts\Config\Repository;

final class HighAvailabilityContract
{
    public function __construct(private readonly Repository $config) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('high_availability.enforce', false);
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

        $this->add(
            $checks,
            'contract.enforcement',
            $this->shouldEnforce() ? 'pass' : 'fail',
            $this->shouldEnforce()
                ? 'The high-availability runtime contract is enforced.'
                : 'HIGH_AVAILABILITY_CONTRACT_ENFORCE must be true for release activation.',
        );

        $this->databaseChecks($checks);
        $this->loadBalancerChecks($checks);
        $this->redisChecks($checks);

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

        $codes = array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));

        throw HighAvailabilityContractViolation::fromCodes($codes);
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function databaseChecks(array &$checks): void
    {
        $connectionName = trim((string) $this->config->get('database.default'));
        $connection = $this->config->get("database.connections.{$connectionName}");
        $connection = is_array($connection) ? $connection : [];
        $driver = strtolower(trim((string) ($connection['driver'] ?? '')));

        $supportedDriver = in_array($driver, ['mysql', 'mariadb'], true);
        $this->add(
            $checks,
            'database.supported_ha_driver',
            $supportedDriver ? 'pass' : 'fail',
            $supportedDriver
                ? 'The managed writer contract uses the implemented MySQL/MariaDB HA adapter.'
                : 'This release implements the production HA contract for MySQL/MariaDB only.',
        );

        $managed = (bool) $this->config->get('high_availability.database.managed_service', false);
        $enabled = (bool) $this->config->get('high_availability.database.ha_enabled', false);
        $automaticFailover = (bool) $this->config->get(
            'high_availability.database.automatic_failover',
            false,
        );
        $this->add(
            $checks,
            'database.managed_multi_az',
            $managed && $enabled && $automaticFailover ? 'pass' : 'fail',
            $managed && $enabled && $automaticFailover
                ? 'Managed database Multi-AZ and automatic failover are explicitly declared.'
                : 'DB_MANAGED_SERVICE, DB_HA_ENABLED, and DB_AUTOMATIC_FAILOVER must all be true.',
        );

        $endpointKind = strtolower(trim((string) $this->config->get(
            'high_availability.database.endpoint_kind',
        )));
        $allowedEndpointKinds = (array) $this->config->get(
            'high_availability.database.allowed_endpoint_kinds',
            [],
        );
        $this->add(
            $checks,
            'database.stable_failover_endpoint',
            in_array($endpointKind, $allowedEndpointKinds, true)
                && $this->isStableDnsEndpoint($this->databaseHost($connection))
                ? 'pass'
                : 'fail',
            in_array($endpointKind, $allowedEndpointKinds, true)
                && $this->isStableDnsEndpoint($this->databaseHost($connection))
                ? 'The default connection uses a stable managed writer endpoint.'
                : 'The default database must use a non-local DNS cluster/proxy writer endpoint.',
        );

        $minimumZones = (int) $this->config->get(
            'high_availability.database.minimum_availability_zones',
            1,
        );
        $rto = (int) $this->config->get('high_availability.database.failover_rto_seconds', 0);
        $maximumRto = (int) $this->config->get(
            'high_availability.database.maximum_failover_rto_seconds',
            120,
        );
        $recoveryTargetIsBounded = $minimumZones >= 2 && $rto > 0 && $rto <= $maximumRto;
        $this->add(
            $checks,
            'database.failover_target',
            $recoveryTargetIsBounded ? 'pass' : 'fail',
            $recoveryTargetIsBounded
                ? 'Database failover spans at least two availability zones with a bounded RTO declaration.'
                : "DB_HA_MIN_AZS must be at least 2 and DB_FAILOVER_RTO_SECONDS must be 1-{$maximumRto}.",
        );

        $tlsRequired = (bool) $this->config->get('high_availability.database.tls_required', false);
        $verifyPeer = (bool) $this->config->get('high_availability.database.tls_verify_peer', false);
        $tlsApplied = $this->databaseTlsIsConfigured($driver, $connection);
        $this->add(
            $checks,
            'database.tls_verified',
            $tlsRequired && $verifyPeer && $tlsApplied ? 'pass' : 'fail',
            $tlsRequired && $verifyPeer && $tlsApplied
                ? 'Database transport requires verified TLS.'
                : 'Database TLS and peer/hostname verification must be enabled in both declaration and driver configuration.',
        );

        $connectTimeout = $this->databaseConnectTimeout($driver, $connection);
        $this->add(
            $checks,
            'database.bounded_connect',
            $connectTimeout > 0 && $connectTimeout <= 10 ? 'pass' : 'fail',
            $connectTimeout > 0 && $connectTimeout <= 10
                ? 'Database connection establishment has a bounded timeout.'
                : 'Database connection timeout must be between 1 and 10 seconds.',
        );

        $hasReadSplit = isset($connection['read']) && (array) $connection['read'] !== [];
        $this->add(
            $checks,
            'database.transactional_writer_consistency',
            ! $hasReadSplit ? 'pass' : 'fail',
            ! $hasReadSplit
                ? 'The transactional default connection does not route reads to lagging replicas.'
                : 'Do not add an asynchronous read-replica split to the booking transaction connection.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function loadBalancerChecks(array &$checks): void
    {
        $enabled = (bool) $this->config->get('high_availability.load_balancer.enabled', false);
        $instances = (int) $this->config->get('production.application_instances', 1);
        $this->add(
            $checks,
            'load_balancer.two_nodes',
            $enabled && $instances >= 2 ? 'pass' : 'fail',
            $enabled && $instances >= 2
                ? 'A load balancer with at least two application nodes is declared.'
                : 'LOAD_BALANCER_ENABLED must be true and PRODUCTION_APP_INSTANCES must be at least 2.',
        );

        $managed = (bool) $this->config->get(
            'high_availability.load_balancer.managed_service',
            false,
        );
        $haEnabled = (bool) $this->config->get(
            'high_availability.load_balancer.ha_enabled',
            false,
        );
        $automaticFailover = (bool) $this->config->get(
            'high_availability.load_balancer.automatic_failover',
            false,
        );
        $failureDomains = (int) $this->config->get(
            'high_availability.load_balancer.minimum_failure_domains',
            1,
        );
        $failoverRto = (int) $this->config->get(
            'high_availability.load_balancer.failover_rto_seconds',
            0,
        );
        $maximumFailoverRto = (int) $this->config->get(
            'high_availability.load_balancer.maximum_failover_rto_seconds',
            120,
        );
        $edgeIsHighlyAvailable = $enabled
            && $managed
            && $haEnabled
            && $automaticFailover
            && $failureDomains >= 2
            && $failoverRto >= 1
            && $failoverRto <= $maximumFailoverRto;
        $this->add(
            $checks,
            'load_balancer.edge_high_availability',
            $edgeIsHighlyAvailable ? 'pass' : 'fail',
            $edgeIsHighlyAvailable
                ? "The managed load-balancer edge spans {$failureDomains} failure domains with automatic failover inside {$failoverRto}s."
                : "Use a managed HA load balancer spanning at least two failure domains with automatic failover inside {$maximumFailoverRto}s.",
        );

        $healthPath = (string) $this->config->get('high_availability.load_balancer.health_path');
        $this->add(
            $checks,
            'load_balancer.readiness_routing',
            hash_equals('/health/ready', $healthPath) ? 'pass' : 'fail',
            hash_equals('/health/ready', $healthPath)
                ? 'The load balancer removes nodes using the dedicated readiness endpoint.'
                : 'LOAD_BALANCER_HEALTH_PATH must be exactly /health/ready; /up is liveness only.',
        );

        $instanceId = trim((string) $this->config->get(
            'high_availability.load_balancer.instance_id',
        ));
        $validInstanceId = preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._:-]{2,95}\z/', $instanceId) === 1
            && preg_match('/replace|example|unknown|localhost|local-app/i', $instanceId) !== 1;
        $exposesIdentity = (bool) $this->config->get(
            'high_availability.load_balancer.expose_instance_header',
            false,
        );
        $this->add(
            $checks,
            'load_balancer.node_identity',
            $validInstanceId && $exposesIdentity ? 'pass' : 'fail',
            $validInstanceId && $exposesIdentity
                ? 'This node has a valid instance identity exposed only as an opaque readiness header.'
                : 'Each node needs a unique PRODUCTION_INSTANCE_ID and the opaque readiness header must be enabled.',
        );

        $release = trim((string) $this->config->get('monitoring.release'));
        $validRelease = preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._:-]{6,127}\z/', $release) === 1
            && preg_match('/replace|example|unknown|latest|placeholder/i', $release) !== 1;
        $exposesRelease = (bool) $this->config->get(
            'high_availability.load_balancer.expose_release_header',
            false,
        );
        $this->add(
            $checks,
            'load_balancer.release_identity',
            $validRelease && $exposesRelease ? 'pass' : 'fail',
            $validRelease && $exposesRelease
                ? 'Every node exposes an opaque immutable release identity for convergence checks.'
                : 'Configure an immutable APP_RELEASE and enable its opaque readiness header.',
        );

        $proxies = $this->normalizedCsv((string) $this->config->get('security.trusted_proxies', ''));
        $trustedProxiesAreBounded = $proxies !== [] && collect($proxies)->every(
            fn (string $proxy): bool => TrustedProxyPolicy::allows($proxy),
        );
        $this->add(
            $checks,
            'load_balancer.trusted_proxies',
            $trustedProxiesAreBounded ? 'pass' : 'fail',
            $trustedProxiesAreBounded
                ? 'Only explicitly declared reverse proxies may supply forwarding headers.'
                : 'TRUSTED_PROXIES must contain only explicit load balancer IPs or bounded CIDRs.',
        );

        $forwardedForMode = strtolower(trim((string) $this->config->get(
            'high_availability.load_balancer.forwarded_for_mode',
        )));
        $this->add(
            $checks,
            'load_balancer.forwarded_for_normalization',
            $forwardedForMode === 'replace' ? 'pass' : 'fail',
            $forwardedForMode === 'replace'
                ? 'The trusted edge replaces untrusted X-Forwarded-For input with the transport client address.'
                : 'The load balancer must replace, not append or preserve, client-supplied X-Forwarded-For.',
        );

        $readinessEdgeProtected = (bool) $this->config->get(
            'high_availability.load_balancer.readiness_edge_protected',
            false,
        );
        $this->add(
            $checks,
            'load_balancer.readiness_edge_protection',
            $readinessEdgeProtected ? 'pass' : 'fail',
            $readinessEdgeProtected
                ? 'The public readiness path is abuse-limited at the stateless edge.'
                : 'Protect /health/ready at the load balancer without depending on application cache or sessions.',
        );

        $appUrl = trim((string) $this->config->get('app.url'));
        $this->add(
            $checks,
            'load_balancer.https_origin',
            $this->isHttpsOrigin($appUrl) ? 'pass' : 'fail',
            $this->isHttpsOrigin($appUrl)
                ? 'The public application origin is HTTPS.'
                : 'APP_URL must use HTTPS behind the production load balancer.',
        );

        $stickySessions = (bool) $this->config->get(
            'high_availability.load_balancer.sticky_sessions',
            false,
        );
        $healthInterval = (int) $this->config->get(
            'high_availability.load_balancer.health_interval_seconds',
            0,
        );
        $healthTimeout = (int) $this->config->get(
            'high_availability.load_balancer.health_timeout_seconds',
            0,
        );
        $readinessBudget = (int) $this->config->get(
            'monitoring.readiness.total_budget_ms',
            0,
        );
        $readinessAttempts = (int) $this->config->get(
            'monitoring.readiness.attempts',
            0,
        );
        $drainSeconds = (int) $this->config->get(
            'high_availability.load_balancer.connection_drain_seconds',
            0,
        );
        $routingIsSafe = ! $stickySessions
            && $healthInterval >= 2
            && $healthInterval <= 30
            && $healthTimeout >= 2
            && $healthTimeout <= 10
            && $readinessBudget >= 500
            && $readinessBudget < ($healthTimeout * 1_000)
            && $drainSeconds >= 15
            && $drainSeconds <= 300;
        $this->add(
            $checks,
            'load_balancer.routing_policy',
            $routingIsSafe ? 'pass' : 'fail',
            $routingIsSafe
                ? 'Routing is stateless with bounded health polling and connection draining.'
                : 'Disable sticky sessions; keep readiness below a 2-10 second health timeout, use a 2-30 second interval, and drain for 15-300 seconds.',
        );
        $this->add(
            $checks,
            'load_balancer.readiness_fail_fast',
            $readinessAttempts === 1 ? 'pass' : 'fail',
            $readinessAttempts === 1
                ? 'Runtime readiness uses one attempt and delegates repeated observations to the load balancer.'
                : 'MONITORING_READINESS_ATTEMPTS must be exactly 1 in multi-node production.',
        );

        $databaseConnectionName = (string) $this->config->get('database.default');
        $databaseConnection = $this->config->get(
            "database.connections.{$databaseConnectionName}",
            [],
        );
        $databaseConnection = is_array($databaseConnection) ? $databaseConnection : [];
        $databaseDriver = strtolower((string) ($databaseConnection['driver'] ?? ''));
        $dependencyTimeouts = [
            $this->databaseConnectTimeout($databaseDriver, $databaseConnection),
        ];
        $redisWorkloads = $this->selectedRedisWorkloads();

        foreach (['session', 'cache', 'traffic', 'coordination'] as $workload) {
            $connectionName = $redisWorkloads[$workload] ?? '';
            $configuration = $this->config->get("database.redis.{$connectionName}");

            if (! is_array($configuration)) {
                $dependencyTimeouts[] = 0;

                continue;
            }

            $dependencyTimeouts[] = max(
                (float) ($configuration['timeout'] ?? 0),
                (float) ($configuration['read_timeout'] ?? 0),
            );
        }

        $dependencyTimeoutsAreBounded = $dependencyTimeouts !== []
            && collect($dependencyTimeouts)->every(
                static fn (float|int $timeout): bool => $timeout > 0
                    && $timeout < $healthTimeout,
            );
        $this->add(
            $checks,
            'load_balancer.readiness_transport_deadline',
            $dependencyTimeoutsAreBounded ? 'pass' : 'fail',
            $dependencyTimeoutsAreBounded
                ? 'Every required dependency transport times out before the load-balancer health deadline.'
                : 'Database and required Redis transport timeouts must be positive and shorter than LOAD_BALANCER_HEALTH_TIMEOUT_SECONDS.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function redisChecks(array &$checks): void
    {
        $managed = (bool) $this->config->get('high_availability.redis.managed_service', false);
        $enabled = (bool) $this->config->get('high_availability.redis.ha_enabled', false);
        $automaticFailover = (bool) $this->config->get(
            'high_availability.redis.automatic_failover',
            false,
        );
        $topology = (string) $this->config->get('high_availability.redis.topology', '');
        $minimumReplicas = (int) $this->config->get(
            'high_availability.redis.minimum_replicas',
            0,
        );
        $managedReplication = $managed
            && $enabled
            && $automaticFailover
            && $topology === 'replicated'
            && $minimumReplicas >= 1;
        $this->add(
            $checks,
            'redis.managed_replication',
            $managedReplication ? 'pass' : 'fail',
            $managedReplication
                ? 'Managed Redis replication and automatic failover are explicitly declared.'
                : 'Use managed replicated Redis with automatic failover and at least one replica.',
        );

        $workloads = $this->selectedRedisWorkloads();
        $this->add(
            $checks,
            'redis.all_workloads_selected',
            count($workloads) === 5 ? 'pass' : 'fail',
            count($workloads) === 5
                ? 'Session, cache, traffic limiting, queue, and coordination all use explicit Redis connections.'
                : 'Production session, cache, traffic limiting, queue, and distributed locks must all use Redis.',
        );

        $requiredReadiness = array_map(
            static fn (mixed $check): string => strtolower(trim((string) $check)),
            (array) $this->config->get('monitoring.readiness.required_checks', []),
        );
        $sessionsGateTraffic = in_array('sessions', $requiredReadiness, true);
        $locksGateTraffic = in_array('locks', $requiredReadiness, true);
        $limiterGatesTraffic = in_array('traffic', $requiredReadiness, true);
        $this->add(
            $checks,
            'redis.session_runtime_gating',
            $sessionsGateTraffic ? 'pass' : 'fail',
            $sessionsGateTraffic
                ? 'A session Redis outage removes an affected application node from traffic.'
                : 'MONITORING_READINESS_REQUIRED_CHECKS must include sessions.',
        );
        $this->add(
            $checks,
            'redis.lock_runtime_gating',
            $locksGateTraffic ? 'pass' : 'fail',
            $locksGateTraffic
                ? 'A coordination Redis outage removes the affected application node from traffic.'
                : 'MONITORING_READINESS_REQUIRED_CHECKS must include locks.',
        );
        $this->add(
            $checks,
            'redis.traffic_runtime_gating',
            $limiterGatesTraffic ? 'pass' : 'fail',
            $limiterGatesTraffic
                ? 'A traffic-limiter Redis outage removes the affected node before rate limiting fails unpredictably.'
                : 'MONITORING_READINESS_REQUIRED_CHECKS must include traffic.',
        );

        $tlsDeclared = (bool) $this->config->get('high_availability.redis.tls_required', false);
        $tlsVerifyPeer = (bool) $this->config->get(
            'high_availability.redis.tls_verify_peer',
            false,
        );
        $authDeclared = (bool) $this->config->get('high_availability.redis.auth_required', false);
        $endpoints = [];
        $transportValid = count($workloads) === 5;

        foreach ($workloads as $component => $connectionName) {
            $configuration = $this->config->get("database.redis.{$connectionName}");
            if (! is_array($configuration)) {
                $transportValid = false;

                continue;
            }

            $endpoint = $this->redisEndpoint($configuration);
            if ($endpoint === null
                || ! $endpoint['tls']
                || ! $endpoint['authenticated']
                || ! $this->redisPeerVerificationIsConfigured($configuration)
                || ! $this->isStableDnsEndpoint($endpoint['host'])
                || $endpoint['database'] !== '0') {
                $transportValid = false;

                continue;
            }

            $endpoints[$component] = hash(
                'sha256',
                strtolower($endpoint['host']).':'.$endpoint['port'],
            );
        }

        $this->add(
            $checks,
            'redis.secure_endpoints',
            $tlsDeclared && $tlsVerifyPeer && $authDeclared && $transportValid ? 'pass' : 'fail',
            $tlsDeclared && $tlsVerifyPeer && $authDeclared && $transportValid
                ? 'Every Redis workload uses authenticated, peer-verified TLS on a stable DNS endpoint and database zero.'
                : 'Every Redis workload must use authenticated, peer-verified rediss with a stable DNS name and database 0.',
        );

        $dedicatedRequired = (bool) $this->config->get(
            'high_availability.redis.dedicated_workload_endpoints',
            false,
        );
        $dedicated = count($endpoints) === 5 && count(array_unique($endpoints)) === 5;
        $this->add(
            $checks,
            'redis.physical_isolation',
            $dedicatedRequired && $dedicated ? 'pass' : 'fail',
            $dedicatedRequired && $dedicated
                ? 'Session, cache, traffic limiting, queue, and coordination use separate managed Redis failover endpoints.'
                : 'Dedicated physical Redis endpoints are required for session, cache, traffic limiting, queue, and coordination fault isolation.',
        );

        $sessionPolicy = (string) $this->config->get(
            'high_availability.redis.session_maxmemory_policy',
        );
        $cachePolicy = (string) $this->config->get(
            'high_availability.redis.cache_maxmemory_policy',
        );
        $trafficPolicy = (string) $this->config->get(
            'high_availability.redis.traffic_maxmemory_policy',
        );
        $queuePolicy = (string) $this->config->get(
            'high_availability.redis.queue_maxmemory_policy',
        );
        $coordinationPolicy = (string) $this->config->get(
            'high_availability.redis.coordination_maxmemory_policy',
        );
        $persistence = (string) $this->config->get(
            'high_availability.redis.queue_persistence',
        );
        $cachePolicies = (array) $this->config->get(
            'high_availability.redis.allowed_cache_policies',
            [],
        );
        $persistenceModes = (array) $this->config->get(
            'high_availability.redis.allowed_queue_persistence',
            [],
        );
        $policiesAreSafe = $sessionPolicy === 'noeviction'
            && $queuePolicy === 'noeviction'
            && $coordinationPolicy === 'noeviction'
            && in_array($cachePolicy, $cachePolicies, true)
            && in_array($trafficPolicy, $cachePolicies, true)
            && in_array($persistence, $persistenceModes, true);
        $this->add(
            $checks,
            'redis.workload_policies',
            $policiesAreSafe ? 'pass' : 'fail',
            $policiesAreSafe
                ? 'Redis eviction and durability policies match each workload risk.'
                : 'Use noeviction for session/queue/coordination, approved allkeys policies for cache/traffic limits, and managed queue persistence.',
        );
    }

    /** @return array<string, string> */
    private function selectedRedisWorkloads(): array
    {
        $workloads = [];

        if (strtolower((string) $this->config->get('session.driver')) === 'redis') {
            $workloads['session'] = (string) ($this->config->get('session.connection') ?: 'default');
        }

        $cacheStore = (string) $this->config->get('cache.default');
        if (strtolower((string) $this->config->get("cache.stores.{$cacheStore}.driver")) === 'redis') {
            $workloads['cache'] = (string) $this->config->get(
                "cache.stores.{$cacheStore}.connection",
                'cache',
            );
            $workloads['coordination'] = (string) $this->config->get(
                "cache.stores.{$cacheStore}.lock_connection",
                '',
            );
        }

        $limiterStore = (string) $this->config->get('cache.limiter');
        if (strtolower((string) $this->config->get("cache.stores.{$limiterStore}.driver")) === 'redis') {
            $workloads['traffic'] = (string) $this->config->get(
                "cache.stores.{$limiterStore}.connection",
                'traffic',
            );
        }

        $queueConnection = (string) $this->config->get('queue.default');
        if (strtolower((string) $this->config->get("queue.connections.{$queueConnection}.driver")) === 'redis') {
            $workloads['queue'] = (string) $this->config->get(
                "queue.connections.{$queueConnection}.connection",
                'default',
            );
        }

        return $workloads;
    }

    /** @return array{host:string,port:string,database:string,tls:bool,authenticated:bool}|null */
    private function redisEndpoint(array $configuration): ?array
    {
        $url = trim((string) ($configuration['url'] ?? ''));
        if ($url !== '') {
            $parts = parse_url($url);
            if (! is_array($parts)) {
                return null;
            }

            $scheme = strtolower((string) ($parts['scheme'] ?? ''));
            $database = ltrim((string) ($parts['path'] ?? ''), '/');

            return [
                'host' => strtolower((string) ($parts['host'] ?? '')),
                'port' => (string) ($parts['port'] ?? '6379'),
                'database' => $database === '' ? (string) ($configuration['database'] ?? '') : $database,
                'tls' => in_array($scheme, ['rediss', 'tls'], true),
                'authenticated' => trim((string) ($parts['pass'] ?? '')) !== ''
                    || trim((string) ($configuration['password'] ?? '')) !== '',
            ];
        }

        $host = trim((string) ($configuration['host'] ?? ''));
        $scheme = strtolower(trim((string) ($configuration['scheme'] ?? '')));
        if (str_starts_with(strtolower($host), 'tls://')) {
            $host = substr($host, 6);
            $scheme = 'tls';
        }

        if ($host === '') {
            return null;
        }

        return [
            'host' => strtolower($host),
            'port' => (string) ($configuration['port'] ?? '6379'),
            'database' => (string) ($configuration['database'] ?? ''),
            'tls' => in_array($scheme, ['rediss', 'tls'], true),
            'authenticated' => trim((string) ($configuration['password'] ?? '')) !== '',
        ];
    }

    private function databaseHost(array $connection): string
    {
        $url = trim((string) ($connection['url'] ?? ''));
        if ($url !== '') {
            $parts = parse_url($url);

            return is_array($parts) ? strtolower((string) ($parts['host'] ?? '')) : '';
        }

        $host = $connection['host'] ?? '';
        if (is_array($host)) {
            $host = $host[0] ?? '';
        }

        return strtolower(trim((string) $host));
    }

    private function redisPeerVerificationIsConfigured(array $configuration): bool
    {
        $ssl = $configuration['context']['ssl'] ?? null;

        return is_array($ssl)
            && ($ssl['verify_peer'] ?? false) === true
            && ($ssl['verify_peer_name'] ?? false) === true
            && ($ssl['allow_self_signed'] ?? true) === false;
    }

    private function isStableDnsEndpoint(string $host): bool
    {
        $host = rtrim(strtolower(trim($host, " \t\n\r\0\x0B[]")), '.');

        if ($host === ''
            || $host === 'localhost'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.local')
            || filter_var($host, FILTER_VALIDATE_IP) !== false
            || ! str_contains($host, '.')) {
            return false;
        }

        return filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
    }

    private function isHttpsOrigin(string $url): bool
    {
        $parts = parse_url($url);

        return is_array($parts)
            && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
            && $this->isStableDnsEndpoint((string) ($parts['host'] ?? ''))
            && ! isset($parts['user'])
            && ! isset($parts['pass'])
            && ! isset($parts['query'])
            && ! isset($parts['fragment'])
            && in_array((string) ($parts['path'] ?? ''), ['', '/'], true);
    }

    private function databaseTlsIsConfigured(string $driver, array $connection): bool
    {
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $ca = trim((string) $this->config->get('high_availability.database.tls_ca'));

            return $ca !== '' && $this->mysqlOptionIsConfigured($connection, [
                'PDO::MYSQL_ATTR_SSL_CA',
                'Pdo\\Mysql::ATTR_SSL_CA',
            ]) && $this->mysqlOptionIsEnabled($connection, [
                'PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT',
                'Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT',
            ]);
        }

        if ($driver === 'pgsql') {
            return strtolower(trim((string) ($connection['sslmode'] ?? ''))) === 'verify-full';
        }

        if ($driver === 'sqlsrv') {
            $encrypt = strtolower(trim((string) ($connection['encrypt'] ?? '')));
            $trustServer = filter_var(
                $connection['trust_server_certificate'] ?? true,
                FILTER_VALIDATE_BOOL,
            );

            return in_array($encrypt, ['yes', 'true', 'mandatory'], true) && ! $trustServer;
        }

        return false;
    }

    /** @param list<string> $constantNames */
    private function mysqlOptionIsEnabled(array $connection, array $constantNames): bool
    {
        $options = $connection['options'] ?? [];
        if (! is_array($options)) {
            return false;
        }

        foreach ($constantNames as $constantName) {
            if (! defined($constantName)) {
                continue;
            }

            $key = constant($constantName);
            if (array_key_exists($key, $options) && (bool) $options[$key]) {
                return true;
            }
        }

        return false;
    }

    /** @param list<string> $constantNames */
    private function mysqlOptionIsConfigured(array $connection, array $constantNames): bool
    {
        $options = $connection['options'] ?? [];
        if (! is_array($options)) {
            return false;
        }

        foreach ($constantNames as $constantName) {
            if (! defined($constantName)) {
                continue;
            }

            $key = constant($constantName);
            if (array_key_exists($key, $options) && trim((string) $options[$key]) !== '') {
                return true;
            }
        }

        return false;
    }

    private function databaseConnectTimeout(string $driver, array $connection): float
    {
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $options = is_array($connection['options'] ?? null) ? $connection['options'] : [];

            return (float) ($options[\PDO::ATTR_TIMEOUT] ?? 0);
        }

        if ($driver === 'sqlsrv') {
            return (float) ($connection['login_timeout'] ?? 0);
        }

        return 0;
    }

    /** @return list<string> */
    private function normalizedCsv(string $value): array
    {
        return array_values(array_unique(array_filter(array_map(
            static fn (string $item): string => trim($item),
            explode(',', $value),
        ))));
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(
        array &$checks,
        string $code,
        string $status,
        string $message,
    ): void {
        $checks[] = compact('code', 'status', 'message');
    }
}
