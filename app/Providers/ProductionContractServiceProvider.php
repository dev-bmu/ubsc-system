<?php

namespace App\Providers;

use App\Console\Commands\CheckCapacityPlanning;
use App\Console\Commands\CheckDatabaseReplication;
use App\Console\Commands\CheckDeployment;
use App\Console\Commands\CheckDdosProtection;
use App\Console\Commands\CheckDisasterRecovery;
use App\Console\Commands\CheckHighAvailability;
use App\Console\Commands\CheckObservability;
use App\Console\Commands\CheckProcessSupervision;
use App\Console\Commands\CheckProductionContract;
use App\Console\Commands\CheckResilienceDrills;
use App\Console\Commands\CheckSingleNodeRecovery;
use App\Console\Commands\EnsureStorageReadinessSentinel;
use App\Console\Commands\ImportDatabaseReplicationAttestation;
use App\Console\Commands\RecordResilienceDrillEvidence;
use App\Console\Commands\ShowProductionTopology;
use App\Console\Commands\VerifyDatabaseReplicationLedger;
use App\Console\Commands\VerifyResilienceDrillEvidence;
use App\Exceptions\CapacityPlanningContractViolation;
use App\Exceptions\DatabaseReplicationContractViolation;
use App\Exceptions\DeploymentContractViolation;
use App\Exceptions\DdosProtectionContractViolation;
use App\Exceptions\DisasterRecoveryContractViolation;
use App\Exceptions\HighAvailabilityContractViolation;
use App\Exceptions\ObservabilityContractViolation;
use App\Exceptions\ProcessSupervisionContractViolation;
use App\Exceptions\ProductionContractViolation;
use App\Exceptions\ResilienceDrillContractViolation;
use App\Services\Production\CapacityPlanningContract;
use App\Services\Production\DatabaseReplicationAttestationVerifier;
use App\Services\Production\DatabaseReplicationContract;
use App\Services\Production\DatabaseReplicationControlPlane;
use App\Services\Production\DatabaseReplicationEnvelopeReader;
use App\Services\Production\DeploymentContract;
use App\Services\Production\DdosProtectionContract;
use App\Services\Production\DisasterRecoveryContract;
use App\Services\Production\ExternalSliKeyring;
use App\Services\Production\HighAvailabilityContract;
use App\Services\Production\LogReceiptVerifier;
use App\Services\Production\ObservabilityContract;
use App\Services\Production\ProcessRuntimeProbe;
use App\Services\Production\ProcessSupervisionContract;
use App\Services\Production\ProductionContract;
use App\Services\Production\ProductionRuntimeContract;
use App\Services\Production\ProductionTopologyResolver;
use App\Services\Production\RecoveryAttestationVerifier;
use App\Services\Production\RecoveryEvidenceKeyring;
use App\Services\Production\RecoveryEvidenceLedger;
use App\Services\Production\ResilienceDrillContract;
use App\Services\Production\ResilienceDrillLedger;
use App\Services\Production\ResilienceEvidenceVerifier;
use App\Services\Production\ResilienceLedgerKeyring;
use App\Services\Production\ScheduledTaskSafetyContract;
use App\Services\Production\SingleNodeProductionContract;
use App\Services\Production\SupervisorConfigurationParser;
use Illuminate\Support\ServiceProvider;

final class ProductionContractServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ProductionContract::class);
        $this->app->singleton(ProductionTopologyResolver::class);
        $this->app->singleton(SingleNodeProductionContract::class);
        $this->app->singleton(ProductionRuntimeContract::class);
        $this->app->singleton(HighAvailabilityContract::class);
        $this->app->singleton(LogReceiptVerifier::class);
        $this->app->singleton(DatabaseReplicationAttestationVerifier::class);
        $this->app->singleton(DatabaseReplicationEnvelopeReader::class);
        $this->app->singleton(DatabaseReplicationControlPlane::class);
        $this->app->singleton(DatabaseReplicationContract::class);
        $this->app->singleton(DeploymentContract::class);
        $this->app->singleton(DdosProtectionContract::class);
        $this->app->singleton(RecoveryAttestationVerifier::class);
        $this->app->singleton(RecoveryEvidenceKeyring::class);
        $this->app->singleton(ExternalSliKeyring::class);
        $this->app->singleton(RecoveryEvidenceLedger::class);
        $this->app->singleton(DisasterRecoveryContract::class);
        $this->app->singleton(ObservabilityContract::class);
        $this->app->singleton(CapacityPlanningContract::class);
        $this->app->singleton(ResilienceEvidenceVerifier::class);
        $this->app->singleton(ResilienceLedgerKeyring::class);
        $this->app->singleton(ResilienceDrillLedger::class);
        $this->app->singleton(ResilienceDrillContract::class);
        $this->app->singleton(SupervisorConfigurationParser::class);
        $this->app->singleton(ProcessSupervisionContract::class);
        $this->app->singleton(ScheduledTaskSafetyContract::class);
        $this->app->singleton(ProcessRuntimeProbe::class);
        $this->commands([
            CheckProductionContract::class,
            CheckHighAvailability::class,
            CheckDatabaseReplication::class,
            CheckDeployment::class,
            CheckDdosProtection::class,
            CheckDisasterRecovery::class,
            CheckObservability::class,
            CheckCapacityPlanning::class,
            CheckResilienceDrills::class,
            CheckProcessSupervision::class,
            RecordResilienceDrillEvidence::class,
            VerifyResilienceDrillEvidence::class,
            ImportDatabaseReplicationAttestation::class,
            VerifyDatabaseReplicationLedger::class,
            ShowProductionTopology::class,
            CheckSingleNodeRecovery::class,
            EnsureStorageReadinessSentinel::class,
        ]);
    }

    public function boot(
        ProductionRuntimeContract $contract,
        ProductionTopologyResolver $topology,
        HighAvailabilityContract $highAvailability,
        DatabaseReplicationContract $databaseReplication,
        DeploymentContract $deployment,
        DdosProtectionContract $ddosProtection,
        DisasterRecoveryContract $disasterRecovery,
        ObservabilityContract $observability,
        CapacityPlanningContract $capacityPlanning,
        ResilienceDrillContract $resilienceDrills,
        ProcessSupervisionContract $processSupervision,
        ScheduledTaskSafetyContract $scheduledTasks,
    ): void {
        if ($this->app->environment(['local', 'testing'])) {
            return;
        }

        // Keep diagnostics and cache clearing bootable so a stale cached
        // configuration can be replaced safely. No application-serving or
        // data-mutating command receives this exception.
        if ($this->app->runningInConsole()) {
            $arguments = $_SERVER['argv'] ?? [];
            $command = collect(array_slice($arguments, 1))->first(
                static fn (mixed $argument): bool => is_string($argument)
                    && ! str_starts_with($argument, '-'),
            );

            if (in_array($command, [
                'production:check',
                'production:topology',
                'production:ha-check',
                'production:replication-check',
                'production:deployment-check',
                'production:ddos-check',
                'production:process-check',
                'production:recovery-check',
                'production:observability-check',
                'production:capacity-check',
                'production:resilience-check',
                'resilience:evidence:record',
                'resilience:evidence:verify',
                'config:clear',
                'optimize:clear',
            ], true)) {
                return;
            }
        }

        if (! $contract->shouldEnforce()) {
            throw ProductionContractViolation::fromCodes(['contract.enforcement']);
        }
        $contract->assertSatisfied();

        if ($topology->isSingleNode()) {
            if (! $processSupervision->shouldEnforce()) {
                throw ProcessSupervisionContractViolation::fromCodes(['contract.enforcement']);
            }

            // Single-node production still requires deterministic process
            // recovery and one scheduler. Multi-node infrastructure contracts
            // remain registered but are intentionally not executed here.
            if ($this->app->runningInConsole()) {
                $processSupervision->assertSatisfied();
                $scheduledTasks->assertSatisfied();
            }

            return;
        }

        if (! $highAvailability->shouldEnforce()) {
            throw HighAvailabilityContractViolation::fromCodes(['contract.enforcement']);
        }
        $highAvailability->assertSatisfied();

        if (! $databaseReplication->shouldEnforce()) {
            throw DatabaseReplicationContractViolation::fromCodes(['contract.enforcement']);
        }
        $databaseReplication->assertSatisfied();

        if (! $deployment->shouldEnforce()) {
            throw DeploymentContractViolation::fromCodes(['contract.enforcement']);
        }
        $deployment->assertSatisfied();

        if (! $ddosProtection->shouldEnforce()) {
            throw DdosProtectionContractViolation::fromCodes(['contract.enforcement']);
        }
        $ddosProtection->assertSatisfied();

        if (! $disasterRecovery->shouldEnforce()) {
            throw DisasterRecoveryContractViolation::fromCodes(['contract.enforcement']);
        }
        $disasterRecovery->assertSatisfied();

        if (! $observability->shouldEnforce()) {
            throw ObservabilityContractViolation::fromCodes(['contract.enforcement']);
        }
        $observability->assertSatisfied();

        if (! $processSupervision->shouldEnforce()) {
            throw ProcessSupervisionContractViolation::fromCodes(['contract.enforcement']);
        }

        if (! $capacityPlanning->shouldEnforce()) {
            throw CapacityPlanningContractViolation::fromCodes(['contract.enforcement']);
        }
        $capacityPlanning->assertSatisfied();

        if (! $resilienceDrills->shouldEnforce()) {
            throw ResilienceDrillContractViolation::fromCodes(['contract.enforcement']);
        }
        $resilienceDrills->assertSatisfied();

        // HTTP requests must never parse operating-system artifacts or resolve
        // the scheduler. Release gates and every long-lived CLI process fail
        // closed once at startup, preserving both safety and request latency.
        if ($this->app->runningInConsole()) {
            $processSupervision->assertSatisfied();
            $scheduledTasks->assertSatisfied();
        }
    }
}
