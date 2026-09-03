<?php

namespace App\Services\Production;

use App\Exceptions\DisasterRecoveryContractViolation;
use Illuminate\Contracts\Config\Repository;

final class DisasterRecoveryContract
{
    public function __construct(
        private readonly Repository $config,
        private readonly RecoveryAttestationVerifier $attestations,
        private readonly RecoveryEvidenceKeyring $keyring,
    ) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('disaster_recovery.enforce', false);
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
                ? 'The disaster-recovery contract is enforced.'
                : 'DISASTER_RECOVERY_CONTRACT_ENFORCE must be true in production.',
        );

        $provider = strtolower(trim((string) $this->config->get(
            'disaster_recovery.target.provider',
            '',
        )));
        $dataset = strtolower(trim((string) $this->config->get(
            'disaster_recovery.target.dataset_id',
            '',
        )));
        $primaryRegion = strtolower(trim((string) $this->config->get(
            'disaster_recovery.target.primary_region',
            '',
        )));
        $recoveryRegion = strtolower(trim((string) $this->config->get(
            'disaster_recovery.target.recovery_region',
            '',
        )));
        $destination = strtolower(trim((string) $this->config->get(
            'disaster_recovery.target.backup_destination_id',
            '',
        )));
        $verifier = strtolower(trim((string) $this->config->get(
            'disaster_recovery.target.independent_verifier',
            '',
        )));
        $targetValid = $this->boundedIdentity($provider)
            && $this->boundedIdentity($dataset)
            && $this->boundedIdentity($primaryRegion)
            && $this->boundedIdentity($recoveryRegion)
            && $this->boundedIdentity($destination)
            && $this->boundedIdentity($verifier)
            && ! hash_equals($primaryRegion, $recoveryRegion);
        $this->add(
            $checks,
            'target.identity',
            $targetValid ? 'pass' : 'fail',
            $targetValid
                ? 'Recovery evidence is bound to an explicit dataset, provider, independent verifier, destination, and distinct regions.'
                : 'Configure bounded recovery identities and distinct primary/recovery regions without placeholders.',
        );
        $targetIdentities = [
            $provider,
            $dataset,
            $primaryRegion,
            $recoveryRegion,
            $destination,
            $verifier,
        ];
        $independentTargets = $targetValid
            && count(array_unique($targetIdentities, SORT_STRING)) === count($targetIdentities);
        $this->add(
            $checks,
            'target.independence',
            $independentTargets ? 'pass' : 'fail',
            $independentTargets
                ? 'Recovery provider, dataset, regions, vault, and verifier use distinct identities.'
                : 'Use distinct identities for the provider, dataset, regions, backup vault, and independent verifier.',
        );

        $rpo = (int) $this->config->get('disaster_recovery.objectives.rpo_seconds', 0);
        $rto = (int) $this->config->get('disaster_recovery.objectives.rto_seconds', 0);
        $objectivesValid = $rpo >= 1 && $rpo <= 300 && $rto >= 60 && $rto <= 3_600;
        $this->add(
            $checks,
            'objectives.bounded',
            $objectivesValid ? 'pass' : 'fail',
            $objectivesValid
                ? "Recovery objectives are bounded at RPO {$rpo}s and RTO {$rto}s."
                : 'Recovery objectives must declare RPO <= 300 seconds and RTO <= 3600 seconds.',
        );

        $expectedInterval = (int) $this->config->get(
            'disaster_recovery.backup.expected_interval_seconds',
            86_400,
        );
        $warningAfter = (int) $this->config->get(
            'monitoring.backup.warning_after_seconds',
            108_000,
        );
        $outageAfter = (int) $this->config->get(
            'monitoring.backup.outage_after_seconds',
            172_800,
        );
        $cadenceValid = $expectedInterval >= 3_600
            && $expectedInterval <= 172_800
            && $warningAfter > $expectedInterval
            && $outageAfter > $warningAfter
            && $outageAfter <= $expectedInterval * 2;
        $this->add(
            $checks,
            'backup.cadence',
            $cadenceValid ? 'pass' : 'fail',
            $cadenceValid
                ? 'Backup warning and outage windows are bounded around the declared production cadence.'
                : 'Backup freshness windows must detect a missed run before two expected intervals elapse.',
        );

        $pitrRetention = (int) $this->config->get('disaster_recovery.pitr.retention_days', 0);
        $pitrMinimum = (int) $this->config->get(
            'disaster_recovery.pitr.minimum_retention_days',
            14,
        );
        $pitrValid = (bool) $this->config->get('disaster_recovery.pitr.enabled', false)
            && (bool) $this->config->get('disaster_recovery.pitr.provider_managed', false)
            && (bool) $this->config->get('disaster_recovery.pitr.continuous', false)
            && $pitrRetention >= $pitrMinimum;
        $this->add(
            $checks,
            'pitr.capability',
            $pitrValid ? 'pass' : 'fail',
            $pitrValid
                ? "Provider-managed continuous PITR retains at least {$pitrRetention} days."
                : "Enable provider-managed continuous PITR with at least {$pitrMinimum} days of retention.",
        );

        $attestationRequired = (bool) $this->config->get(
            'disaster_recovery.attestation.required',
            false,
        );
        $attestationValid = $attestationRequired
            && $this->attestations->hasValidActiveKeyConfiguration();
        $this->add(
            $checks,
            'evidence.external_attestation',
            $attestationValid ? 'pass' : 'fail',
            $attestationValid
                ? 'New recovery evidence requires an independently signed attestation from an active public-key identity.'
                : 'Require independently signed recovery attestations and configure active public verification keys.',
        );

        $pitrObserved = (bool) $this->config->get(
            'disaster_recovery.pitr.observation_enabled',
            false,
        );
        $this->add(
            $checks,
            'pitr.observation',
            $pitrObserved ? 'pass' : 'fail',
            $pitrObserved
                ? 'The provider latest-restorable-time signal is required and monitored.'
                : 'DB_PITR_OBSERVATION_ENABLED must be true after provider telemetry is connected.',
        );

        $backupRetention = (int) $this->config->get(
            'disaster_recovery.backup.retention_days',
            0,
        );
        $backupMinimum = (int) $this->config->get(
            'disaster_recovery.backup.minimum_retention_days',
            35,
        );
        $lockMode = (string) $this->config->get(
            'disaster_recovery.backup.object_lock_mode',
            '',
        );
        $backupValid = (bool) $this->config->get('disaster_recovery.backup.enabled', false)
            && (string) $this->config->get('disaster_recovery.backup.scope') === 'database'
            && (bool) $this->config->get('disaster_recovery.backup.encrypted', false)
            && (bool) $this->config->get('disaster_recovery.backup.offsite', false)
            && (bool) $this->config->get('disaster_recovery.backup.cross_account', false)
            && (bool) $this->config->get('disaster_recovery.backup.immutable', false)
            && in_array(
                $lockMode,
                (array) $this->config->get(
                    'disaster_recovery.backup.allowed_object_lock_modes',
                    [],
                ),
                true,
            )
            && $backupRetention >= $backupMinimum;
        $this->add(
            $checks,
            'backup.immutable_offsite',
            $backupValid ? 'pass' : 'fail',
            $backupValid
                ? "Encrypted database backups are cross-account, immutable, and retained {$backupRetention} days."
                : "Require encrypted, cross-account off-site database backups with compliance object lock for at least {$backupMinimum} days.",
        );

        $crossRegion = (bool) $this->config->get(
            'disaster_recovery.backup.cross_region',
            false,
        );
        $this->add(
            $checks,
            'backup.cross_region',
            $crossRegion ? 'pass' : 'fail',
            $crossRegion
                ? 'An immutable copy is declared outside the primary region.'
                : 'A cross-region immutable copy is required for regional disaster recovery.',
        );

        $backupHeartbeat = (bool) $this->config->get('monitoring.backup.enabled', false);
        $this->add(
            $checks,
            'backup.verification_signal',
            $backupHeartbeat ? 'pass' : 'fail',
            $backupHeartbeat
                ? 'Verified backup freshness is connected to the monitoring cockpit.'
                : 'MONITORING_BACKUP_HEARTBEAT_ENABLED must be true in production.',
        );

        $drillInterval = (int) $this->config->get(
            'disaster_recovery.restore_drill.interval_days',
            0,
        );
        $drillMaximum = (int) $this->config->get(
            'disaster_recovery.restore_drill.maximum_interval_days',
            90,
        );
        $drillValid = (bool) $this->config->get(
            'disaster_recovery.restore_drill.enabled',
            false,
        )
            && $drillInterval >= 1
            && $drillInterval <= $drillMaximum
            && (bool) $this->config->get(
                'disaster_recovery.restore_drill.isolated_target_required',
                false,
            )
            && (bool) $this->config->get(
                'disaster_recovery.restore_drill.production_target_forbidden',
                false,
            )
            && (bool) $this->config->get(
                'disaster_recovery.restore_drill.isolation_evidence_required',
                false,
            )
            && (bool) $this->config->get(
                'disaster_recovery.restore_drill.production_access_blocked_required',
                false,
            );
        $this->add(
            $checks,
            'restore.drill',
            $drillValid ? 'pass' : 'fail',
            $drillValid
                ? "An isolated, non-production restore drill is required every {$drillInterval} days."
                : "Require an isolated restore drill at least every {$drillMaximum} days and forbid production targets.",
        );

        $activeKey = $this->keyring->active();
        $this->add(
            $checks,
            'evidence.signing_keyring',
            $activeKey !== null ? 'pass' : 'fail',
            $activeKey !== null
                ? 'Recovery evidence uses a rotatable independent HMAC key ring.'
                : 'Configure a 32-byte minimum active recovery evidence key in the deployment secret manager.',
        );
        $keyIds = $this->keyring->validKeyIds();
        $configuredRecoveryKeys = $this->config->get(
            'disaster_recovery.evidence.signing_keys',
            [],
        );
        $recoverySecrets = array_values(array_filter(array_map(
            fn (string $keyId): ?string => $this->keyring->key($keyId),
            $keyIds,
        )));
        $uniqueKeyMaterial = $activeKey !== null
            && is_array($configuredRecoveryKeys)
            && $configuredRecoveryKeys !== []
            && count($configuredRecoveryKeys) <= 16
            && count($configuredRecoveryKeys) === count($keyIds)
            && count($recoverySecrets) === count($keyIds)
            && count(array_unique($recoverySecrets, SORT_STRING)) === count($recoverySecrets);
        $this->add(
            $checks,
            'evidence.unique_key_material',
            $uniqueKeyMaterial ? 'pass' : 'fail',
            $uniqueKeyMaterial
                ? 'Every recovery ledger key ID resolves to distinct key material.'
                : 'Recovery key rotation must use distinct secret material for every key ID.',
        );
        $otherSecrets = $this->otherApplicationSecrets();
        $independentKey = $uniqueKeyMaterial
            && collect($recoverySecrets)->every(
                static fn (string $recoverySecret): bool => collect($otherSecrets)->every(
                    static fn (string $otherSecret): bool => ! hash_equals(
                        $recoverySecret,
                        $otherSecret,
                    ),
                ),
            );
        $this->add(
            $checks,
            'evidence.key_independence',
            $independentKey ? 'pass' : 'fail',
            $independentKey
                ? 'The recovery ledger key is isolated from every other application trust domain.'
                : 'Generate a dedicated recovery ledger key; never reuse APP_KEY or another integrity secret.',
        );

        $evidenceWarningAfter = (int) $this->config->get(
            'disaster_recovery.evidence.verification_warning_after_seconds',
            7_200,
        );
        $evidenceOutageAfter = (int) $this->config->get(
            'disaster_recovery.evidence.verification_outage_after_seconds',
            14_400,
        );
        $evidenceCadenceValid = $evidenceWarningAfter >= 3_600
            && $evidenceWarningAfter <= 7_200
            && $evidenceOutageAfter > $evidenceWarningAfter
            && $evidenceOutageAfter <= 14_400;
        $this->add(
            $checks,
            'evidence.verification_cadence',
            $evidenceCadenceValid ? 'pass' : 'fail',
            $evidenceCadenceValid
                ? 'Hourly evidence verification becomes a warning within two hours and an outage within four hours.'
                : 'Recovery evidence verification must warn within two hours and fail closed within four hours.',
        );

        return $this->summarize($checks);
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();

        if (! $report['valid']) {
            throw DisasterRecoveryContractViolation::fromCodes(
                $this->codesWithStatus($report, 'fail'),
            );
        }
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

    private function boundedIdentity(string $value): bool
    {
        return preg_match('/\A[a-z0-9][a-z0-9_.:-]{1,63}\z/', $value) === 1
            && preg_match('/replace|example|placeholder|secret-manager/i', $value) !== 1;
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
            'database_replication.ledger.signing_keys',
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
}
