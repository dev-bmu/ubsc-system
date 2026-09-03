<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Models\ResilienceDrillEvidence;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Throwable;

final class ResilienceDrillMonitor
{
    /** @return array<string, mixed> */
    public function summary(): array
    {
        $enabled = (bool) config('resilience_drills.enabled', false);
        $enforced = (bool) config('resilience_drills.enforce', false);
        $required = array_values((array) config(
            'resilience_drills.campaign.required_scenarios',
            [],
        ));
        $targetEnvironment = strtolower(trim((string) config(
            'resilience_drills.target.environment',
            '',
        )));
        $infrastructureProfile = trim((string) config(
            'resilience_drills.target.infrastructure_profile',
            '',
        ));
        $provider = strtolower(trim((string) config(
            'resilience_drills.target.provider',
            '',
        )));
        $orchestrator = strtolower(trim((string) config(
            'resilience_drills.target.orchestrator',
            '',
        )));
        if (! $enabled && ! $enforced) {
            return [
                'configured' => false,
                'enabled' => false,
                'enforced' => false,
                'status' => MonitoringStatus::Unknown->value,
                'target_environment' => $targetEnvironment,
                'infrastructure_profile' => $infrastructureProfile,
                'provider' => $provider,
                'orchestrator' => $orchestrator,
                'required_scenarios' => $required,
                'campaign' => $this->campaign(false, null, $required),
                'ledger' => $this->ledger(false, null),
                'message' => 'Resilience drill evidence is not configured.',
            ];
        }
        $campaignKey = (string) config(
            'resilience_drills.evidence.heartbeat_key',
            'resilience-drill-campaign',
        );
        $ledgerKey = (string) config(
            'resilience_drills.evidence.verification_heartbeat_key',
            'resilience-drill-ledger',
        );

        $readFailed = false;
        try {
            $latest = ResilienceDrillEvidence::query()
                ->where('environment', $targetEnvironment)
                ->where('infrastructure_profile', $infrastructureProfile)
                ->where('provider', $provider)
                ->where('orchestrator', $orchestrator)
                ->latest('completed_at')
                ->latest('id')
                ->first();
            $heartbeats = MonitoringHeartbeat::query()
                ->whereIn('key', [$campaignKey, $ledgerKey])
                ->get()
                ->keyBy('key');
        } catch (Throwable) {
            $latest = null;
            $heartbeats = collect();
            $readFailed = true;
        }

        $campaign = $this->campaign($enabled, $latest, $required);
        $ledger = $this->ledger($enforced, $heartbeats->get($ledgerKey));
        if ($readFailed) {
            $campaign['status'] = MonitoringStatus::Outage->value;
            $campaign['message'] = 'Resilience campaign evidence could not be read.';
            $ledger['status'] = MonitoringStatus::Outage->value;
            $ledger['message'] = 'Resilience ledger verification state could not be read.';
        }
        $status = match (true) {
            $readFailed => MonitoringStatus::Outage,
            $enforced && ! $enabled => MonitoringStatus::Outage,
            $enabled => MonitoringStatus::worst([
                MonitoringStatus::tryFrom((string) $campaign['status'])
                    ?? MonitoringStatus::Outage,
                MonitoringStatus::tryFrom((string) $ledger['status'])
                    ?? MonitoringStatus::Outage,
            ]),
            default => MonitoringStatus::Unknown,
        };

        return [
            'configured' => $enabled || $enforced,
            'enabled' => $enabled,
            'enforced' => $enforced,
            'status' => $status->value,
            'target_environment' => $targetEnvironment,
            'infrastructure_profile' => $infrastructureProfile,
            'provider' => $provider,
            'orchestrator' => $orchestrator,
            'required_scenarios' => $required,
            'campaign' => $campaign,
            'ledger' => $ledger,
            'message' => match ($status) {
                MonitoringStatus::Operational => 'The latest controlled game day passed and its signed evidence ledger is intact.',
                MonitoringStatus::Degraded => 'Resilience proof is due soon or the latest campaign was safely aborted.',
                MonitoringStatus::Outage => $readFailed
                    ? 'Resilience proof storage or verification state is unavailable.'
                    : ($enforced && ! $enabled
                        ? 'Resilience enforcement is enabled while controlled campaigns are disabled.'
                        : 'Resilience proof is overdue, failed, incomplete for the active topology, or its evidence integrity is compromised.'),
                default => 'Resilience drill evidence is not configured or cannot be read.',
            },
        ];
    }

    /**
     * @param  list<string>  $required
     * @return array<string, mixed>
     */
    private function campaign(
        bool $enabled,
        ?ResilienceDrillEvidence $latest,
        array $required,
    ): array {
        if (! $enabled || $latest === null || $latest->completed_at === null) {
            return [
                'status' => $enabled
                    ? MonitoringStatus::Outage->value
                    : MonitoringStatus::Unknown->value,
                'campaign_id' => null,
                'completed_at' => null,
                'age_seconds' => null,
                'scenario_count' => 0,
                'passed_count' => 0,
                'failed_count' => 0,
                'aborted_count' => 0,
                'campaign_controls_passed' => false,
                'worst_detection_seconds' => null,
                'worst_recovery_seconds' => null,
                'coverage' => [
                    'required' => count($required),
                    'observed' => 0,
                    'missing' => $required,
                ],
                'scenarios' => [],
                'message' => $enabled
                    ? 'No signed resilience campaign has been recorded for the active topology.'
                    : 'Resilience campaigns are disabled.',
            ];
        }

        $age = $this->age($latest->completed_at);
        $warningAfter = max(1, (int) config(
            'resilience_drills.campaign.interval_days',
            90,
        )) * 86_400;
        $outageAfter = $warningAfter + max(1, (int) config(
            'resilience_drills.campaign.grace_days',
            14,
        )) * 86_400;
        $freshness = match (true) {
            $age === null => MonitoringStatus::Outage,
            $age >= $outageAfter => MonitoringStatus::Outage,
            $age >= $warningAfter => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $recorded = MonitoringStatus::tryFrom((string) $latest->status)
            ?? MonitoringStatus::Outage;
        $payloadScenarios = is_array($latest->payload)
            ? (array) ($latest->payload['scenarios'] ?? [])
            : [];
        $scenarios = collect($payloadScenarios)
            ->filter(static fn (mixed $scenario): bool => is_array($scenario))
            ->map(static fn (array $scenario): array => [
                'key' => (string) ($scenario['key'] ?? 'unknown'),
                'fault_domain' => (string) ($scenario['fault_domain'] ?? 'unknown'),
                'outcome' => (string) ($scenario['outcome'] ?? 'unknown'),
                'detection_seconds' => is_numeric($scenario['detection_seconds'] ?? null)
                    ? max(0, (int) $scenario['detection_seconds'])
                    : null,
                'recovery_seconds' => is_numeric($scenario['recovery_seconds'] ?? null)
                    ? max(0, (int) $scenario['recovery_seconds'])
                    : null,
                'expected_recovery_seconds' => is_numeric(
                    $scenario['expected_recovery_seconds'] ?? null,
                ) ? max(0, (int) $scenario['expected_recovery_seconds']) : null,
            ])
            ->values()
            ->all();
        $observed = array_values(array_unique(array_map(
            static fn (array $scenario): string => $scenario['key'],
            $scenarios,
        )));
        $missing = array_values(array_diff($required, $observed));
        $status = MonitoringStatus::worst([
            $recorded,
            $freshness,
            $missing === [] ? MonitoringStatus::Operational : MonitoringStatus::Outage,
        ]);

        return [
            'status' => $status->value,
            'campaign_id' => (string) $latest->campaign_id,
            'release' => (string) $latest->release,
            'completed_at' => $latest->completed_at->toIso8601String(),
            'age_seconds' => $age,
            'scenario_count' => (int) $latest->scenario_count,
            'passed_count' => (int) $latest->passed_count,
            'failed_count' => (int) $latest->failed_count,
            'aborted_count' => (int) $latest->aborted_count,
            'campaign_controls_passed' => (bool) $latest->campaign_controls_passed,
            'worst_detection_seconds' => (int) $latest->worst_detection_seconds,
            'worst_recovery_seconds' => (int) $latest->worst_recovery_seconds,
            'coverage' => [
                'required' => count($required),
                'observed' => count(array_intersect($required, $observed)),
                'missing' => $missing,
            ],
            'scenarios' => $scenarios,
            'message' => match ($status) {
                MonitoringStatus::Operational => 'Every required fault scenario recovered inside its objective.',
                MonitoringStatus::Degraded => 'The latest campaign is due or contains a controlled abort.',
                MonitoringStatus::Outage => 'The latest campaign failed, missed a signed campaign control, or is outside its accepted freshness window.',
                default => 'Campaign freshness cannot be determined.',
            },
        ];
    }

    /** @return array<string, mixed> */
    private function ledger(bool $configured, ?MonitoringHeartbeat $heartbeat): array
    {
        if (! $configured || $heartbeat?->observed_at === null) {
            return [
                'configured' => $configured,
                'status' => $configured
                    ? MonitoringStatus::Outage->value
                    : MonitoringStatus::Unknown->value,
                'observed_at' => null,
                'age_seconds' => null,
                'total_evidence' => null,
                'last_sequence' => null,
                'failure_count' => null,
                'message' => $configured
                    ? 'The resilience evidence ledger has no current verification proof.'
                    : 'Resilience evidence enforcement is disabled.',
            ];
        }

        $age = $this->age($heartbeat->observed_at);
        $freshness = match (true) {
            $age === null => MonitoringStatus::Outage,
            $age >= (int) config(
                'resilience_drills.evidence.verification_outage_after_seconds',
                259_200,
            ) => MonitoringStatus::Outage,
            $age >= (int) config(
                'resilience_drills.evidence.verification_warning_after_seconds',
                129_600,
            ) => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $status = MonitoringStatus::worst([
            MonitoringStatus::tryFrom((string) $heartbeat->status)
                ?? MonitoringStatus::Outage,
            $freshness,
        ]);
        $context = is_array($heartbeat->context) ? $heartbeat->context : [];

        return [
            'configured' => true,
            'status' => $status->value,
            'observed_at' => $heartbeat->observed_at->toIso8601String(),
            'age_seconds' => $age,
            'total_evidence' => $this->integer($context['total_evidence'] ?? null),
            'last_sequence' => $this->integer($context['last_sequence'] ?? null),
            'failure_count' => $this->integer($context['failure_count'] ?? null),
            'message' => match ($status) {
                MonitoringStatus::Operational => 'The append-only resilience evidence chain and signatures are valid.',
                MonitoringStatus::Degraded => 'Resilience evidence verification is approaching its maximum age.',
                MonitoringStatus::Outage => 'Resilience evidence is stale or failed integrity verification.',
                default => 'Resilience evidence integrity cannot be determined.',
            },
        ];
    }

    private function age(CarbonInterface $observedAt): ?int
    {
        $now = CarbonImmutable::now('UTC');
        $maximumSkew = (int) config(
            'resilience_drills.evidence.maximum_clock_skew_seconds',
            300,
        );
        if ($observedAt->greaterThan($now->addSeconds($maximumSkew))) {
            return null;
        }

        return max(0, (int) $observedAt->diffInSeconds($now));
    }

    private function integer(mixed $value): ?int
    {
        return is_numeric($value) ? max(0, (int) $value) : null;
    }
}
