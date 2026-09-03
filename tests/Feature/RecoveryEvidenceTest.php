<?php

namespace Tests\Feature;

use App\Enums\MonitoringStatus;
use App\Models\RecoveryEvidence;
use App\Services\Monitoring\DisasterRecoveryMonitor;
use App\Services\Monitoring\MonitoringBackupMonitor;
use App\Services\Production\RecoveryEvidenceLedger;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

final class RecoveryEvidenceTest extends TestCase
{
    use RefreshDatabase;

    private const CHECKSUM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private static ?\OpenSSLAsymmetricKey $attestationPrivateKey = null;

    protected function setUp(): void
    {
        parent::setUp();

        if (self::$attestationPrivateKey === null) {
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
            self::$attestationPrivateKey = $key;
        }
        $details = openssl_pkey_get_details(self::$attestationPrivateKey);
        self::assertIsArray($details);

        Carbon::setTestNow('2026-08-23 12:35:00');
        config()->set('monitoring.backup.enabled', true);
        config()->set('monitoring.backup.warning_after_seconds', 108_000);
        config()->set('monitoring.backup.outage_after_seconds', 172_800);
        config()->set('disaster_recovery.enforce', true);
        config()->set('disaster_recovery.attestation.required', false);
        config()->set('disaster_recovery.target.provider', 'managed-db');
        config()->set('disaster_recovery.target.dataset_id', 'ubsc-relational-v1');
        config()->set('disaster_recovery.target.backup_destination_id', 'ubsc-vault-v1');
        config()->set('disaster_recovery.target.primary_region', 'ap-southeast-3');
        config()->set('disaster_recovery.target.recovery_region', 'ap-southeast-1');
        config()->set(
            'disaster_recovery.target.independent_verifier',
            'ubsc-recovery-verifier-v1',
        );
        config()->set('disaster_recovery.attestation.active_key_ids', ['verifier-v1']);
        config()->set('disaster_recovery.attestation.verification_keys', [
            'verifier-v1' => 'base64:'.base64_encode((string) $details['key']),
        ]);
        config()->set('disaster_recovery.objectives.rpo_seconds', 300);
        config()->set('disaster_recovery.objectives.rto_seconds', 3_600);
        config()->set('disaster_recovery.backup.enabled', true);
        config()->set('disaster_recovery.backup.cross_region', true);
        config()->set('disaster_recovery.backup.minimum_retention_days', 35);
        config()->set('disaster_recovery.backup.allowed_object_lock_modes', ['compliance']);
        config()->set('disaster_recovery.restore_drill.enabled', true);
        config()->set('disaster_recovery.restore_drill.interval_days', 90);
        config()->set('disaster_recovery.restore_drill.grace_days', 14);
        config()->set('disaster_recovery.evidence.active_key_id', 'v1');
        config()->set('disaster_recovery.evidence.signing_keys', [
            'v1' => 'recovery-evidence-test-key-version-one-2026',
        ]);
        config()->set('disaster_recovery.evidence.minimum_key_bytes', 32);
    }

    public function test_recovery_evidence_chain_is_verified_hourly_with_distributed_locking(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->firstWhere('description', 'recovery-verify-evidence-chain');

        $this->assertNotNull($event);
        $this->assertSame('23 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertTrue($event->onOneServer);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_verified_backup_is_signed_chained_and_idempotent_without_refreshing_old_evidence(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertDatabaseCount('recovery_evidence', 1);

        $evidence = RecoveryEvidence::query()->sole();
        self::assertSame(1, $evidence->sequence);
        self::assertSame('backup_verified', $evidence->evidence_type);
        self::assertSame(MonitoringStatus::Operational->value, $evidence->status);
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);

        Carbon::setTestNow(now()->addDay());
        self::assertSame(0, $this->recordBackup());
        self::assertDatabaseCount('recovery_evidence', 1);

        $backup = app(MonitoringBackupMonitor::class)->summary();
        self::assertSame(88_500, $backup['age_seconds']);
        self::assertSame('2026-08-23T05:00:00+00:00', $backup['last_verified_at']);
    }

    public function test_operation_id_cannot_be_reused_for_different_backup_evidence(): void
    {
        self::assertSame(0, $this->recordBackup());

        self::assertSame(2, $this->recordBackup([
            '--size-bytes' => 98_765_432,
        ]));
        self::assertDatabaseCount('recovery_evidence', 1);
    }

    public function test_operation_id_is_globally_unique_across_recovery_evidence_types(): void
    {
        self::assertSame(0, $this->recordBackup());
        config()->set('disaster_recovery.pitr.enabled', true);
        config()->set('disaster_recovery.pitr.observation_enabled', true);

        self::assertSame(2, Artisan::call('monitoring:pitr-observed', [
            '--operation-id' => 'backup-operation-20260823-001',
            '--provider' => 'managed-db',
            '--dataset-id' => 'ubsc-relational-v1',
            '--region' => 'ap-southeast-3',
            '--latest-recovery-point-at' => '2026-08-23T12:34:00Z',
            '--checked-at' => '2026-08-23T12:35:00Z',
            '--continuous' => true,
            '--restorable' => true,
            '--quiet' => true,
        ]));
        self::assertDatabaseCount('recovery_evidence', 1);
    }

    public function test_ecdsa_retry_with_a_fresh_valid_signature_is_idempotent(): void
    {
        $options = [
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC,
        ];
        $windowsConfig = 'C:/xampp/php/extras/ssl/openssl.cnf';
        if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsConfig)) {
            $options['config'] = $windowsConfig;
        }
        $privateKey = openssl_pkey_new($options);
        self::assertInstanceOf(\OpenSSLAsymmetricKey::class, $privateKey);
        $details = openssl_pkey_get_details($privateKey);
        self::assertIsArray($details);
        config()->set('disaster_recovery.attestation.required', true);
        config()->set('disaster_recovery.attestation.active_key_ids', ['verifier-ec-v1']);
        config()->set('disaster_recovery.attestation.verification_keys', [
            'verifier-ec-v1' => 'base64:'.base64_encode((string) $details['key']),
        ]);

        $payload = $this->backupPayload();
        $firstEnvelope = $this->signedEnvelope($payload, $privateKey, 'verifier-ec-v1');
        $secondEnvelope = $this->signedEnvelope($payload, $privateKey, 'verifier-ec-v1');
        self::assertNotSame($firstEnvelope['signature'], $secondEnvelope['signature']);

        $first = app(RecoveryEvidenceLedger::class)->recordEnvelope($firstEnvelope);
        $retry = app(RecoveryEvidenceLedger::class)->recordEnvelope($secondEnvelope);

        self::assertSame($first->getKey(), $retry->getKey());
        self::assertSame($firstEnvelope['signature'], $retry->source_signature);
        self::assertSame(1, RecoveryEvidence::query()->count());
    }

    public function test_backup_evidence_requires_cross_account_and_declared_cross_region_proof(): void
    {
        self::assertSame(2, $this->recordBackup([
            '--cross-account' => false,
        ]));
        self::assertDatabaseCount('recovery_evidence', 0);

        self::assertSame(2, $this->recordBackup([
            '--cross-region' => false,
        ]));
        self::assertDatabaseCount('recovery_evidence', 0);

        config()->set('disaster_recovery.backup.cross_region', false);
        self::assertSame(2, $this->recordBackup([
            '--cross-region' => false,
        ]));
        self::assertDatabaseCount('recovery_evidence', 0);
    }

    public function test_fresh_verification_of_a_stale_recovery_point_is_outage_evidence(): void
    {
        self::assertSame(1, $this->recordBackup([
            '--source-snapshot-at' => '2026-08-23T10:55:00+07:00',
            '--recovery-point-at' => '2026-08-23T11:00:00+07:00',
        ]));

        $evidence = RecoveryEvidence::query()->sole();
        self::assertSame(MonitoringStatus::Outage->value, $evidence->status);
        self::assertFalse($evidence->checks['rpo_met']);
        self::assertSame(3_600, $evidence->observed_rpo_seconds);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(MonitoringBackupMonitor::class)->summary()['status'],
        );
    }

    public function test_independently_signed_backup_attestation_is_preserved_and_reverified(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $evidence = app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->backupPayload()),
        );

        self::assertSame(2, $evidence->schema_version);
        self::assertSame('verifier-v1', $evidence->source_key_id);
        self::assertSame('backup_verified', $evidence->evidence_type);
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);

        config()->set('disaster_recovery.attestation.verification_keys', []);
        $report = app(RecoveryEvidenceLedger::class)->verify();
        self::assertFalse($report['valid']);
        self::assertContains(
            'source_signature_mismatch',
            array_column($report['failures'], 'code'),
        );
        $summary = app(MonitoringBackupMonitor::class)->summary();
        self::assertSame(MonitoringStatus::Outage->value, $summary['status']);
    }

    public function test_signed_attestation_rejects_non_boolean_control_fields(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $payload = $this->backupPayload();
        $payload['archive_readable'] = 1;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('archive_readable must be boolean.');
        app(RecoveryEvidenceLedger::class)->recordEnvelope($this->signedEnvelope($payload));
    }

    public function test_required_attestation_keeps_backup_and_restore_operational_only_when_both_are_signed(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->backupPayload()),
        );
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->restorePayload()),
        );

        $summary = app(DisasterRecoveryMonitor::class)->summary();
        self::assertSame(
            MonitoringStatus::Operational->value,
            $summary['signals']['immutable_backup']['status'],
        );
        self::assertSame(
            MonitoringStatus::Operational->value,
            $summary['signals']['restore_drill']['status'],
        );
        self::assertTrue($summary['evidence']['items'][0]['attested']);
        self::assertTrue($summary['evidence']['items'][1]['attested']);
    }

    public function test_legacy_local_evidence_is_fail_closed_after_attestation_becomes_required(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertSame(0, $this->recordRestore());

        config()->set('disaster_recovery.attestation.required', true);
        $summary = app(DisasterRecoveryMonitor::class)->summary();

        self::assertSame(
            MonitoringStatus::Outage->value,
            $summary['signals']['immutable_backup']['status'],
        );
        self::assertSame(
            MonitoringStatus::Outage->value,
            $summary['signals']['restore_drill']['status'],
        );
    }

    public function test_signed_restore_cannot_upgrade_an_unattested_legacy_backup(): void
    {
        self::assertSame(0, $this->recordBackup());
        config()->set('disaster_recovery.attestation.required', true);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('independently attested source backup');
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope(array_replace($this->restorePayload(), [
                'backup_id' => 'backup-20260823-001',
            ])),
        );
    }

    public function test_target_configuration_drift_invalidates_fresh_attested_operational_status(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->backupPayload()),
        );
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->restorePayload()),
        );

        config()->set('disaster_recovery.target.dataset_id', 'ubsc-relational-v2');
        $summary = app(DisasterRecoveryMonitor::class)->summary();

        self::assertSame(
            MonitoringStatus::Outage->value,
            $summary['signals']['immutable_backup']['status'],
        );
        self::assertSame(
            MonitoringStatus::Outage->value,
            $summary['signals']['restore_drill']['status'],
        );
        self::assertFalse($summary['evidence']['items'][0]['target_matches_current']);
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);
    }

    public function test_required_attestation_cannot_be_bypassed_through_legacy_command(): void
    {
        config()->set('disaster_recovery.attestation.required', true);

        self::assertSame(1, $this->recordBackup());
        self::assertDatabaseCount('recovery_evidence', 0);
    }

    public function test_signed_attestation_file_is_imported_without_exposing_source_material(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $path = tempnam(sys_get_temp_dir(), 'ubsc-recovery-envelope-');
        self::assertIsString($path);

        try {
            self::assertNotFalse(file_put_contents(
                $path,
                json_encode(
                    $this->signedEnvelope($this->backupPayload()),
                    JSON_THROW_ON_ERROR,
                ),
            ));
            self::assertSame(0, Artisan::call('recovery:attestation-import', [
                '--file' => $path,
                '--quiet' => true,
            ]));
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }

        $evidence = RecoveryEvidence::query()->sole();
        self::assertSame(2, $evidence->schema_version);
        self::assertSame('verifier-v1', $evidence->source_key_id);
        self::assertArrayNotHasKey('source_payload', $evidence->toArray());
        self::assertArrayNotHasKey('source_signature', $evidence->toArray());
        $adminProjection = json_encode(
            app(DisasterRecoveryMonitor::class)->summary()['evidence'],
            JSON_THROW_ON_ERROR,
        );
        self::assertStringNotContainsString((string) $evidence->source_signature, $adminProjection);
        self::assertStringNotContainsString(self::CHECKSUM, $adminProjection);
        self::assertStringNotContainsString('source_payload', $adminProjection);
    }

    public function test_valid_failure_import_is_acknowledged_without_hiding_the_outage(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $path = tempnam(sys_get_temp_dir(), 'ubsc-recovery-failure-');
        self::assertIsString($path);

        try {
            self::assertNotFalse(file_put_contents(
                $path,
                json_encode(
                    $this->signedEnvelope($this->backupFailurePayload()),
                    JSON_THROW_ON_ERROR,
                ),
            ));
            self::assertSame(0, Artisan::call('recovery:attestation-import', [
                '--file' => $path,
                '--quiet' => true,
            ]));
            self::assertSame(1, Artisan::call('recovery:attestation-import', [
                '--file' => $path,
                '--fail-on-unhealthy' => true,
                '--quiet' => true,
            ]));
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }

        self::assertDatabaseCount('recovery_evidence', 1);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(MonitoringBackupMonitor::class)->summary()['status'],
        );
    }

    public function test_tampered_or_inactive_recovery_attestation_is_refused(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $envelope = $this->signedEnvelope($this->backupPayload());
        $envelope['payload']['size_bytes']++;

        try {
            app(RecoveryEvidenceLedger::class)->recordEnvelope($envelope);
            self::fail('Tampered recovery attestation unexpectedly passed.');
        } catch (\InvalidArgumentException $exception) {
            self::assertSame('Recovery attestation signature is invalid.', $exception->getMessage());
        }

        config()->set('disaster_recovery.attestation.active_key_ids', ['verifier-v2']);
        $this->expectException(\InvalidArgumentException::class);
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->backupPayload()),
        );
    }

    public function test_valid_signature_for_a_different_recovery_target_is_refused(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $payload = $this->backupPayload();
        $payload['recovery_region'] = 'ap-southeast-2';

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('recovery_region does not match');
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($payload),
        );
    }

    public function test_backup_failure_is_append_only_outage_evidence(): void
    {
        self::assertSame(1, Artisan::call('monitoring:backup-failed', [
            '--operation-id' => 'backup-operation-20260823-failed',
            '--provider' => 'managed-db',
            '--failure-code' => 'checksum_mismatch',
            '--checked-at' => '2026-08-23T12:34:00+07:00',
            '--quiet' => true,
        ]));

        $evidence = RecoveryEvidence::query()->sole();
        self::assertSame('backup_failed', $evidence->evidence_type);
        self::assertSame(MonitoringStatus::Outage->value, $evidence->status);
        self::assertTrue($evidence->checks['failure.checksum_mismatch']);
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(MonitoringBackupMonitor::class)->summary()['status'],
        );
    }

    public function test_late_delivery_of_an_older_failure_cannot_regress_a_newer_success(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertSame(1, Artisan::call('monitoring:backup-failed', [
            '--operation-id' => 'backup-operation-older-failure',
            '--provider' => 'managed-db',
            '--failure-code' => 'provider_unavailable',
            '--checked-at' => '2026-08-23T11:00:00+07:00',
            '--quiet' => true,
        ]));

        $summary = app(MonitoringBackupMonitor::class)->summary();
        self::assertSame(MonitoringStatus::Operational->value, $summary['status']);
        self::assertSame('backup-20260823-001', $summary['backup_id']);
    }

    public function test_late_delivery_of_an_older_success_cannot_hide_a_newer_failure(): void
    {
        self::assertSame(1, Artisan::call('monitoring:backup-failed', [
            '--operation-id' => 'backup-operation-newer-failure',
            '--provider' => 'managed-db',
            '--failure-code' => 'checksum_mismatch',
            '--checked-at' => '2026-08-23T12:34:00+07:00',
            '--quiet' => true,
        ]));
        self::assertSame(0, $this->recordBackup());

        $summary = app(MonitoringBackupMonitor::class)->summary();
        self::assertSame(MonitoringStatus::Outage->value, $summary['status']);
        self::assertSame('checksum_mismatch', $summary['failure_code']);
    }

    public function test_impossible_calendar_timestamp_is_rejected(): void
    {
        self::assertSame(2, $this->recordBackup([
            '--completed-at' => '2026-02-31T12:00:00+07:00',
        ]));
        self::assertDatabaseCount('recovery_evidence', 0);
    }

    public function test_pitr_observation_is_bound_to_provider_dataset_and_primary_region(): void
    {
        config()->set('disaster_recovery.pitr.enabled', true);
        config()->set('disaster_recovery.pitr.observation_enabled', true);
        config()->set('disaster_recovery.pitr.warning_after_seconds', 600);
        config()->set('disaster_recovery.pitr.outage_after_seconds', 1_200);

        $result = Artisan::call('monitoring:pitr-observed', [
            '--provider' => 'managed-db',
            '--dataset-id' => 'ubsc-relational-v1',
            '--region' => 'ap-southeast-3',
            '--latest-recovery-point-at' => '2026-08-23T12:33:00+07:00',
            '--checked-at' => '2026-08-23T12:34:30+07:00',
            '--continuous' => true,
            '--restorable' => true,
        ]);
        self::assertSame(0, $result, Artisan::output());
        $pitrSummary = app(DisasterRecoveryMonitor::class)->summary()['signals']['pitr'];
        self::assertSame(
            MonitoringStatus::Operational->value,
            $pitrSummary['status'],
            json_encode($pitrSummary, JSON_THROW_ON_ERROR),
        );

        config()->set('disaster_recovery.target.dataset_id', 'ubsc-relational-v2');
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DisasterRecoveryMonitor::class)->summary()['signals']['pitr']['status'],
        );
        self::assertSame(2, Artisan::call('monitoring:pitr-observed', [
            '--provider' => 'managed-db',
            '--dataset-id' => 'ubsc-relational-v1',
            '--region' => 'ap-southeast-3',
            '--latest-recovery-point-at' => '2026-08-23T12:34:00+07:00',
            '--checked-at' => '2026-08-23T12:35:00+07:00',
            '--continuous' => true,
            '--restorable' => true,
            '--quiet' => true,
        ]));
    }

    public function test_production_pitr_observation_requires_independent_attestation(): void
    {
        config()->set('disaster_recovery.pitr.enabled', true);
        config()->set('disaster_recovery.pitr.observation_enabled', true);
        config()->set('disaster_recovery.attestation.required', true);

        $evidence = app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->pitrPayload()),
        );

        self::assertSame('pitr_observation', $evidence->evidence_type);
        self::assertSame(2, $evidence->schema_version);
        self::assertSame(MonitoringStatus::Operational->value, $evidence->status);
        $summary = app(DisasterRecoveryMonitor::class)->summary();
        self::assertSame(
            MonitoringStatus::Operational->value,
            $summary['signals']['pitr']['status'],
        );
        self::assertTrue($summary['signals']['pitr']['attested']);

        self::assertSame(1, Artisan::call('monitoring:pitr-observed', [
            '--provider' => 'managed-db',
            '--dataset-id' => 'ubsc-relational-v1',
            '--region' => 'ap-southeast-3',
            '--latest-recovery-point-at' => '2026-08-23T12:34:00+07:00',
            '--checked-at' => '2026-08-23T12:35:00+07:00',
            '--continuous' => true,
            '--restorable' => true,
            '--quiet' => true,
        ]));
        self::assertDatabaseCount('recovery_evidence', 1);

        config()->set('disaster_recovery.target.dataset_id', 'ubsc-relational-v2');
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DisasterRecoveryMonitor::class)->summary()['signals']['pitr']['status'],
        );
    }

    public function test_delayed_pitr_attestations_cannot_regress_or_hide_current_state(): void
    {
        config()->set('disaster_recovery.pitr.enabled', true);
        config()->set('disaster_recovery.pitr.observation_enabled', true);
        config()->set('disaster_recovery.attestation.required', true);

        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope($this->pitrPayload()),
        );
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope(array_replace($this->pitrPayload(), [
                'operation_id' => 'pitr-attested-older-failure',
                'latest_recovery_point_at' => '2026-08-23T12:19:00+07:00',
                'checked_at' => '2026-08-23T12:20:00+07:00',
                'continuous' => false,
            ])),
        );
        self::assertSame(
            MonitoringStatus::Operational->value,
            app(DisasterRecoveryMonitor::class)->summary()['signals']['pitr']['status'],
        );

        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope(array_replace($this->pitrPayload(), [
                'operation_id' => 'pitr-attested-newest-failure',
                'latest_recovery_point_at' => '2026-08-23T12:34:00+07:00',
                'checked_at' => '2026-08-23T12:34:50+07:00',
                'restorable' => false,
            ])),
        );
        app(RecoveryEvidenceLedger::class)->recordEnvelope(
            $this->signedEnvelope(array_replace($this->pitrPayload(), [
                'operation_id' => 'pitr-attested-replayed-success',
                'latest_recovery_point_at' => '2026-08-23T12:29:00+07:00',
                'checked_at' => '2026-08-23T12:30:00+07:00',
            ])),
        );

        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DisasterRecoveryMonitor::class)->summary()['signals']['pitr']['status'],
        );
    }

    public function test_restore_drill_references_verified_backup_and_measures_rpo_and_rto(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertSame(0, $this->recordRestore());

        $restore = RecoveryEvidence::query()
            ->where('evidence_type', 'restore_drill')
            ->sole();
        self::assertSame(120, $restore->observed_rpo_seconds);
        self::assertSame(1_800, $restore->observed_rto_seconds);
        self::assertSame(MonitoringStatus::Operational->value, $restore->status);
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);

        $summary = app(DisasterRecoveryMonitor::class)->summary();
        self::assertSame(
            MonitoringStatus::Operational->value,
            $summary['signals']['restore_drill']['status'],
        );
    }

    public function test_restore_to_a_production_named_target_is_refused(): void
    {
        self::assertSame(0, $this->recordBackup());

        self::assertSame(2, $this->recordRestore([
            '--target-environment' => 'production',
        ]));
        self::assertDatabaseCount('recovery_evidence', 1);
    }

    public function test_restore_cannot_claim_a_newer_recovery_point_without_verified_pitr_replay(): void
    {
        self::assertSame(0, $this->recordBackup());

        self::assertSame(1, $this->recordRestore([
            '--recovery-point-at' => '2026-08-23T12:00:00+07:00',
            '--pitr-replay-verified' => false,
        ]));
        $restore = RecoveryEvidence::query()
            ->where('evidence_type', 'restore_drill')
            ->sole();
        self::assertSame(MonitoringStatus::Outage->value, $restore->status);
        self::assertFalse($restore->checks['pitr_replay_verified']);
    }

    public function test_production_like_restore_target_and_unverified_isolation_are_never_painted_green(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertSame(2, $this->recordRestore([
            '--target-environment' => 'ubsc-production-copy',
        ]));
        self::assertDatabaseCount('recovery_evidence', 1);

        self::assertSame(1, $this->recordRestore([
            '--drill-id' => 'restore-drill-20260823-unisolated',
            '--isolation-verified' => false,
        ]));
        $evidence = RecoveryEvidence::query()
            ->where('operation_id', 'restore-drill-20260823-unisolated')
            ->sole();
        self::assertSame(MonitoringStatus::Outage->value, $evidence->status);
        self::assertFalse($evidence->checks['isolation_verified']);
    }

    public function test_append_after_tampering_cannot_refresh_chain_health_without_full_verification(): void
    {
        self::assertSame(0, $this->recordBackup());
        DB::table('recovery_evidence_chain_heads')->where('key', 'primary')->update([
            'last_hash' => str_repeat('f', 64),
        ]);

        self::assertSame(1, $this->recordBackup([
            '--operation-id' => 'backup-operation-20260823-002',
            '--backup-id' => 'backup-20260823-002',
        ]));
        self::assertDatabaseCount('recovery_evidence', 1);
        self::assertDatabaseHas('monitoring_heartbeats', [
            'key' => 'recovery-evidence-chain',
            'status' => MonitoringStatus::Outage->value,
        ]);
    }

    public function test_full_verification_retries_a_concurrent_append_without_false_alarm(): void
    {
        self::assertSame(0, $this->recordBackup());
        $injected = false;

        DB::listen(function (QueryExecuted $query) use (&$injected): void {
            $sql = strtolower($query->sql);
            if ($injected
                || ! str_starts_with(ltrim($sql), 'select')
                || ! str_contains($sql, 'recovery_evidence')
                || str_contains($sql, 'chain_heads')) {
                return;
            }

            $injected = true;
            self::assertSame(0, $this->recordBackup([
                '--operation-id' => 'backup-operation-20260823-snapshot-002',
                '--backup-id' => 'backup-20260823-snapshot-002',
            ]));
        });

        $report = app(RecoveryEvidenceLedger::class)->verify();

        self::assertTrue($injected);
        self::assertTrue($report['valid'], json_encode($report, JSON_THROW_ON_ERROR));
        self::assertSame(2, $report['total']);
        self::assertDatabaseCount('recovery_evidence', 2);
    }

    public function test_external_attestation_remains_bound_to_local_business_evidence(): void
    {
        config()->set('disaster_recovery.attestation.required', true);
        $ledger = app(RecoveryEvidenceLedger::class);
        $ledger->recordEnvelope($this->signedEnvelope($this->backupPayload()));

        DB::unprepared('DROP TRIGGER IF EXISTS recovery_evidence_prevent_update');
        DB::table('recovery_evidence')->where('sequence', 1)->update([
            'provider' => 'forged-provider',
        ]);
        $forged = RecoveryEvidence::query()->where('sequence', 1)->sole();
        $canonicalPayload = new \ReflectionMethod($ledger, 'canonicalPayload');
        $canonicalJson = new \ReflectionMethod($ledger, 'canonicalJson');
        $payload = $canonicalPayload->invoke(
            $ledger,
            $forged->getAttributes(),
            $forged->checks,
        );
        $json = $canonicalJson->invoke($ledger, $payload);
        $recordHash = hash('sha256', str_repeat('0', 64)."\0".$json);
        $signature = hash_hmac(
            'sha256',
            $recordHash,
            'recovery-evidence-test-key-version-one-2026',
        );
        DB::table('recovery_evidence')->where('sequence', 1)->update([
            'record_hash' => $recordHash,
            'signature' => $signature,
        ]);
        DB::table('recovery_evidence_chain_heads')->where('key', 'primary')->update([
            'last_hash' => $recordHash,
        ]);

        $report = $ledger->verify();

        self::assertFalse($report['valid']);
        self::assertContains(
            'source_business_mismatch',
            array_column($report['failures'], 'code'),
        );
        self::assertFalse(
            app(DisasterRecoveryMonitor::class)
                ->summary()['evidence']['items'][0]['attested'],
        );
    }

    public function test_current_recovery_objectives_are_reapplied_to_historical_proof(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertSame(0, $this->recordRestore());

        config()->set('disaster_recovery.objectives.rpo_seconds', 30);

        self::assertSame(
            MonitoringStatus::Outage->value,
            app(MonitoringBackupMonitor::class)->summary()['status'],
        );
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DisasterRecoveryMonitor::class)->summary()['signals']['restore_drill']['status'],
        );
    }

    public function test_failed_restore_checks_remain_as_outage_evidence(): void
    {
        self::assertSame(0, $this->recordBackup());
        self::assertSame(1, $this->recordRestore([
            '--application-smoke-verified' => false,
        ]));

        $restore = RecoveryEvidence::query()
            ->where('evidence_type', 'restore_drill')
            ->sole();
        self::assertSame(MonitoringStatus::Outage->value, $restore->status);
        self::assertFalse($restore->checks['application_smoke_verified']);
        self::assertSame(
            MonitoringStatus::Outage->value,
            app(DisasterRecoveryMonitor::class)
                ->summary()['signals']['restore_drill']['status'],
        );
    }

    public function test_database_trigger_refuses_direct_evidence_tampering(): void
    {
        self::assertSame(0, $this->recordBackup());

        try {
            DB::table('recovery_evidence')->where('sequence', 1)->update([
                'provider' => 'tampered-provider',
            ]);
            self::fail('Database trigger unexpectedly allowed evidence mutation.');
        } catch (QueryException) {
            self::assertDatabaseHas('recovery_evidence', [
                'sequence' => 1,
                'provider' => 'managed-db',
            ]);
        }

        try {
            DB::table('recovery_evidence')->where('sequence', 1)->delete();
            self::fail('Database trigger unexpectedly allowed evidence deletion.');
        } catch (QueryException) {
            self::assertDatabaseCount('recovery_evidence', 1);
        }

        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);
    }

    public function test_chain_head_tampering_is_detected_by_full_verification(): void
    {
        self::assertSame(0, $this->recordBackup());

        DB::table('recovery_evidence_chain_heads')->where('key', 'primary')->update([
            'last_hash' => str_repeat('e', 64),
        ]);

        $report = app(RecoveryEvidenceLedger::class)->verify();
        self::assertFalse($report['valid']);
        self::assertContains('chain_head_mismatch', array_column($report['failures'], 'code'));
        $monitoring = app(DisasterRecoveryMonitor::class)->summary();
        self::assertFalse($monitoring['evidence']['head_consistent']);
        self::assertSame(MonitoringStatus::Outage->value, $monitoring['status']);
        self::assertSame(1, Artisan::call('recovery:evidence-verify', [
            '--record-heartbeat' => true,
            '--quiet' => true,
        ]));
    }

    public function test_key_rotation_preserves_old_evidence_verification(): void
    {
        self::assertSame(0, $this->recordBackup());
        config()->set('disaster_recovery.evidence.active_key_id', 'v2');
        config()->set('disaster_recovery.evidence.signing_keys', [
            'v1' => 'recovery-evidence-test-key-version-one-2026',
            'v2' => 'recovery-evidence-test-key-version-two-2026',
        ]);

        self::assertSame(0, $this->recordRestore());
        self::assertSame(['v1', 'v2'], RecoveryEvidence::query()
            ->orderBy('sequence')
            ->pluck('signing_key_id')
            ->all());
        self::assertTrue(app(RecoveryEvidenceLedger::class)->verify()['valid']);

        config()->set('disaster_recovery.evidence.signing_keys', [
            'v2' => 'recovery-evidence-test-key-version-two-2026',
        ]);
        self::assertFalse(app(RecoveryEvidenceLedger::class)->verify()['valid']);
    }

    public function test_application_model_cannot_update_or_delete_recovery_evidence(): void
    {
        self::assertSame(0, $this->recordBackup());
        $evidence = RecoveryEvidence::query()->sole();

        try {
            $evidence->forceFill(['provider' => 'changed'])->save();
            self::fail('Append-only evidence unexpectedly allowed an update.');
        } catch (LogicException $exception) {
            self::assertSame('Recovery evidence is append-only.', $exception->getMessage());
        }

        $this->expectException(LogicException::class);
        $evidence->delete();
    }

    public function test_eloquent_bulk_mutation_cannot_bypass_append_only_model_guards(): void
    {
        self::assertSame(0, $this->recordBackup());

        try {
            RecoveryEvidence::query()->where('sequence', 1)->update([
                'provider' => 'changed',
            ]);
            self::fail('Bulk update unexpectedly bypassed the append-only guard.');
        } catch (LogicException $exception) {
            self::assertSame('Recovery evidence is append-only.', $exception->getMessage());
        }

        $this->expectException(LogicException::class);
        RecoveryEvidence::query()->where('sequence', 1)->delete();
    }

    /** @param array<string, mixed> $overrides */
    private function recordBackup(array $overrides = []): int
    {
        return Artisan::call('monitoring:backup-verified', array_replace([
            '--operation-id' => 'backup-operation-20260823-001',
            '--backup-id' => 'backup-20260823-001',
            '--provider' => 'managed-db',
            '--source-snapshot-at' => '2026-08-23T11:55:00+07:00',
            '--recovery-point-at' => '2026-08-23T11:59:00+07:00',
            '--completed-at' => '2026-08-23T12:00:00+07:00',
            '--immutable-until' => '2026-09-28T12:00:00+07:00',
            '--object-lock-mode' => 'compliance',
            '--size-bytes' => 12_345_678,
            '--checksum-sha256' => self::CHECKSUM,
            '--archive-readable' => true,
            '--checksum-verified' => true,
            '--encrypted' => true,
            '--offsite' => true,
            '--cross-account' => true,
            '--cross-region' => true,
            '--quiet' => true,
        ], $overrides));
    }

    /** @param array<string, mixed> $overrides */
    private function recordRestore(array $overrides = []): int
    {
        return Artisan::call('recovery:restore-drill-record', array_replace([
            '--drill-id' => 'restore-drill-20260823-001',
            '--backup-id' => 'backup-20260823-001',
            '--provider' => 'managed-db',
            '--target-environment' => 'restore-drill-isolated-01',
            '--recovery-point-at' => '2026-08-23T12:00:00+07:00',
            '--started-at' => '2026-08-23T12:02:00+07:00',
            '--completed-at' => '2026-08-23T12:32:00+07:00',
            '--checksum-sha256' => self::CHECKSUM,
            '--isolation-verified' => true,
            '--production-access-blocked' => true,
            '--pitr-replay-verified' => true,
            '--schema-verified' => true,
            '--row-counts-verified' => true,
            '--migration-state-verified' => true,
            '--database-constraints-verified' => true,
            '--booking-integrity-verified' => true,
            '--membership-integrity-verified' => true,
            '--payment-integrity-verified' => true,
            '--users-integrity-verified' => true,
            '--authorization-integrity-verified' => true,
            '--content-integrity-verified' => true,
            '--audit-ledger-verified' => true,
            '--application-smoke-verified' => true,
            '--quiet' => true,
        ], $overrides));
    }

    /** @return array<string, mixed> */
    private function backupPayload(): array
    {
        return [
            'schema_version' => 1,
            'evidence_type' => 'backup_verified',
            'operation_id' => 'backup-attested-20260823-001',
            'backup_id' => 'backup-attested-20260823-001',
            'provider' => 'managed-db',
            'verifier' => 'ubsc-recovery-verifier-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'backup_destination_id' => 'ubsc-vault-v1',
            'primary_region' => 'ap-southeast-3',
            'recovery_region' => 'ap-southeast-1',
            'source_snapshot_at' => '2026-08-23T11:55:00+07:00',
            'recovery_point_at' => '2026-08-23T11:59:00+07:00',
            'completed_at' => '2026-08-23T12:00:00+07:00',
            'immutable_until' => '2026-09-28T12:00:00+07:00',
            'object_lock_mode' => 'compliance',
            'size_bytes' => 12_345_678,
            'checksum_sha256' => self::CHECKSUM,
            'archive_readable' => true,
            'checksum_verified' => true,
            'encrypted' => true,
            'offsite' => true,
            'cross_account' => true,
            'cross_region' => true,
        ];
    }

    /** @return array<string, mixed> */
    private function pitrPayload(): array
    {
        return [
            'schema_version' => 1,
            'evidence_type' => 'pitr_observation',
            'operation_id' => 'pitr-attested-20260823-001',
            'provider' => 'managed-db',
            'verifier' => 'ubsc-recovery-verifier-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'backup_destination_id' => 'ubsc-vault-v1',
            'primary_region' => 'ap-southeast-3',
            'recovery_region' => 'ap-southeast-1',
            'latest_recovery_point_at' => '2026-08-23T12:33:00+07:00',
            'checked_at' => '2026-08-23T12:34:30+07:00',
            'continuous' => true,
            'restorable' => true,
        ];
    }

    /** @return array<string, mixed> */
    private function backupFailurePayload(): array
    {
        return [
            'schema_version' => 1,
            'evidence_type' => 'backup_failed',
            'operation_id' => 'backup-attested-20260823-failed-001',
            'backup_id' => 'backup-attested-20260823-failed-001',
            'provider' => 'managed-db',
            'verifier' => 'ubsc-recovery-verifier-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'backup_destination_id' => 'ubsc-vault-v1',
            'primary_region' => 'ap-southeast-3',
            'recovery_region' => 'ap-southeast-1',
            'failure_code' => 'checksum_mismatch',
            'checked_at' => '2026-08-23T12:34:00+07:00',
        ];
    }

    /** @return array<string, mixed> */
    private function restorePayload(): array
    {
        return [
            'schema_version' => 1,
            'evidence_type' => 'restore_drill',
            'operation_id' => 'restore-attested-20260823-001',
            'backup_id' => 'backup-attested-20260823-001',
            'provider' => 'managed-db',
            'verifier' => 'ubsc-recovery-verifier-v1',
            'dataset_id' => 'ubsc-relational-v1',
            'backup_destination_id' => 'ubsc-vault-v1',
            'primary_region' => 'ap-southeast-3',
            'recovery_region' => 'ap-southeast-1',
            'target_environment' => 'restore-drill-isolated-01',
            'recovery_point_at' => '2026-08-23T12:00:00+07:00',
            'started_at' => '2026-08-23T12:02:00+07:00',
            'completed_at' => '2026-08-23T12:32:00+07:00',
            'checksum_sha256' => self::CHECKSUM,
            'isolation_verified' => true,
            'production_access_blocked' => true,
            'pitr_replay_verified' => true,
            'schema_verified' => true,
            'row_counts_verified' => true,
            'migration_state_verified' => true,
            'database_constraints_verified' => true,
            'booking_integrity_verified' => true,
            'membership_integrity_verified' => true,
            'payment_integrity_verified' => true,
            'users_integrity_verified' => true,
            'authorization_integrity_verified' => true,
            'content_integrity_verified' => true,
            'audit_ledger_verified' => true,
            'application_smoke_verified' => true,
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function signedEnvelope(
        array $payload,
        ?\OpenSSLAsymmetricKey $privateKey = null,
        string $keyId = 'verifier-v1',
    ): array {
        $signature = '';
        self::assertTrue(openssl_sign(
            app(\App\Services\Production\RecoveryAttestationVerifier::class)
                ->canonicalJson($payload),
            $signature,
            $privateKey ?? self::$attestationPrivateKey,
            OPENSSL_ALGO_SHA256,
        ));

        return [
            'schema_version' => 1,
            'key_id' => $keyId,
            'payload' => $payload,
            'signature' => base64_encode($signature),
        ];
    }
}
