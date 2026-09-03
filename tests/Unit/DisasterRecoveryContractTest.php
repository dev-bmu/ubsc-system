<?php

namespace Tests\Unit;

use App\Exceptions\DisasterRecoveryContractViolation;
use App\Services\Production\DisasterRecoveryContract;
use App\Services\Production\RecoveryAttestationVerifier;
use App\Services\Production\RecoveryEvidenceKeyring;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class DisasterRecoveryContractTest extends TestCase
{
    private static ?string $verificationPublicKey = null;

    public function test_complete_tested_recovery_contract_is_strictly_valid(): void
    {
        $report = $this->contract()->report();

        self::assertTrue($report['valid']);
        self::assertTrue($report['strict_valid']);
        self::assertSame(0, $report['failures']);
        self::assertSame(0, $report['warnings']);
    }

    public function test_pitr_must_be_continuous_provider_managed_observed_and_retained(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['pitr']['continuous'] = false;
        $configuration['disaster_recovery']['pitr']['retention_days'] = 7;
        $configuration['disaster_recovery']['pitr']['observation_enabled'] = false;

        $report = $this->contract($configuration)->report();

        self::assertContains('pitr.capability', $this->failedCodes($report));
        self::assertContains('pitr.observation', $this->failedCodes($report));
    }

    public function test_backup_requires_encryption_offsite_cross_account_and_compliance_lock(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['backup']['encrypted'] = false;
        $configuration['disaster_recovery']['backup']['cross_account'] = false;
        $configuration['disaster_recovery']['backup']['object_lock_mode'] = 'governance';

        $report = $this->contract($configuration)->report();

        self::assertContains('backup.immutable_offsite', $this->failedCodes($report));
        $this->expectException(DisasterRecoveryContractViolation::class);
        $this->contract($configuration)->assertSatisfied();
    }

    public function test_cross_region_copy_is_a_mandatory_regional_recovery_control(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['backup']['cross_region'] = false;

        $report = $this->contract($configuration)->report();

        self::assertFalse($report['valid']);
        self::assertContains('backup.cross_region', $this->failedCodes($report));
    }

    public function test_restore_drill_and_independent_signing_key_are_mandatory(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['restore_drill']['enabled'] = false;
        $configuration['disaster_recovery']['evidence']['active_key_id'] = 'missing';

        $report = $this->contract($configuration)->report();

        self::assertContains('restore.drill', $this->failedCodes($report));
        self::assertContains('evidence.signing_keyring', $this->failedCodes($report));
    }

    public function test_recovery_target_must_be_explicit_and_cross_region(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['target']['dataset_id'] = 'replace-me';
        $configuration['disaster_recovery']['target']['recovery_region'] = 'ap-southeast-3';

        $report = $this->contract($configuration)->report();

        self::assertContains('target.identity', $this->failedCodes($report));
    }

    public function test_recovery_verifier_and_vault_must_have_independent_identities(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['target']['independent_verifier'] = 'managed-db';

        $report = $this->contract($configuration)->report();

        self::assertContains('target.independence', $this->failedCodes($report));
    }

    public function test_backup_cadence_must_detect_a_missed_run_before_two_intervals(): void
    {
        $configuration = $this->configuration();
        $configuration['monitoring']['backup']['warning_after_seconds'] = 86_400;
        $configuration['monitoring']['backup']['outage_after_seconds'] = 259_200;

        $report = $this->contract($configuration)->report();

        self::assertContains('backup.cadence', $this->failedCodes($report));
    }

    public function test_external_attestation_requires_an_active_public_verification_key(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['attestation']['active_key_ids'] = [
            'missing-verifier',
        ];

        $report = $this->contract($configuration)->report();

        self::assertContains('evidence.external_attestation', $this->failedCodes($report));
    }

    public function test_attestation_rotation_rejects_duplicate_public_key_material(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['attestation']['active_key_ids'] = [
            'verifier-v1',
            'verifier-v2',
        ];
        $configuration['disaster_recovery']['attestation']['verification_keys']['verifier-v2'] =
            $configuration['disaster_recovery']['attestation']['verification_keys']['verifier-v1'];

        $report = $this->contract($configuration)->report();

        self::assertContains('evidence.external_attestation', $this->failedCodes($report));
    }

    public function test_recovery_attestation_validates_inactive_historical_keys(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['attestation']['verification_keys']['verifier-old'] =
            'not-a-public-key';

        $malformed = $this->contract($configuration)->report();
        self::assertContains('evidence.external_attestation', $this->failedCodes($malformed));

        $configuration = $this->configuration();
        $configuration['disaster_recovery']['attestation']['verification_keys']['verifier-old'] =
            $configuration['disaster_recovery']['attestation']['verification_keys']['verifier-v1'];

        $duplicate = $this->contract($configuration)->report();
        self::assertContains('evidence.external_attestation', $this->failedCodes($duplicate));
    }

    public function test_obvious_placeholder_or_low_entropy_evidence_key_is_rejected(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['evidence']['signing_keys']['v1'] = str_repeat('a', 40);

        $report = $this->contract($configuration)->report();

        self::assertContains('evidence.signing_keyring', $this->failedCodes($report));
    }

    public function test_recovery_ledger_key_cannot_reuse_another_trust_domain_secret(): void
    {
        $configuration = $this->configuration();
        $configuration['app']['key'] = 'independent-recovery-signing-secret-2026';

        $report = $this->contract($configuration)->report();

        self::assertContains('evidence.key_independence', $this->failedCodes($report));
    }

    public function test_recovery_key_rotation_requires_distinct_secret_material(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['evidence']['signing_keys']['v2'] =
            $configuration['disaster_recovery']['evidence']['signing_keys']['v1'];

        $report = $this->contract($configuration)->report();

        self::assertContains('evidence.unique_key_material', $this->failedCodes($report));

        $configuration = $this->configuration();
        $configuration['disaster_recovery']['evidence']['signing_keys']['old'] = str_repeat('x', 40);
        $weakHistorical = $this->contract($configuration)->report();

        self::assertContains('evidence.unique_key_material', $this->failedCodes($weakHistorical));
    }

    public function test_evidence_verification_cannot_remain_silent_for_days(): void
    {
        $configuration = $this->configuration();
        $configuration['disaster_recovery']['evidence']['verification_warning_after_seconds'] = 129_600;
        $configuration['disaster_recovery']['evidence']['verification_outage_after_seconds'] = 172_800;

        $report = $this->contract($configuration)->report();

        self::assertContains(
            'evidence.verification_cadence',
            $this->failedCodes($report),
        );
    }

    public function test_report_never_discloses_recovery_signing_material(): void
    {
        $encoded = json_encode($this->contract()->report(), JSON_THROW_ON_ERROR);

        self::assertStringNotContainsString('independent-recovery-signing-secret', $encoded);
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): DisasterRecoveryContract
    {
        $repository = new Repository($configuration ?? $this->configuration());

        return new DisasterRecoveryContract(
            $repository,
            new RecoveryAttestationVerifier($repository),
            new RecoveryEvidenceKeyring($repository),
        );
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        return [
            'app' => ['env' => 'production'],
            'monitoring' => ['backup' => ['enabled' => true]],
            'disaster_recovery' => [
                'enforce' => true,
                'objectives' => ['rpo_seconds' => 300, 'rto_seconds' => 3_600],
                'target' => [
                    'provider' => 'managed-db',
                    'dataset_id' => 'ubsc-relational-v1',
                    'primary_region' => 'ap-southeast-3',
                    'recovery_region' => 'ap-southeast-1',
                    'backup_destination_id' => 'ubsc-recovery-vault-v1',
                    'independent_verifier' => 'ubsc-recovery-verifier-v1',
                ],
                'pitr' => [
                    'enabled' => true,
                    'provider_managed' => true,
                    'continuous' => true,
                    'retention_days' => 14,
                    'minimum_retention_days' => 14,
                    'observation_enabled' => true,
                ],
                'backup' => [
                    'enabled' => true,
                    'scope' => 'database',
                    'encrypted' => true,
                    'offsite' => true,
                    'cross_account' => true,
                    'cross_region' => true,
                    'immutable' => true,
                    'object_lock_mode' => 'compliance',
                    'retention_days' => 35,
                    'minimum_retention_days' => 35,
                    'allowed_object_lock_modes' => ['compliance'],
                    'expected_interval_seconds' => 86_400,
                ],
                'restore_drill' => [
                    'enabled' => true,
                    'interval_days' => 90,
                    'maximum_interval_days' => 90,
                    'isolated_target_required' => true,
                    'production_target_forbidden' => true,
                    'isolation_evidence_required' => true,
                    'production_access_blocked_required' => true,
                ],
                'evidence' => [
                    'active_key_id' => 'v1',
                    'signing_keys' => [
                        'v1' => 'independent-recovery-signing-secret-2026',
                    ],
                    'minimum_key_bytes' => 32,
                    'verification_warning_after_seconds' => 7_200,
                    'verification_outage_after_seconds' => 14_400,
                ],
                'attestation' => [
                    'required' => true,
                    'active_key_ids' => ['verifier-v1'],
                    'verification_keys' => [
                        'verifier-v1' => 'base64:'.base64_encode($this->publicKey()),
                    ],
                ],
            ],
        ];
    }

    private function publicKey(): string
    {
        if (self::$verificationPublicKey !== null) {
            return self::$verificationPublicKey;
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
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);
        self::$verificationPublicKey = (string) $details['key'];

        return self::$verificationPublicKey;
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
