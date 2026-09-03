<?php

namespace App\Services\Production;

use App\Exceptions\ProductionContractViolation;
use Illuminate\Contracts\Config\Repository;

final class SingleNodeProductionContract
{
    public function __construct(private readonly Repository $config) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('single_node.enforce', false);
    }

    /** @return array<string, mixed> */
    public function report(): array
    {
        $checks = [];

        $this->runtimeChecks($checks);
        $this->databaseChecks($checks);
        $this->stateChecks($checks);
        $this->storageChecks($checks);
        $this->deploymentChecks($checks);
        $this->edgeChecks($checks);
        $this->recoveryChecks($checks);
        $this->operationsChecks($checks);

        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $warnings = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'warning',
        ));

        return [
            'topology' => 'single_node',
            'availability' => 'single_failure_domain',
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => $checks,
            'active_capabilities' => [
                'atomic_single_node_deployment',
                'database_transactions_and_concurrency_guards',
                'durable_background_jobs',
                'process_supervision',
                'offsite_database_recovery',
                'external_monitoring',
                'edge_and_application_traffic_protection',
            ],
            'standby_capabilities' => array_values((array) $this->config->get(
                'single_node.standby',
                [],
            )),
        ];
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();

        if ($report['valid']) {
            return;
        }

        throw ProductionContractViolation::fromCodes(array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        )));
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function runtimeChecks(array &$checks): void
    {
        $environment = strtolower(trim((string) $this->config->get('app.env')));
        $topology = strtolower(trim((string) $this->config->get('production.topology')));
        $instances = (int) $this->config->get('production.application_instances', 0);

        $this->add(
            $checks,
            'runtime.production_environment',
            $environment === 'production',
            'The resolved runtime environment is production.',
            'APP_ENV must resolve to [production] before activation.',
        );
        $this->add(
            $checks,
            'contract.production_enforcement',
            (bool) $this->config->get('production.enforce', false),
            'The topology-aware production contract is enforced.',
            'PRODUCTION_CONTRACT_ENFORCE must be true.',
        );
        $this->add(
            $checks,
            'contract.single_node_enforcement',
            $this->shouldEnforce(),
            'The single-node safety contract is enforced.',
            'SINGLE_NODE_CONTRACT_ENFORCE must be true.',
        );
        $this->add(
            $checks,
            'topology.single_node',
            $topology === 'single_node',
            'The runtime explicitly targets one application node.',
            'PRODUCTION_TOPOLOGY must explicitly be [single_node].',
        );
        $this->add(
            $checks,
            'topology.exact_instance_count',
            $instances === 1,
            'Exactly one application instance is declared.',
            'PRODUCTION_APP_INSTANCES must be exactly 1 for single_node.',
        );
        $this->add(
            $checks,
            'runtime.debug_disabled',
            ! (bool) $this->config->get('app.debug', false),
            'Debug output is disabled.',
            'APP_DEBUG must be false in production.',
        );

        $appUrl = strtolower(trim((string) $this->config->get('app.url')));
        $this->add(
            $checks,
            'runtime.https_canonical_url',
            $this->isPublicHttpsEndpoint($appUrl),
            'The canonical application URL uses HTTPS.',
            'APP_URL must be a real public HTTPS origin without embedded credentials.',
        );

        $release = trim((string) $this->config->get('monitoring.release'));
        $validRelease = preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._:-]{6,127}\z/', $release) === 1
            && preg_match('/replace|example|unknown|latest|placeholder/i', $release) !== 1;
        $this->add(
            $checks,
            'release.immutable_identity',
            $validRelease,
            'An immutable release identity is configured.',
            'APP_RELEASE must be a non-placeholder immutable identifier.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function databaseChecks(array &$checks): void
    {
        $connection = trim((string) $this->config->get('database.default'));
        $definition = $this->config->get("database.connections.{$connection}");
        $definition = is_array($definition) ? $definition : [];
        $driver = strtolower(trim((string) ($definition['driver'] ?? '')));
        $allowed = (array) $this->config->get('single_node.database.allowed_drivers', []);

        $this->add(
            $checks,
            'database.transactional_driver',
            $connection !== '' && in_array($driver, $allowed, true),
            'The primary database uses a transactional MySQL-compatible driver.',
            'Single-node production requires the mysql or mariadb connection.',
        );

        $url = trim((string) ($definition['url'] ?? ''));
        $urlParts = $url === '' ? null : parse_url($url);
        $username = trim((string) (is_array($urlParts)
            ? ($urlParts['user'] ?? $definition['username'] ?? '')
            : ($definition['username'] ?? '')));
        $password = (string) (is_array($urlParts)
            ? ($urlParts['pass'] ?? $definition['password'] ?? '')
            : ($definition['password'] ?? ''));
        $resolvedHost = is_array($urlParts)
            ? ($urlParts['host'] ?? $definition['host'] ?? '')
            : ($definition['host'] ?? '');
        $host = strtolower(trim((string) $resolvedHost));
        $socket = trim((string) ($definition['unix_socket'] ?? ''));

        $this->add(
            $checks,
            'database.least_privilege_identity',
            $this->isNonPlaceholder($username)
                && ! in_array(strtolower($username), ['root', 'admin', 'administrator'], true),
            'The application database identity is non-root.',
            'DB_USERNAME must be a real dedicated least-privilege application user.',
        );
        $this->add(
            $checks,
            'database.credentials_present',
            $this->isConfiguredSecret($password),
            'The database connection resolves an authentication secret.',
            'The production database user must have a strong non-placeholder secret.',
        );

        $localOrPrivate = $socket !== '' || $this->isLocalOrPrivateHost($host);
        $managedTls = (bool) $this->config->get('high_availability.database.managed_service', false)
            && (bool) $this->config->get('high_availability.database.tls_required', false)
            && (bool) $this->config->get('high_availability.database.tls_verify_peer', false)
            && $this->isNonPlaceholder((string) $this->config->get(
                'high_availability.database.tls_ca',
            ));
        $this->add(
            $checks,
            'database.private_or_verified_transport',
            $localOrPrivate || $managedTls,
            'The writer is local/private or uses verified managed TLS.',
            'The database endpoint must be local/private or use peer-verified managed TLS.',
        );
        $this->add(
            $checks,
            'database.strict_mode',
            (bool) ($definition['strict'] ?? false),
            'Database strict mode is enabled.',
            'The production writer connection must enable strict mode.',
        );

        $timeout = (int) $this->config->get(
            'single_node.database.maximum_connect_timeout_seconds',
            0,
        );
        $this->add(
            $checks,
            'database.bounded_connect_timeout',
            $timeout >= 1 && $timeout <= 10,
            'Database connection establishment is time-bounded.',
            'DB_CONNECT_TIMEOUT_SECONDS must be between 1 and 10.',
        );
        $transactionAttempts = (int) $this->config->get(
            'resilience.database.transaction_attempts',
            1,
        );
        $this->add(
            $checks,
            'database.deadlock_retry_budget',
            $transactionAttempts >= (int) $this->config->get(
                'single_node.database.minimum_transaction_attempts',
                2,
            ) && $transactionAttempts <= 5,
            'Transactional deadlock retries are bounded and enabled.',
            'DB_TRANSACTION_ATTEMPTS must be between 2 and 5.',
        );

        $standby = ! (bool) $this->config->get('database_replication.enabled', false)
            && ! (bool) $this->config->get('database_replication.application_reads.enabled', false)
            && ! (bool) $this->config->get('high_availability.database.ha_enabled', false)
            && ! (bool) $this->config->get('high_availability.database.automatic_failover', false);
        $this->add(
            $checks,
            'standby.database_replication',
            $standby,
            'Replication, replica reads, and automatic failover are honestly dormant.',
            'Single-node mode cannot advertise replication, replica reads, or automatic failover.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function stateChecks(array &$checks): void
    {
        $sessionDriver = strtolower((string) $this->config->get('session.driver'));
        $cacheStore = (string) $this->config->get('cache.default');
        $cacheDriver = strtolower((string) $this->config->get("cache.stores.{$cacheStore}.driver"));
        $queueConnection = (string) $this->config->get('queue.default');
        $queueDriver = strtolower((string) $this->config->get(
            "queue.connections.{$queueConnection}.driver",
        ));

        foreach ([
            'session' => $sessionDriver,
            'cache' => $cacheDriver,
            'queue' => $queueDriver,
        ] as $component => $driver) {
            $this->add(
                $checks,
                "state.{$component}_redis",
                $driver === 'redis',
                ucfirst($component).' uses Redis.',
                ucfirst($component).' must use Redis in single-node production.',
            );
        }

        $connections = [
            'session' => (string) ($this->config->get('session.connection') ?: 'session'),
            'cache' => (string) $this->config->get(
                "cache.stores.{$cacheStore}.connection",
                'cache',
            ),
            'coordination' => (string) $this->config->get(
                "cache.stores.{$cacheStore}.lock_connection",
                'coordination',
            ),
            'queue' => (string) $this->config->get(
                "queue.connections.{$queueConnection}.connection",
                'queue',
            ),
        ];
        $limiterStore = (string) $this->config->get('ddos_protection.application.limiter_store');
        $connections['traffic'] = (string) $this->config->get(
            "cache.stores.{$limiterStore}.connection",
            'traffic',
        );

        $fingerprints = [];
        $unresolved = [];
        $unsafeTransport = [];
        $missingAuth = [];
        foreach ($connections as $workload => $redisConnection) {
            $definition = $this->config->get("database.redis.{$redisConnection}");
            if (! is_array($definition)) {
                $unresolved[] = $workload;
                continue;
            }

            $fingerprints[$workload] = $this->redisFingerprint($definition);
            if ($fingerprints[$workload] === null) {
                $unresolved[] = $workload;
            }
            if (! $this->boundedRedisTransport($definition, $workload === 'queue')) {
                $unsafeTransport[] = $workload;
            }
            if ((bool) $this->config->get('single_node.redis.auth_required', true)
                && ! $this->redisHasAuthentication($definition)) {
                $missingAuth[] = $workload;
            }
        }

        $this->add(
            $checks,
            'redis.connections_resolve',
            $unresolved === [],
            'Every state workload resolves to a Redis logical database.',
            'Redis configuration is missing for: '.implode(', ', $unresolved).'.',
        );
        $this->add(
            $checks,
            'redis.logical_isolation',
            count($fingerprints) === count(array_unique(array_filter($fingerprints))),
            'Session, cache, queue, limiter, and locks use isolated logical databases.',
            'Every critical Redis workload must use a distinct logical database.',
        );
        $this->add(
            $checks,
            'redis.transport_bounds',
            $unsafeTransport === [],
            'Redis retries and socket waits are bounded.',
            'Redis transport bounds are unsafe for: '.implode(', ', $unsafeTransport).'.',
        );
        $this->add(
            $checks,
            'redis.authentication',
            $missingAuth === [],
            'Redis authentication is configured for every workload.',
            'Redis authentication is missing for: '.implode(', ', $missingAuth).'.',
        );

        $requiredNoEviction = (array) $this->config->get(
            'single_node.redis.required_noeviction_workloads',
            [],
        );
        $policyMap = [
            'session' => 'high_availability.redis.session_maxmemory_policy',
            'queue' => 'high_availability.redis.queue_maxmemory_policy',
            'coordination' => 'high_availability.redis.coordination_maxmemory_policy',
        ];
        $unsafePolicies = array_values(array_filter(
            $requiredNoEviction,
            fn (mixed $workload): bool => ! is_string($workload)
                || strtolower(trim((string) $this->config->get($policyMap[$workload] ?? ''))) !== 'noeviction',
        ));
        $this->add(
            $checks,
            'redis.non_evictable_critical_state',
            $unsafePolicies === [],
            'Session, queue, and coordination state cannot be evicted.',
            'Critical Redis workloads must declare the noeviction policy.',
        );
        $persistence = strtolower((string) $this->config->get('single_node.redis.persistence'));
        $this->add(
            $checks,
            'redis.queue_persistence',
            in_array(
                $persistence,
                (array) $this->config->get('single_node.redis.allowed_persistence', []),
                true,
            ),
            'Redis queue/control data uses AOF every-second persistence.',
            'REDIS_QUEUE_PERSISTENCE must be aof_everysec on a single VPS.',
        );

        $queueDefinition = (array) $this->config->get("queue.connections.{$queueConnection}", []);
        $queueRedis = (array) $this->config->get(
            'database.redis.'.($connections['queue'] ?? 'queue'),
            [],
        );
        $blockFor = (float) ($queueDefinition['block_for'] ?? 0);
        $readTimeout = (float) ($queueRedis['read_timeout'] ?? 0);
        $this->add(
            $checks,
            'queue.transaction_and_lease_safety',
            (bool) ($queueDefinition['after_commit'] ?? false)
                && $blockFor >= 1
                && $readTimeout > $blockFor
                && $readTimeout <= 30,
            'Queue dispatch and blocking leases are transaction-safe and bounded.',
            'Queue after_commit must be true and Redis read timeout must exceed block_for.',
        );

        $maintenanceStore = (string) $this->config->get('app.maintenance.store');
        $maintenanceDriver = strtolower((string) $this->config->get('app.maintenance.driver'));
        $maintenanceStoreDriver = strtolower((string) $this->config->get(
            "cache.stores.{$maintenanceStore}.driver",
        ));
        $this->add(
            $checks,
            'maintenance.coordinated',
            $maintenanceDriver === 'cache' && $maintenanceStoreDriver === 'redis',
            'Maintenance state uses the coordination cache.',
            'APP_MAINTENANCE_DRIVER must be cache with a Redis coordination store.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function storageChecks(array &$checks): void
    {
        $root = $this->normalizedPath((string) $this->config->get(
            'single_node.storage.persistent_root',
            '',
        ));
        $appRoot = $this->normalizedPath((string) $this->config->get(
            'deployment.runtime.application_root',
            '',
        ));
        $releasesRoot = $this->normalizedPath((string) $this->config->get(
            'deployment.runtime.releases_root',
            '',
        ));
        $safeRoot = $root !== ''
            && str_starts_with($root, '/')
            && $appRoot !== ''
            && str_starts_with($root.'/', $appRoot.'/shared/')
            && ! str_starts_with($root.'/', $releasesRoot.'/');

        $this->add(
            $checks,
            'storage.persistent_root',
            $safeRoot,
            'Persistent storage is outside immutable release directories.',
            'SINGLE_NODE_PERSISTENT_STORAGE_ROOT must be an absolute path below the application shared directory.',
        );
        $this->add(
            $checks,
            'storage.release_symlink',
            (bool) $this->config->get('single_node.storage.release_storage_linked', false),
            'Each release links its storage directory to persistent shared storage.',
            'SINGLE_NODE_RELEASE_STORAGE_LINKED must certify the release storage symlink.',
        );

        $allowedDrivers = (array) $this->config->get('single_node.storage.allowed_drivers', []);
        $durableDisks = (array) $this->config->get('production.durable_disks', []);
        $requiredDisks = array_values((array) $this->config->get(
            'single_node.storage.required_durable_disks',
            [],
        ));
        $missingDisks = array_values(array_diff($requiredDisks, array_keys($durableDisks)));
        $this->add(
            $checks,
            'storage.durable_mapping_coverage',
            $requiredDisks !== [] && $missingDisks === [],
            'Every durable media and document workload is mapped to persistent storage.',
            'Durable storage mappings are missing for: '.implode(', ', $missingDisks).'.',
        );

        foreach ($durableDisks as $label => $mapping) {
            if (! is_string($label)) {
                continue;
            }
            $path = is_array($mapping) ? (string) ($mapping['path'] ?? '') : (string) $mapping;
            $disk = trim((string) $this->config->get($path));
            $definition = (array) $this->config->get("filesystems.disks.{$disk}", []);
            $driver = strtolower(trim((string) ($definition['driver'] ?? '')));
            $valid = $disk !== ''
                && in_array($driver, $allowedDrivers, true)
                && (bool) ($definition['throw'] ?? false);
            if ($driver === 's3') {
                $valid = $valid
                    && trim((string) ($definition['bucket'] ?? '')) !== ''
                    && $this->encryptedObjectEndpoint($definition);
            }
            $this->add(
                $checks,
                "storage.disk.{$label}",
                $valid,
                "Durable disk [{$label}] fails loudly on storage errors.",
                "Durable disk [{$label}] must resolve to fail-loud local persistent or TLS object storage.",
            );
        }
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function deploymentChecks(array &$checks): void
    {
        $orchestrator = (array) $this->config->get('deployment.orchestrator', []);
        $strategy = strtolower(trim((string) $this->config->get('deployment.strategy')));
        $safeOrchestration = $strategy === 'atomic_single_node'
            && ($orchestrator['immutable_releases'] ?? false) === true
            && ($orchestrator['atomic_traffic_switch'] ?? false) === true
            && ($orchestrator['health_gated'] ?? false) === true
            && ($orchestrator['automatic_application_rollback'] ?? false) === true
            && (int) ($orchestrator['maximum_unavailable'] ?? -1) === 1
            && (int) ($orchestrator['minimum_healthy_instances'] ?? 0) === 1
            && (int) ($orchestrator['retained_releases'] ?? 0) >= 3;
        $this->add(
            $checks,
            'deployment.atomic_single_node',
            $safeOrchestration,
            'Deployment uses health-gated immutable releases and an atomic symlink switch.',
            'Single-node deployment must use atomic_single_node with health gates, app rollback, and retained releases.',
        );

        $schema = (array) $this->config->get('deployment.schema', []);
        $this->add(
            $checks,
            'deployment.schema_safety',
            ($schema['expand_contract_required'] ?? false) === true
                && (int) ($schema['backward_compatible_releases'] ?? 0) >= 1
                && ($schema['automatic_database_rollback'] ?? true) === false,
            'Schema changes preserve rollback compatibility without blind database reversal.',
            'Expand/contract, backward compatibility, and manual database recovery are required.',
        );

        $runtime = (array) $this->config->get('deployment.runtime', []);
        $appRoot = $this->normalizedPath((string) ($runtime['application_root'] ?? ''));
        $releasesRoot = $this->normalizedPath((string) ($runtime['releases_root'] ?? ''));
        $currentLink = $this->normalizedPath((string) ($runtime['current_link'] ?? ''));
        $readinessUrl = strtolower(trim((string) ($runtime['local_readiness_url'] ?? '')));
        $safePaths = str_starts_with($appRoot, '/')
            && $releasesRoot === $appRoot.'/releases'
            && $currentLink === $appRoot.'/current'
            && preg_match('#\Ahttp://(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/health/ready\z#', $readinessUrl) === 1;
        $this->add(
            $checks,
            'deployment.bounded_runtime_paths',
            $safePaths,
            'Release roots, current pointer, and loopback readiness probe are bounded.',
            'Deployment paths must remain below the application root and readiness must use loopback.',
        );

        $reloadHook = trim((string) $this->config->get(
            'single_node.deployment.runtime_reload_hook',
            '',
        ));
        $this->add(
            $checks,
            'deployment.runtime_reload_hook',
            str_starts_with($reloadHook, '/')
                && preg_match('/replace|example|placeholder|unknown/i', $reloadHook) !== 1,
            'An explicit absolute runtime reload adapter is configured.',
            'SINGLE_NODE_RUNTIME_RELOAD_HOOK must identify the real absolute PHP-FPM reload adapter.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function edgeChecks(array &$checks): void
    {
        $edge = (array) $this->config->get('deployment.edge', []);
        $provider = strtolower(trim((string) ($edge['provider'] ?? '')));
        $providerIsReal = $this->isNonPlaceholder($provider);
        $tls = (float) ($edge['minimum_tls_version'] ?? 0);
        $edgeReady = $providerIsReal
            && ($edge['managed_dns'] ?? false) === true
            && ($edge['cdn_enabled'] ?? false) === true
            && ($edge['waf_enabled'] ?? false) === true
            && ($edge['ddos_protection'] ?? false) === true
            && ($edge['tls_termination'] ?? false) === true
            && ($edge['origin_tls'] ?? false) === true
            && ($edge['origin_access_restricted'] ?? false) === true
            && ($edge['certificate_auto_renewal'] ?? false) === true
            && $tls >= 1.2;
        $this->add(
            $checks,
            'edge.managed_protection',
            $edgeReady,
            'Managed DNS, CDN, WAF, DDoS protection, and verified TLS protect the origin.',
            'A real managed edge with WAF, DDoS, restricted origin, and TLS 1.2+ is required.',
        );

        $application = (array) $this->config->get('ddos_protection.application', []);
        $envelope = (array) ($application['resource_envelope'] ?? []);
        $this->add(
            $checks,
            'edge.application_resource_envelope',
            ($application['enabled'] ?? false) === true
                && ($envelope['enabled'] ?? false) === true
                && $this->isNonPlaceholder((string) ($application['limiter_store'] ?? '')),
            'Application rate limits and bounded request envelopes remain active behind the edge.',
            'Application traffic protection, limiter storage, and request envelopes must remain enabled.',
        );

        $ddosEdge = (array) $this->config->get('ddos_protection.edge', []);
        $origin = (array) $this->config->get('ddos_protection.origin', []);
        $identity = (array) $this->config->get('ddos_protection.client_identity', []);
        $ddosReady = ($ddosEdge['always_on'] ?? false) === true
            && ($ddosEdge['anycast_or_global_scrubbing'] ?? false) === true
            && ($ddosEdge['automatic_l3_l4_mitigation'] ?? false) === true
            && ($ddosEdge['automatic_l7_mitigation'] ?? false) === true
            && ($ddosEdge['managed_waf_rules'] ?? false) === true
            && ($origin['public_direct_access_disabled'] ?? false) === true
            && ($origin['public_dns_disclosure_prevented'] ?? false) === true
            && $this->isNonPlaceholder((string) ($identity['provider_header'] ?? ''))
            && ($identity['edge_strips_spoofed_headers'] ?? false) === true;
        $this->add(
            $checks,
            'edge.ddos_origin_boundary',
            $ddosReady,
            'The managed edge absorbs attacks and authenticates client identity before origin access.',
            'Always-on edge mitigation, origin isolation, and spoof-resistant client identity are required.',
        );

        $loadBalancerDormant = ! (bool) $this->config->get(
            'high_availability.load_balancer.enabled',
            false,
        ) && ! (bool) $this->config->get(
            'high_availability.load_balancer.automatic_failover',
            false,
        );
        $this->add(
            $checks,
            'standby.load_balancer',
            $loadBalancerDormant,
            'Load-balancer failover is honestly dormant on one application node.',
            'Single-node mode cannot advertise a load balancer or automatic node failover.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function recoveryChecks(array &$checks): void
    {
        $backup = (array) $this->config->get('disaster_recovery.backup', []);
        $backupReady = ($backup['enabled'] ?? false) === true
            && strtolower(trim((string) ($backup['scope'] ?? ''))) === 'database'
            && ($backup['encrypted'] ?? false) === true
            && ($backup['offsite'] ?? false) === true
            && ($backup['immutable'] ?? false) === true
            && (int) ($backup['retention_days'] ?? 0) >= (int) ($backup['minimum_retention_days'] ?? 35)
            && (int) ($backup['expected_interval_seconds'] ?? 0) > 0
            && (int) ($backup['expected_interval_seconds'] ?? 0) <= 86_400
            && (bool) $this->config->get('single_node.recovery.external_backup_runner', false);
        $this->add(
            $checks,
            'recovery.verified_offsite_backup',
            $backupReady,
            'Encrypted immutable database backups run daily outside the application process and leave the VPS.',
            'Daily encrypted, immutable, off-site database backup with an external runner is required.',
        );

        $pitr = (array) $this->config->get('disaster_recovery.pitr', []);
        $pitrReady = ($pitr['enabled'] ?? false) === true
            && ($pitr['continuous'] ?? false) === true
            && (int) ($pitr['retention_days'] ?? 0) >= (int) ($pitr['minimum_retention_days'] ?? 14)
            && (bool) $this->config->get('single_node.recovery.binlog_archiving', false);
        $this->add(
            $checks,
            'recovery.point_in_time',
            $pitrReady,
            'Continuous off-site binlog archiving provides point-in-time recovery.',
            'PITR and SINGLE_NODE_BINLOG_ARCHIVING must be enabled with at least 14 days retention.',
        );

        $drill = (array) $this->config->get('disaster_recovery.restore_drill', []);
        $drillReady = ($drill['enabled'] ?? false) === true
            && (int) ($drill['interval_days'] ?? 999) <= (int) ($drill['maximum_interval_days'] ?? 90)
            && ($drill['isolated_target_required'] ?? false) === true
            && ($drill['production_target_forbidden'] ?? false) === true;
        $this->add(
            $checks,
            'recovery.restore_drill',
            $drillReady,
            'Restore drills are required on an isolated non-production target.',
            'An isolated restore drill at least every 90 days is required.',
        );

        $this->add(
            $checks,
            'recovery.verified_backup_heartbeat',
            (bool) $this->config->get('monitoring.backup.enabled', false),
            'Monitoring requires an independently verified backup heartbeat.',
            'MONITORING_BACKUP_HEARTBEAT_ENABLED must be true.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function operationsChecks(array &$checks): void
    {
        $externalUrl = strtolower(trim((string) $this->config->get(
            'monitoring.external.check_url',
            '',
        )));
        $externalProvider = strtolower(trim((string) $this->config->get(
            'monitoring.external.provider',
            '',
        )));
        $ingestProvider = strtolower(trim((string) $this->config->get(
            'observability.external_sli.provider',
            '',
        )));
        $ingestKeys = (array) $this->config->get(
            'observability.external_sli.signing_keys',
            [],
        );
        $validIngestKeys = $ingestKeys !== []
            && ! array_is_list($ingestKeys)
            && collect($ingestKeys)->every(
                fn (mixed $secret, mixed $keyId): bool => is_string($keyId)
                    && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}\z/', $keyId) === 1
                    && is_string($secret)
                    && $this->isConfiguredSecret($secret),
            );
        $this->add(
            $checks,
            'monitoring.external_availability',
            (bool) $this->config->get('monitoring.enabled', false)
                && (bool) $this->config->get('monitoring.external.enabled', false)
                && $this->isPublicHttpsEndpoint($externalUrl)
                && $this->sameOrigin(
                    $externalUrl,
                    (string) $this->config->get('app.url'),
                )
                && $this->isNonPlaceholder($externalProvider)
                && hash_equals($externalProvider, $ingestProvider)
                && (bool) $this->config->get(
                    'observability.external_sli.ingest_enabled',
                    false,
                )
                && $validIngestKeys
                && (int) $this->config->get('monitoring.external.interval_seconds', 999) <= 300,
            'Signed independent monitoring checks the public HTTPS service at least every five minutes.',
            'External monitoring requires a real provider, same-origin HTTPS probe, signed ingest key, and interval of at most five minutes.',
        );

        $logProvider = strtolower(trim((string) $this->config->get(
            'observability.logs.provider',
            '',
        )));
        $configuredLogStack = $this->config->get('logging.channels.stack.channels', []);
        $logStack = array_map(
            static fn (mixed $channel): string => strtolower(trim((string) $channel)),
            is_array($configuredLogStack)
                ? $configuredLogStack
                : explode(',', (string) $configuredLogStack),
        );
        $this->add(
            $checks,
            'monitoring.off_host_logs',
            (bool) $this->config->get('observability.logs.off_host_export_enabled', false)
                && (bool) $this->config->get('observability.logs.structured_json', false)
                && $this->isNonPlaceholder($logProvider)
                && in_array(
                    (string) $this->config->get('observability.logs.required_channel', 'json_stderr'),
                    $logStack,
                    true,
                ),
            'Structured operational logs are exported off-host through the required channel.',
            'Configure a real off-host structured log provider and include json_stderr in LOG_STACK.',
        );

        $alertChannels = array_map(
            static fn (mixed $channel): string => strtolower(trim((string) $channel)),
            (array) $this->config->get('monitoring.alerting.channels', []),
        );
        $webhookUrl = strtolower(trim((string) $this->config->get(
            'monitoring.alerting.webhook.url',
            '',
        )));
        $this->add(
            $checks,
            'monitoring.off_host_alerts',
            in_array('webhook', $alertChannels, true)
                && $this->isPublicHttpsEndpoint($webhookUrl)
                && $this->isConfiguredSecret((string) $this->config->get(
                    'monitoring.alerting.webhook.secret',
                )),
            'Operational incidents have an authenticated off-host alert route.',
            'Configure an HTTPS monitoring webhook, independent secret, and webhook alert channel.',
        );

        $supervisorPath = trim((string) $this->config->get(
            'process_supervision.active_config_path',
            '',
        ));
        $this->add(
            $checks,
            'operations.process_supervision',
            (bool) $this->config->get('process_supervision.enforce', false)
                && str_starts_with($supervisorPath, '/')
                && $this->isNonPlaceholder($supervisorPath),
            'Supervisor is enforced through an explicit absolute artifact path.',
            'PROCESS_SUPERVISION_ENFORCE and an absolute PROCESS_SUPERVISOR_CONFIG_PATH are required.',
        );

        $required = array_map(
            static fn (mixed $value): string => strtolower(trim((string) $value)),
            (array) $this->config->get('monitoring.readiness.required_checks', []),
        );
        $deep = array_map(
            static fn (mixed $value): string => strtolower(trim((string) $value)),
            (array) $this->config->get('monitoring.readiness.deep_checks', []),
        );
        $this->add(
            $checks,
            'operations.readiness_coverage',
            in_array('database', $required, true)
                && in_array('cache', $required, true)
                && in_array('locks', $required, true)
                && in_array('queues', $deep, true)
                && in_array('storage', $deep, true),
            'Readiness covers database, cache, locks, queues, and persistent storage.',
            'Required checks must include database/cache/locks; deep checks must include queues/storage.',
        );

        $standby = ! (bool) $this->config->get('capacity_planning.enabled', false)
            && ! (bool) $this->config->get('resilience_drills.enabled', false);
        $this->add(
            $checks,
            'standby.multi_node_automation',
            $standby,
            'Autoscaling and multi-failure-domain drills remain dormant until multi_node activation.',
            'Capacity autoscaling and multi-node resilience drills must remain dormant on one VPS.',
        );
    }

    /** @param array<string, mixed> $definition */
    private function redisFingerprint(array $definition): ?string
    {
        $url = trim((string) ($definition['url'] ?? ''));
        $parts = $url === '' ? null : parse_url($url);
        if ($url !== '' && ! is_array($parts)) {
            return null;
        }

        $host = strtolower(trim((string) (is_array($parts)
            ? ($parts['host'] ?? $definition['host'] ?? '')
            : ($definition['host'] ?? ''))));
        $port = (string) (is_array($parts)
            ? ($parts['port'] ?? $definition['port'] ?? 6379)
            : ($definition['port'] ?? 6379));
        $database = is_array($parts) && isset($parts['path'])
            ? ltrim((string) $parts['path'], '/')
            : (string) ($definition['database'] ?? '');

        if ($host === '' || $port === '' || $database === '') {
            return null;
        }

        return hash('sha256', $host.'|'.$port.'|'.$database);
    }

    /** @param array<string, mixed> $definition */
    private function boundedRedisTransport(array $definition, bool $queue): bool
    {
        $connect = (float) ($definition['timeout'] ?? 0);
        $read = (float) ($definition['read_timeout'] ?? 0);
        $retries = (int) ($definition['max_retries'] ?? -1);
        $base = (int) ($definition['backoff_base'] ?? -1);
        $cap = (int) ($definition['backoff_cap'] ?? -1);

        return $connect > 0
            && $connect <= 10
            && $read > 0
            && $read <= ($queue ? 30 : 10)
            && $retries >= 0
            && $retries <= 5
            && $base >= 0
            && $cap >= $base
            && $cap <= 5_000;
    }

    /** @param array<string, mixed> $definition */
    private function redisHasAuthentication(array $definition): bool
    {
        if ($this->isConfiguredSecret((string) ($definition['password'] ?? ''))) {
            return true;
        }

        $url = trim((string) ($definition['url'] ?? ''));
        $parts = $url === '' ? null : parse_url($url);

        return is_array($parts)
            && $this->isConfiguredSecret((string) ($parts['pass'] ?? ''));
    }

    private function isNonPlaceholder(string $value): bool
    {
        $value = trim($value);

        return $value !== ''
            && preg_match(
                '/replace|example|placeholder|unknown|change[ _-]?me|your[ _-]|todo/i',
                $value,
            ) !== 1;
    }

    private function isConfiguredSecret(string $value): bool
    {
        $value = trim($value);

        return strlen($value) >= 16
            && $this->isNonPlaceholder($value)
            && preg_match(
                '/(?:^|[ _-])(?:test|testing|development|sample|dummy)(?:$|[ _-])/i',
                $value,
            ) !== 1;
    }

    private function isPublicHttpsEndpoint(string $value): bool
    {
        if (! $this->isNonPlaceholder($value)
            || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $parts = parse_url($value);
        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['fragment'])) {
            return false;
        }

        $host = strtolower(trim((string) ($parts['host'] ?? '')));

        return $this->isNonPlaceholder($host)
            && ! $this->isLocalOrPrivateHost($host);
    }

    private function sameOrigin(string $left, string $right): bool
    {
        $origin = static function (string $value): ?string {
            $parts = parse_url(strtolower(trim($value)));
            if (! is_array($parts)
                || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
                || trim((string) ($parts['host'] ?? '')) === '') {
                return null;
            }

            $port = isset($parts['port']) && (int) $parts['port'] !== 443
                ? ':'.(int) $parts['port']
                : '';

            return 'https://'.strtolower((string) $parts['host']).$port;
        };

        $leftOrigin = $origin($left);
        $rightOrigin = $origin($right);

        return $leftOrigin !== null
            && $rightOrigin !== null
            && hash_equals($leftOrigin, $rightOrigin);
    }

    private function isLocalOrPrivateHost(string $host): bool
    {
        if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            || str_ends_with($host, '.internal')) {
            return true;
        }

        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
            return false;
        }

        return filter_var(
            $host,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        ) === false;
    }

    /** @param array<string, mixed> $definition */
    private function encryptedObjectEndpoint(array $definition): bool
    {
        foreach (['endpoint', 'url'] as $key) {
            $value = strtolower(trim((string) ($definition[$key] ?? '')));
            if ($value !== '' && ! str_starts_with($value, 'https://')) {
                return false;
            }
        }

        return true;
    }

    private function normalizedPath(string $path): string
    {
        $path = str_replace('\\', '/', trim($path));

        return $path === '/' ? '/' : rtrim($path, '/');
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(
        array &$checks,
        string $code,
        bool $passed,
        string $passMessage,
        string $failMessage,
    ): void {
        $checks[] = [
            'code' => $code,
            'status' => $passed ? 'pass' : 'fail',
            'message' => $passed ? $passMessage : $failMessage,
        ];
    }
}
