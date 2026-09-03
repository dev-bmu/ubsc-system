<?php

namespace App\Services\Production;

use App\Exceptions\DatabaseReplicationContractViolation;
use Illuminate\Contracts\Config\Repository;

final class DatabaseReplicationContract
{
    public function __construct(
        private readonly Repository $config,
        private readonly DatabaseReplicationAttestationVerifier $attestations,
    ) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('database_replication.enforce', false);
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

        $this->check(
            $checks,
            'contract.enforcement',
            $this->shouldEnforce(),
            'The database-replication release contract is enforced.',
            'DATABASE_REPLICATION_CONTRACT_ENFORCE must be true in production.',
        );
        $this->check(
            $checks,
            'replication.enabled',
            (bool) $this->config->get('database_replication.enabled', false),
            'Managed database replication is explicitly declared.',
            'DB_REPLICATION_ENABLED must be true after provider replication is provisioned.',
        );

        $this->targetChecks($checks);
        $this->topologyChecks($checks);
        $this->connectionChecks($checks);
        $this->telemetryChecks($checks);
        $this->keyChecks($checks);

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

        throw DatabaseReplicationContractViolation::fromCodes(array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        )));
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function targetChecks(array &$checks): void
    {
        $keys = [
            'provider',
            'cluster_id',
            'dataset_id',
            'environment',
            'primary_region',
            'writer_endpoint_id',
            'reader_endpoint_id',
            'independent_observer',
        ];
        $values = collect($keys)->mapWithKeys(fn (string $key): array => [
            $key => (string) $this->config->get('database_replication.target.'.$key, ''),
        ])->all();
        $valid = collect($values)->every(fn (string $value): bool => $this->identifier($value))
            && ! hash_equals($values['writer_endpoint_id'], $values['reader_endpoint_id'])
            && ! in_array($values['independent_observer'], [
                $values['provider'],
                $values['cluster_id'],
                $values['dataset_id'],
                $values['environment'],
                $values['primary_region'],
                $values['writer_endpoint_id'],
                $values['reader_endpoint_id'],
            ], true);
        $this->check(
            $checks,
            'target.bound_identity',
            $valid,
            'Replication evidence is bound to exact opaque provider, cluster, endpoint, and observer identities.',
            'Configure every DB_REPLICATION target identity without placeholders.',
        );

        $recoveryProvider = (string) $this->config->get('disaster_recovery.target.provider', '');
        $recoveryDataset = (string) $this->config->get('disaster_recovery.target.dataset_id', '');
        $recoveryRegion = (string) $this->config->get('disaster_recovery.target.primary_region', '');
        $aligned = $recoveryProvider !== ''
            && $recoveryDataset !== ''
            && $recoveryRegion !== ''
            && hash_equals(strtolower($recoveryProvider), strtolower($values['provider']))
            && hash_equals(strtolower($recoveryDataset), strtolower($values['dataset_id']))
            && hash_equals(strtolower($recoveryRegion), strtolower($values['primary_region']));
        $this->check(
            $checks,
            'target.recovery_alignment',
            $aligned,
            'Replication and disaster recovery are bound to the same production dataset.',
            'Replication provider, dataset, and primary region must match the recovery contract.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function topologyChecks(array &$checks): void
    {
        $managed = (bool) $this->config->get('database_replication.topology.managed_service', false);
        $mode = (string) $this->config->get('database_replication.topology.mode', '');
        $allowedModes = (array) $this->config->get(
            'database_replication.topology.allowed_modes',
            [],
        );
        $this->check(
            $checks,
            'topology.managed_mode',
            $managed && in_array($mode, $allowedModes, true),
            'Provider-managed synchronous or semisynchronous replication is declared.',
            'Use provider-managed synchronous or semisynchronous replication for the HA standby.',
        );

        $singleWriter = (bool) $this->config->get(
            'database_replication.topology.single_writer',
            false,
        );
        $automaticFailover = (bool) $this->config->get(
            'database_replication.topology.automatic_failover',
            false,
        );
        $automaticFailback = (bool) $this->config->get(
            'database_replication.topology.automatic_failback',
            true,
        );
        $this->check(
            $checks,
            'topology.single_writer',
            $singleWriter && $automaticFailover && ! $automaticFailback,
            'One writer is enforced; failover is automatic and failback remains controlled.',
            'Require single-writer automatic failover and forbid automatic failback.',
        );

        $zones = (int) $this->config->get(
            'database_replication.topology.minimum_availability_zones',
            1,
        );
        $replicas = (int) $this->config->get(
            'database_replication.topology.minimum_replicas',
            0,
        );
        $syncReplicas = (int) $this->config->get(
            'database_replication.topology.minimum_synchronous_replicas',
            0,
        );
        $this->check(
            $checks,
            'topology.failure_domains',
            $zones >= 2 && $replicas >= 1 && $syncReplicas >= 1 && $syncReplicas <= $replicas,
            'The writer has at least one synchronous standby in another availability zone.',
            'Require at least two AZs, one replica, and one synchronous replica.',
        );

        $quorum = (bool) $this->config->get(
            'database_replication.topology.quorum_required',
            false,
        );
        $fencing = (bool) $this->config->get(
            'database_replication.topology.stale_writer_fencing_required',
            false,
        );
        $catchup = (bool) $this->config->get(
            'database_replication.topology.promotion_catchup_required',
            false,
        );
        $maximumDataLoss = (int) $this->config->get(
            'database_replication.topology.maximum_data_loss_bytes',
            -1,
        );
        $this->check(
            $checks,
            'topology.split_brain_fencing',
            $quorum && $fencing && $catchup && $maximumDataLoss === 0,
            'Quorum, stale-writer fencing, caught-up promotion, and zero declared data loss are mandatory.',
            'Enable quorum/fencing/catch-up controls and set maximum failover data loss to zero.',
        );

        $rto = (int) $this->config->get(
            'database_replication.topology.failover_rto_seconds',
            0,
        );
        $maximumRto = (int) $this->config->get(
            'database_replication.topology.maximum_failover_rto_seconds',
            120,
        );
        $this->check(
            $checks,
            'topology.failover_objective',
            $rto > 0 && $rto <= $maximumRto,
            'Database writer failover has a bounded service restoration target.',
            "DB_REPLICATION_FAILOVER_RTO_SECONDS must be between 1 and {$maximumRto}.",
        );

        $gtid = (bool) $this->config->get('database_replication.engine.gtid_required', false);
        $rowBinlog = (bool) $this->config->get(
            'database_replication.engine.row_binlog_required',
            false,
        );
        $readOnly = (bool) $this->config->get(
            'database_replication.engine.replica_read_only_required',
            false,
        );
        $this->check(
            $checks,
            'engine.replication_safety',
            $gtid && $rowBinlog && $readOnly,
            'GTID, row-based binary logging, and read-only replicas are mandatory.',
            'Enable GTID, row-based binlog, and server-enforced replica read-only mode.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function connectionChecks(array &$checks): void
    {
        $default = trim((string) $this->config->get('database.default', ''));
        $connection = $this->config->get('database.connections.'.$default);
        $connection = is_array($connection) ? $connection : [];
        $driver = strtolower(trim((string) ($connection['driver'] ?? '')));
        $host = $this->host($connection);
        $writerOnly = ! isset($connection['read']) || (array) $connection['read'] === [];
        $this->check(
            $checks,
            'connection.transactional_writer',
            in_array($driver, ['mysql', 'mariadb'], true)
                && $this->stableHost($host)
                && $writerOnly,
            'The transactional connection uses one stable MySQL/MariaDB writer endpoint.',
            'Keep the default transactional connection writer-only on a stable managed DNS endpoint.',
        );

        $tlsRequired = (bool) $this->config->get(
            'database_replication.engine.tls_required',
            false,
        );
        $verifyPeer = (bool) $this->config->get(
            'database_replication.engine.tls_verify_peer',
            false,
        );
        $this->check(
            $checks,
            'connection.verified_tls',
            $tlsRequired && $verifyPeer && $this->mysqlTlsConfigured($connection),
            'Writer and replication declarations require verified TLS.',
            'Mount the provider CA and enable database TLS peer verification.',
        );

        $readEnabled = (bool) $this->config->get(
            'database_replication.application_reads.enabled',
            false,
        );
        if (! $readEnabled) {
            $this->add(
                $checks,
                'connection.replica_read_policy',
                'pass',
                'Application replica reads are disabled; all consistency-sensitive reads stay on the writer.',
            );

            return;
        }

        $replicaName = (string) $this->config->get(
            'database_replication.application_reads.connection',
            '',
        );
        $replica = $this->config->get('database.connections.'.$replicaName);
        $replica = is_array($replica) ? $replica : [];
        $replicaHost = $this->host($replica);
        $fallback = (bool) $this->config->get(
            'database_replication.application_reads.fallback_to_writer',
            false,
        );
        $causalWindow = (int) $this->config->get(
            'database_replication.application_reads.read_after_write_seconds',
            0,
        );
        $safe = in_array(strtolower((string) ($replica['driver'] ?? '')), ['mysql', 'mariadb'], true)
            && $this->stableHost($replicaHost)
            && ! hash_equals(strtolower($host), strtolower($replicaHost))
            && (bool) ($replica['read_only'] ?? false)
            && $fallback
            && $causalWindow >= 1
            && $causalWindow <= 300
            && $this->mysqlTlsConfigured($replica);
        $this->check(
            $checks,
            'connection.replica_read_policy',
            $safe,
            'Optional eventual reads use a distinct read-only endpoint with writer fallback and a causal window.',
            'Replica reads require a distinct TLS read-only connection, writer fallback, and read-after-write protection.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function telemetryChecks(array &$checks): void
    {
        $warning = (int) $this->config->get(
            'database_replication.observation.warning_after_seconds',
            0,
        );
        $outage = (int) $this->config->get(
            'database_replication.observation.outage_after_seconds',
            0,
        );
        $this->check(
            $checks,
            'telemetry.freshness',
            (bool) $this->config->get('database_replication.observation.enabled', false)
                && $warning >= 30
                && $warning <= 120
                && $outage > $warning
                && $outage <= 300,
            'Independent topology evidence becomes degraded within two minutes and unavailable within five.',
            'Enable signed replication observations with warning <=120s and outage <=300s.',
        );

        $lagWarning = (int) $this->config->get('database_replication.lag.warning_ms', 0);
        $lagOutage = (int) $this->config->get('database_replication.lag.outage_ms', 0);
        $this->check(
            $checks,
            'telemetry.lag_boundaries',
            $lagWarning >= 100
                && $lagWarning <= 5_000
                && $lagOutage > $lagWarning
                && $lagOutage <= 30_000,
            'Replication lag has strict warning and outage boundaries.',
            'Set a warning between 100-5000ms and a larger outage boundary no higher than 30000ms.',
        );

        $ledgerWarning = (int) $this->config->get(
            'database_replication.ledger.verification_warning_after_seconds',
            0,
        );
        $ledgerOutage = (int) $this->config->get(
            'database_replication.ledger.verification_outage_after_seconds',
            0,
        );
        $this->check(
            $checks,
            'telemetry.ledger_cadence',
            $ledgerWarning >= 3_600
                && $ledgerWarning <= 7_200
                && $ledgerOutage > $ledgerWarning
                && $ledgerOutage <= 14_400,
            'Hourly ledger verification becomes visible before four silent hours.',
            'Replication ledger verification warning/outage must remain within 2h/4h.',
        );
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function keyChecks(array &$checks): void
    {
        $attestationRequired = (bool) $this->config->get(
            'database_replication.attestation.required',
            false,
        );
        $this->check(
            $checks,
            'attestation.independent_source',
            $attestationRequired && $this->attestations->hasValidActiveKeyConfiguration(),
            'Replication topology is accepted only from active independent public-key attestations.',
            'Require replication attestation and configure active public verification keys.',
        );

        $active = (string) $this->config->get(
            'database_replication.ledger.active_key_id',
            '',
        );
        $keys = $this->config->get('database_replication.ledger.signing_keys', []);
        $minimum = (int) $this->config->get(
            'database_replication.ledger.minimum_key_bytes',
            32,
        );
        $decodedKeys = [];
        $valid = preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $active) === 1
            && is_array($keys)
            && $keys !== []
            && count($keys) <= 16
            && array_key_exists($active, $keys);
        if (is_array($keys)) {
            foreach ($keys as $keyId => $configured) {
                $decoded = $this->decodedSecret($configured);
                $keyValid = is_string($keyId)
                    && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,31}\z/', $keyId) === 1
                    && is_string($decoded)
                    && strlen($decoded) >= $minimum
                    && strlen($decoded) <= 128
                    && preg_match('/replace|example|placeholder|secret-manager/i', $decoded) !== 1
                    && count(array_unique(unpack('C*', $decoded) ?: [])) >= 8;
                $valid = $valid && $keyValid;
                if ($keyValid) {
                    $decodedKeys[] = $decoded;
                }
            }
        }
        $this->check(
            $checks,
            'ledger.signing_keyring',
            $valid,
            'A dedicated replication event-ledger key ring is configured.',
            'Configure an independent 32-byte minimum replication ledger key in the secret manager.',
        );

        $unique = $valid
            && count(array_unique($decodedKeys, SORT_STRING)) === count($decodedKeys);
        $this->check(
            $checks,
            'ledger.unique_key_material',
            $unique,
            'Every replication ledger key ID resolves to distinct key material.',
            'Replication key rotation must use distinct secret material for every key ID.',
        );
        $otherSecrets = $this->otherApplicationSecrets();
        $independent = $unique && collect($decodedKeys)->every(
            static fn (string $ledgerSecret): bool => collect($otherSecrets)->every(
                static fn (string $otherSecret): bool => ! hash_equals(
                    $ledgerSecret,
                    $otherSecret,
                ),
            ),
        );
        $this->check(
            $checks,
            'ledger.key_independence',
            $independent,
            'The replication ledger key is not reused by another application trust domain.',
            'Generate a dedicated replication ledger key; never reuse APP_KEY or another signing/integrity secret.',
        );
    }

    /** @param array<string, mixed> $connection */
    private function host(array $connection): string
    {
        $url = trim((string) ($connection['url'] ?? ''));
        if ($url !== '') {
            $parsed = parse_url($url);

            return is_array($parsed) ? strtolower((string) ($parsed['host'] ?? '')) : '';
        }

        $host = $connection['host'] ?? '';
        if (is_array($host)) {
            $host = $host[0] ?? '';
        }

        return strtolower(trim((string) $host));
    }

    private function stableHost(string $host): bool
    {
        $host = rtrim(strtolower(trim($host, " \t\n\r\0\x0B[]")), '.');

        return $host !== ''
            && str_contains($host, '.')
            && filter_var($host, FILTER_VALIDATE_IP) === false
            && filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false
            && ! str_ends_with($host, '.local')
            && preg_match('/replace|example|unknown|placeholder|localhost|local-only/i', $host) !== 1;
    }

    private function decodedSecret(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        $decoded = str_starts_with($value, 'base64:')
            ? base64_decode(substr($value, 7), true)
            : $value;

        return is_string($decoded) && $decoded !== '' ? $decoded : null;
    }

    /** @return list<string> */
    private function otherApplicationSecrets(): array
    {
        $secrets = [];
        foreach ([
            'app.key',
            'security.admin_mfa.recovery_pepper',
            'passkeys.user_handle_secret',
            'monitoring.alerts.webhook.secret',
        ] as $path) {
            $secret = $this->decodedSecret($this->config->get($path));
            if ($secret !== null) {
                $secrets[] = $secret;
            }
        }

        $previousAppKeys = $this->config->get('app.previous_keys', []);
        if (is_array($previousAppKeys)) {
            foreach ($previousAppKeys as $value) {
                $secret = $this->decodedSecret($value);
                if ($secret !== null) {
                    $secrets[] = $secret;
                }
            }
        }

        foreach ([
            'data_audit.integrity_keys',
            'disaster_recovery.evidence.signing_keys',
            'observability.external_sli.signing_keys',
            'resilience_drills.ledger.signing_keys',
            'capacity_planning.observation.signing_keys',
            'capacity_planning.evidence.signing_keys',
            'capacity_planning.plan.signing_keys',
        ] as $path) {
            $configured = $this->config->get($path, []);
            if (! is_array($configured)) {
                continue;
            }
            foreach ($configured as $value) {
                $secret = $this->decodedSecret($value);
                if ($secret !== null) {
                    $secrets[] = $secret;
                }
            }
        }

        return array_values(array_unique($secrets, SORT_STRING));
    }

    /** @param array<string, mixed> $connection */
    private function mysqlTlsConfigured(array $connection): bool
    {
        $options = is_array($connection['options'] ?? null) ? $connection['options'] : [];
        $caAttribute = PHP_VERSION_ID >= 80500 && defined('Pdo\\Mysql::ATTR_SSL_CA')
            ? constant('Pdo\\Mysql::ATTR_SSL_CA')
            : (defined('PDO::MYSQL_ATTR_SSL_CA') ? constant('PDO::MYSQL_ATTR_SSL_CA') : null);
        $verifyAttribute = PHP_VERSION_ID >= 80500
            && defined('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')
            ? constant('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')
            : (defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')
                ? constant('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')
                : null);

        return $caAttribute !== null
            && $verifyAttribute !== null
            && is_string($options[$caAttribute] ?? null)
            && trim((string) $options[$caAttribute]) !== ''
            && ($options[$verifyAttribute] ?? false) === true;
    }

    private function identifier(string $value): bool
    {
        return strlen($value) >= 3
            && strlen($value) <= 100
            && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]*\z/', $value) === 1
            && preg_match('/replace|example|placeholder|unknown|localhost|local-only/i', $value) !== 1;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function check(
        array &$checks,
        string $code,
        bool $valid,
        string $success,
        string $failure,
    ): void {
        $this->add($checks, $code, $valid ? 'pass' : 'fail', $valid ? $success : $failure);
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }
}
