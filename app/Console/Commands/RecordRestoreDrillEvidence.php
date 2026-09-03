<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Production\RecoveryEvidenceLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Throwable;

final class RecordRestoreDrillEvidence extends Command
{
    protected $signature = 'recovery:restore-drill-record
        {--drill-id= : Stable opaque ID for this drill; retries reuse the same ID}
        {--backup-id= : Verified backup identifier being restored}
        {--provider= : Managed database/backup provider identifier}
        {--target-environment= : Explicit isolated non-production target}
        {--recovery-point-at= : Restored point in time, ISO-8601}
        {--started-at= : Drill start, ISO-8601}
        {--completed-at= : Drill completion, ISO-8601}
        {--checksum-sha256= : SHA-256 of the verified source backup}
        {--isolation-verified : Network/account isolation from production was verified}
        {--production-access-blocked : Production credentials and write paths were unavailable}
        {--pitr-replay-verified : Provider recovery logs replayed through the claimed recovery point}
        {--schema-verified : Restored schema passed verification}
        {--row-counts-verified : Critical aggregate row counts matched}
        {--migration-state-verified : Applied migration state matches the approved release}
        {--database-constraints-verified : Foreign keys and critical unique constraints passed}
        {--booking-integrity-verified : Booking invariants passed}
        {--membership-integrity-verified : Membership invariants passed}
        {--payment-integrity-verified : Payment invariants passed}
        {--users-integrity-verified : User identity and account invariants passed}
        {--authorization-integrity-verified : Roles and permissions invariants passed}
        {--content-integrity-verified : News and article relational metadata passed}
        {--audit-ledger-verified : Service audit ledger verified without gaps or tampering}
        {--application-smoke-verified : Read-only application smoke checks passed}';

    protected $description = 'Append signed evidence for an isolated database restore drill';

    public function handle(RecoveryEvidenceLedger $ledger): int
    {
        if (! (bool) config('disaster_recovery.restore_drill.enabled', false)) {
            $this->components->error('Restore drill evidence is disabled.');

            return self::INVALID;
        }

        try {
            $evidence = $ledger->recordRestoreDrill([
                'operation_id' => $this->option('drill-id'),
                'backup_id' => $this->option('backup-id'),
                'provider' => $this->option('provider'),
                'target_environment' => $this->option('target-environment'),
                'recovery_point_at' => $this->option('recovery-point-at'),
                'started_at' => $this->option('started-at'),
                'completed_at' => $this->option('completed-at'),
                'checksum_sha256' => $this->option('checksum-sha256'),
                'isolation_verified' => (bool) $this->option('isolation-verified'),
                'production_access_blocked' => (bool) $this->option('production-access-blocked'),
                'pitr_replay_verified' => (bool) $this->option('pitr-replay-verified'),
                'schema_verified' => (bool) $this->option('schema-verified'),
                'row_counts_verified' => (bool) $this->option('row-counts-verified'),
                'migration_state_verified' => (bool) $this->option('migration-state-verified'),
                'database_constraints_verified' => (bool) $this->option('database-constraints-verified'),
                'booking_integrity_verified' => (bool) $this->option('booking-integrity-verified'),
                'membership_integrity_verified' => (bool) $this->option('membership-integrity-verified'),
                'payment_integrity_verified' => (bool) $this->option('payment-integrity-verified'),
                'users_integrity_verified' => (bool) $this->option('users-integrity-verified'),
                'authorization_integrity_verified' => (bool) $this->option('authorization-integrity-verified'),
                'content_integrity_verified' => (bool) $this->option('content-integrity-verified'),
                'audit_ledger_verified' => (bool) $this->option('audit-ledger-verified'),
                'application_smoke_verified' => (bool) $this->option('application-smoke-verified'),
            ]);

            if (! $this->option('quiet')) {
                $this->components->info(
                    "Restore drill evidence #{$evidence->sequence} recorded as {$evidence->status}.",
                );
            }

            return $evidence->status === MonitoringStatus::Operational->value
                ? self::SUCCESS
                : self::FAILURE;
        } catch (InvalidArgumentException $exception) {
            if (! $this->option('quiet')) {
                $this->components->error($exception->getMessage());
            }

            return self::INVALID;
        } catch (Throwable $exception) {
            Log::error('recovery.restore_drill_evidence_failed', [
                'failure_class' => $exception::class,
            ]);

            if (! $this->option('quiet')) {
                $this->components->error('Restore drill evidence could not be recorded.');
            }

            return self::FAILURE;
        }
    }
}
