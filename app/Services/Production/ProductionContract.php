<?php

namespace App\Services\Production;

use App\Exceptions\ProductionContractViolation;
use Illuminate\Contracts\Config\Repository;

final class ProductionContract
{
    public function __construct(private readonly Repository $config) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('production.enforce', false);
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
        $topology = strtolower(trim((string) $this->config->get('production.topology')));
        $instances = (int) $this->config->get('production.application_instances', 1);
        $environment = strtolower(trim((string) $this->config->get('app.env')));

        $this->add(
            $checks,
            'runtime.production_environment',
            $environment === 'production' ? 'pass' : 'fail',
            $environment === 'production'
                ? 'The resolved runtime environment is production.'
                : 'APP_ENV must resolve to [production] before a release may be activated.',
        );
        $this->add(
            $checks,
            'contract.enforcement',
            $this->shouldEnforce() ? 'pass' : 'fail',
            $this->shouldEnforce()
                ? 'The production runtime contract is enforced.'
                : 'PRODUCTION_CONTRACT_ENFORCE must be true for release activation.',
        );

        $this->add(
            $checks,
            'topology.multi_node',
            $topology === 'multi_node' ? 'pass' : 'fail',
            $topology === 'multi_node'
                ? 'The deployment explicitly targets a multi-node topology.'
                : 'PRODUCTION_TOPOLOGY must explicitly be [multi_node].',
        );
        $this->add(
            $checks,
            'topology.minimum_instances',
            $instances >= 2 ? 'pass' : 'fail',
            $instances >= 2
                ? 'At least two application instances are declared.'
                : 'PRODUCTION_APP_INSTANCES must be at least 2.',
        );

        $sessionDriver = strtolower((string) $this->config->get('session.driver'));
        $cacheStore = (string) $this->config->get('cache.default');
        $cacheDriver = strtolower((string) $this->config->get("cache.stores.{$cacheStore}.driver"));
        $queueConnection = (string) $this->config->get('queue.default');
        $queueDriver = strtolower((string) $this->config->get("queue.connections.{$queueConnection}.driver"));

        $this->sharedStateCheck(
            $checks,
            'session',
            $sessionDriver,
            (array) $this->config->get('production.shared_state.session_drivers', []),
            (string) $this->config->get('production.recommended.session_driver', 'redis'),
        );
        $this->sharedStateCheck(
            $checks,
            'cache',
            $cacheDriver,
            (array) $this->config->get('production.shared_state.cache_drivers', []),
            (string) $this->config->get('production.recommended.cache_driver', 'redis'),
        );
        $this->sharedStateCheck(
            $checks,
            'queue',
            $queueDriver,
            (array) $this->config->get('production.shared_state.queue_drivers', []),
            (string) $this->config->get('production.recommended.queue_driver', 'redis'),
        );

        $maintenanceDriver = strtolower((string) $this->config->get('app.maintenance.driver'));
        $maintenanceStore = (string) $this->config->get('app.maintenance.store');
        $maintenanceStoreDriver = strtolower((string) $this->config->get(
            "cache.stores.{$maintenanceStore}.driver",
        ));
        $sharedCacheDrivers = (array) $this->config->get(
            'production.shared_state.cache_drivers',
            [],
        );
        $maintenanceIsShared = $maintenanceDriver === 'cache'
            && in_array($maintenanceStoreDriver, $sharedCacheDrivers, true);
        $this->add(
            $checks,
            'maintenance.shared',
            $maintenanceIsShared ? 'pass' : 'fail',
            $maintenanceIsShared
                ? 'Maintenance state is coordinated through a shared cache store.'
                : 'APP_MAINTENANCE_DRIVER must be cache and APP_MAINTENANCE_STORE must resolve to a shared store.',
        );

        $afterCommit = (bool) $this->config->get(
            "queue.connections.{$queueConnection}.after_commit",
            false,
        );
        $this->add(
            $checks,
            'queue.after_commit',
            $afterCommit ? 'pass' : 'fail',
            $afterCommit
                ? 'Default queued work is dispatched only after database commit.'
                : 'The default durable queue must enable after_commit.',
        );

        foreach ((array) $this->config->get('production.durable_disks', []) as $label => $definition) {
            if (! is_string($label)) {
                continue;
            }

            $path = is_array($definition)
                ? (string) ($definition['path'] ?? '')
                : (string) $definition;
            $expectedVisibility = is_array($definition)
                ? (string) ($definition['visibility'] ?? '')
                : '';

            $this->durableDiskCheck($checks, $label, $path, $expectedVisibility);
        }

        $this->redisIsolationChecks(
            $checks,
            $sessionDriver,
            $cacheDriver,
            $cacheStore,
            $queueDriver,
            $queueConnection,
        );
        $this->queueBlockingTimeoutCheck($checks, $queueDriver, $queueConnection);

        $release = trim((string) $this->config->get('monitoring.release'));
        $validRelease = preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._:-]{6,127}\z/', $release) === 1
            && preg_match('/replace|example|unknown|latest|placeholder/i', $release) !== 1;
        $this->add(
            $checks,
            'release.identity',
            $validRelease ? 'pass' : 'fail',
            $validRelease
                ? 'A valid immutable release identifier is configured.'
                : 'APP_RELEASE must be a non-placeholder immutable release identifier.',
        );

        $externalMonitoring = (bool) $this->config->get('monitoring.external.enabled', false);
        $externalUrl = (string) $this->config->get('monitoring.external.check_url', '');
        $externalReady = $externalMonitoring
            && str_starts_with(strtolower($externalUrl), 'https://');
        $this->add(
            $checks,
            'monitoring.external',
            $externalReady ? 'pass' : 'warning',
            $externalReady
                ? 'Independent HTTPS availability monitoring is declared.'
                : 'Independent external availability monitoring is not fully configured.',
        );

        $requiredReadiness = array_map(
            static fn (mixed $value): string => strtolower(trim((string) $value)),
            (array) $this->config->get('monitoring.readiness.required_checks', []),
        );
        $requiredReadinessIsSafe = in_array('database', $requiredReadiness, true)
            && in_array('cache', $requiredReadiness, true)
            && in_array('locks', $requiredReadiness, true);
        $this->add(
            $checks,
            'readiness.critical_dependencies',
            $requiredReadinessIsSafe ? 'pass' : 'fail',
            $requiredReadinessIsSafe
                ? 'Readiness gates traffic on database, shared cache, and distributed coordination.'
                : 'Readiness required checks must contain database, cache, and locks.',
        );

        $deepReadiness = array_map(
            static fn (mixed $value): string => strtolower(trim((string) $value)),
            (array) $this->config->get('monitoring.readiness.deep_checks', []),
        );
        $deepReadinessIsComplete = in_array('queues', $deepReadiness, true)
            && in_array('storage', $deepReadiness, true);
        $this->add(
            $checks,
            'readiness.deep_dependencies',
            $deepReadinessIsComplete ? 'pass' : 'fail',
            $deepReadinessIsComplete
                ? 'Strict deployment probes include queue and shared object storage.'
                : 'Readiness deep checks must contain queues and storage.',
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

        $codes = array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));

        throw ProductionContractViolation::fromCodes($codes);
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function sharedStateCheck(
        array &$checks,
        string $component,
        string $driver,
        array $allowed,
        string $recommended,
    ): void {
        if (! in_array($driver, $allowed, true)) {
            $this->add(
                $checks,
                "state.{$component}",
                'fail',
                ucfirst($component)." driver [{$driver}] is node-local, ephemeral, or unsupported.",
            );

            return;
        }

        $this->add(
            $checks,
            "state.{$component}",
            $driver === $recommended ? 'pass' : 'warning',
            $driver === $recommended
                ? ucfirst($component)." uses the recommended shared [{$driver}] driver."
                : ucfirst($component)." is shared through [{$driver}], but [{$recommended}] is recommended before sustained multi-node traffic.",
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function durableDiskCheck(
        array &$checks,
        string $label,
        string $configPath,
        string $expectedVisibility,
    ): void {
        $disk = trim((string) $this->config->get($configPath));
        $driver = strtolower((string) $this->config->get("filesystems.disks.{$disk}.driver"));
        $allowedDrivers = (array) $this->config->get(
            'production.shared_state.durable_disk_drivers',
            [],
        );
        $shared = $disk !== '' && in_array($driver, $allowedDrivers, true);
        $bucket = trim((string) $this->config->get("filesystems.disks.{$disk}.bucket"));
        $throws = (bool) $this->config->get("filesystems.disks.{$disk}.throw", false);
        $connectTimeout = (float) $this->config->get(
            "filesystems.disks.{$disk}.http.connect_timeout",
            0,
        );
        $requestTimeout = (float) $this->config->get(
            "filesystems.disks.{$disk}.http.timeout",
            0,
        );
        $retries = (int) $this->config->get("filesystems.disks.{$disk}.retries", -1);
        $visibility = strtolower(trim((string) $this->config->get(
            "filesystems.disks.{$disk}.visibility",
        )));
        $visibilityIsSafe = $expectedVisibility === ''
            || hash_equals(strtolower($expectedVisibility), $visibility);
        $endpoint = trim((string) $this->config->get("filesystems.disks.{$disk}.endpoint"));
        $publicUrl = trim((string) $this->config->get("filesystems.disks.{$disk}.url"));
        $transportIsEncrypted = ($endpoint === '' || str_starts_with(strtolower($endpoint), 'https://'))
            && ($publicUrl === '' || str_starts_with(strtolower($publicUrl), 'https://'));
        $boundedTransport = $connectTimeout > 0
            && $connectTimeout <= 10
            && $requestTimeout >= $connectTimeout
            && $requestTimeout <= 30
            && $retries >= 0
            && $retries <= 4;
        $valid = $shared
            && $bucket !== ''
            && $throws
            && $boundedTransport
            && $visibilityIsSafe
            && $transportIsEncrypted;

        $this->add(
            $checks,
            "storage.{$label}",
            $valid ? 'pass' : 'fail',
            $valid
                ? "Durable storage [{$label}] uses a shared, fail-loud object disk."
                : "Durable storage [{$label}] must use shared TLS object storage with explicit visibility, throw=true, and bounded transport timeouts/retries.",
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function redisIsolationChecks(
        array &$checks,
        string $sessionDriver,
        string $cacheDriver,
        string $cacheStore,
        string $queueDriver,
        string $queueConnection,
    ): void {
        $connections = [];

        if ($sessionDriver === 'redis') {
            $connections['session'] = (string) ($this->config->get('session.connection') ?: 'default');
        }
        if ($cacheDriver === 'redis') {
            $connections['cache'] = (string) $this->config->get(
                "cache.stores.{$cacheStore}.connection",
                'cache',
            );
            $connections['coordination'] = (string) $this->config->get(
                "cache.stores.{$cacheStore}.lock_connection",
                '',
            );
        }
        if ($queueDriver === 'redis') {
            $connections['queue'] = (string) $this->config->get(
                "queue.connections.{$queueConnection}.connection",
                'default',
            );
        }

        $fingerprints = [];
        foreach ($connections as $component => $connection) {
            $fingerprints[$component] = $this->redisEndpointFingerprint($connection);
        }

        $unresolved = array_keys(array_filter(
            $fingerprints,
            static fn (?string $fingerprint): bool => $fingerprint === null,
        ));
        $this->add(
            $checks,
            'redis.connections_resolve',
            $unresolved === [] ? 'pass' : 'fail',
            $unresolved === []
                ? 'Every selected Redis workload resolves to a configured connection.'
                : 'Redis connection configuration is missing for: '.implode(', ', $unresolved).'.',
        );

        $unbounded = array_keys(array_filter(
            $connections,
            fn (string $connection): bool => ! $this->redisTransportIsBounded($connection),
        ));
        $this->add(
            $checks,
            'redis.transport_bounds',
            $unbounded === [] ? 'pass' : 'fail',
            $unbounded === []
                ? 'Every selected Redis workload has bounded timeouts, retries, and backoff.'
                : 'Redis transport bounds are missing or unsafe for: '.implode(', ', $unbounded).'.',
        );

        $collision = false;
        $components = array_keys($fingerprints);
        for ($left = 0; $left < count($components); $left++) {
            for ($right = $left + 1; $right < count($components); $right++) {
                $leftFingerprint = $fingerprints[$components[$left]];
                $rightFingerprint = $fingerprints[$components[$right]];

                if ($leftFingerprint !== null
                    && $rightFingerprint !== null
                    && hash_equals($leftFingerprint, $rightFingerprint)) {
                    $collision = true;
                }
            }
        }

        $this->add(
            $checks,
            'redis.workload_isolation',
            $collision ? 'fail' : 'pass',
            $collision
                ? 'Session, cache, queue, and coordination Redis workloads must not share one logical endpoint/database.'
                : 'Configured Redis workloads use isolated logical endpoints/databases.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function queueBlockingTimeoutCheck(
        array &$checks,
        string $queueDriver,
        string $queueConnection,
    ): void {
        if ($queueDriver !== 'redis') {
            return;
        }

        $redisConnection = (string) $this->config->get(
            "queue.connections.{$queueConnection}.connection",
            '',
        );
        $blockFor = (float) $this->config->get(
            "queue.connections.{$queueConnection}.block_for",
            0,
        );
        $readTimeout = (float) $this->config->get(
            "database.redis.{$redisConnection}.read_timeout",
            0,
        );
        $safe = $blockFor >= 1
            && $readTimeout > $blockFor
            && $readTimeout <= 30;

        $this->add(
            $checks,
            'queue.redis_blocking_timeout',
            $safe ? 'pass' : 'fail',
            $safe
                ? 'Redis queue socket timeout exceeds the blocking-pop interval.'
                : 'REDIS_QUEUE_READ_TIMEOUT_SECONDS must be greater than REDIS_QUEUE_BLOCK_FOR and no more than 30 seconds.',
        );
    }

    private function redisEndpointFingerprint(string $connection): ?string
    {
        $configuration = $this->config->get("database.redis.{$connection}");

        if (! is_array($configuration)) {
            return null;
        }

        $url = trim((string) ($configuration['url'] ?? ''));
        $urlParts = $url !== '' ? parse_url($url) : null;

        if ($url !== '' && ! is_array($urlParts)) {
            return null;
        }

        $urlDatabase = is_array($urlParts)
            ? ltrim((string) ($urlParts['path'] ?? ''), '/')
            : '';

        $host = is_array($urlParts)
            ? strtolower((string) ($urlParts['host'] ?? ''))
            : strtolower((string) ($configuration['host'] ?? ''));
        $port = is_array($urlParts)
            ? (string) ($urlParts['port'] ?? '6379')
            : (string) ($configuration['port'] ?? '6379');
        $database = $urlDatabase !== ''
            ? $urlDatabase
            : (string) ($configuration['database'] ?? '');

        if ($host === '' || $port === '' || $database === '') {
            return null;
        }

        return hash('sha256', json_encode([
            // Credentials are deliberately excluded from the identity. Two
            // components still collide when they reach the same logical DB
            // with different usernames or rotated passwords.
            'host' => $host,
            'port' => $port,
            'database' => $database,
        ], JSON_THROW_ON_ERROR));
    }

    private function redisTransportIsBounded(string $connection): bool
    {
        $configuration = $this->config->get("database.redis.{$connection}");

        if (! is_array($configuration)) {
            return false;
        }

        $connectTimeout = (float) ($configuration['timeout'] ?? 0);
        $readTimeout = (float) ($configuration['read_timeout'] ?? 0);
        $retries = (int) ($configuration['max_retries'] ?? -1);
        $backoffBase = (int) ($configuration['backoff_base'] ?? -1);
        $backoffCap = (int) ($configuration['backoff_cap'] ?? -1);

        return $connectTimeout > 0
            && $connectTimeout <= 10
            && $readTimeout > 0
            && $readTimeout <= 10
            && $retries >= 0
            && $retries <= 5
            && $backoffBase >= 0
            && $backoffBase <= $backoffCap
            && $backoffCap <= 5_000;
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
