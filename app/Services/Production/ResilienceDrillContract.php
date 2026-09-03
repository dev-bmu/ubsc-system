<?php

namespace App\Services\Production;

use App\Enums\MonitoringStatus;
use App\Exceptions\ResilienceDrillContractViolation;
use App\Services\Monitoring\ResilienceDrillMonitor;
use App\Support\ResilienceTargetPolicy;
use Illuminate\Contracts\Config\Repository;
use Throwable;

final class ResilienceDrillContract
{
    public function __construct(
        private readonly Repository $config,
        private readonly ResilienceEvidenceVerifier $verifier,
        private readonly ResilienceLedgerKeyring $keyring,
        private readonly ResilienceDrillLedger $ledger,
        private readonly ResilienceDrillMonitor $monitor,
    ) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('resilience_drills.enforce', false);
    }

    /** @return array<string, mixed> */
    public function report(bool $live = false): array
    {
        $checks = [];
        $production = strtolower((string) $this->config->get('app.env')) === 'production';
        $enabled = (bool) $this->config->get('resilience_drills.enabled', false);
        $enforced = $this->shouldEnforce();

        $this->add($checks, 'resilience.enabled', $enabled ? 'pass' : 'fail',
            $enabled ? 'Controlled resilience campaigns are enabled.' : 'RESILIENCE_DRILLS_ENABLED must be true.');
        $this->add(
            $checks,
            'contract.enforcement',
            $enforced ? 'pass' : ($production ? 'fail' : 'warning'),
            $enforced
                ? 'The resilience evidence contract is enforced.'
                : ($production
                    ? 'RESILIENCE_DRILLS_ENFORCE must be true in production.'
                    : 'Resilience enforcement is intentionally disabled outside production.'),
        );

        $target = strtolower(trim((string) $this->config->get(
            'resilience_drills.target.environment',
            '',
        )));
        $productionForbidden = (bool) $this->config->get(
            'resilience_drills.safety.production_fault_injection_forbidden',
            false,
        );
        $targetSafe = $this->identifier($target, 32) && ! $this->productionLike($target);
        $this->add(
            $checks,
            'safety.non_production_target',
            $targetSafe && $productionForbidden ? 'pass' : 'fail',
            $targetSafe && $productionForbidden
                ? "Fault evidence is accepted only for the non-production [{$target}] target."
                : 'The target must be explicit, non-production, and protected by the production-injection prohibition.',
        );

        $profile = trim((string) $this->config->get(
            'resilience_drills.target.infrastructure_profile',
            '',
        ));
        $provider = trim((string) $this->config->get('resilience_drills.target.provider', ''));
        $orchestrator = trim((string) $this->config->get(
            'resilience_drills.target.orchestrator',
            '',
        ));
        $identitiesSafe = $this->identifier($profile, 128)
            && $this->identifier($provider, 64)
            && $this->identifier($orchestrator, 64)
            && ! hash_equals(strtolower($provider), strtolower($orchestrator));
        $this->add(
            $checks,
            'target.independent_orchestrator',
            $identitiesSafe ? 'pass' : 'fail',
            $identitiesSafe
                ? 'The immutable target profile, provider, and independent orchestrator are explicit.'
                : 'Target profile, provider, and a distinct orchestrator identity are required.',
        );

        $required = array_values((array) $this->config->get(
            'resilience_drills.campaign.required_scenarios',
            [],
        ));
        $foundation = [
            'application_node_loss',
            'load_balancer_failover',
            'queue_worker_restart',
            'cache_primary_failover',
            'database_writer_failover',
        ];
        $scenarioSafe = count($required) === count(array_unique($required))
            && array_diff($foundation, $required) === []
            && collect($required)->every(function (mixed $scenario): bool {
                if (! is_string($scenario) || ! $this->identifier($scenario, 64)) {
                    return false;
                }
                $definition = $this->config->get("resilience_drills.scenarios.{$scenario}");

                return is_array($definition)
                    && $this->identifier((string) ($definition['fault_domain'] ?? ''), 32)
                    && (int) ($definition['maximum_recovery_seconds'] ?? 0) >= 1
                    && (int) ($definition['maximum_recovery_seconds'] ?? 0) <= 3_600;
            });
        $this->add(
            $checks,
            'campaign.failure_domains',
            $scenarioSafe ? 'pass' : 'fail',
            $scenarioSafe
                ? count($required).' required scenarios cover edge, application, queue, cache, and database failure domains.'
                : 'Every foundational failure domain must have one unique bounded scenario.',
        );

        $interval = (int) $this->config->get('resilience_drills.campaign.interval_days', 0);
        $maximumInterval = (int) $this->config->get(
            'resilience_drills.campaign.maximum_interval_days',
            90,
        );
        $grace = (int) $this->config->get('resilience_drills.campaign.grace_days', 0);
        $cadenceSafe = $interval >= 1
            && $interval <= min(90, $maximumInterval)
            && $grace >= 1
            && $grace <= 30;
        $this->add(
            $checks,
            'campaign.cadence',
            $cadenceSafe ? 'pass' : 'fail',
            $cadenceSafe
                ? "A complete signed campaign is required every {$interval} days with {$grace} days of grace."
                : 'Campaign cadence must be no more than 90 days with at most 30 days of grace.',
        );

        $safetyFlags = [
            'external_orchestrator_required',
            'manual_approval_required',
            'change_reference_required',
            'synthetic_traffic_only',
            'provider_kill_switch_required',
            'one_fault_at_a_time',
        ];
        $flagsSafe = collect($safetyFlags)->every(
            fn (string $flag): bool => (bool) $this->config->get(
                "resilience_drills.safety.{$flag}",
                false,
            ),
        );
        $blast = (int) $this->config->get(
            'resilience_drills.safety.maximum_blast_radius_percent',
            0,
        );
        $healthyFloor = (int) $this->config->get(
            'resilience_drills.safety.minimum_healthy_instances',
            0,
        );
        $scenarioSeconds = (int) $this->config->get(
            'resilience_drills.safety.maximum_scenario_seconds',
            0,
        );
        $campaignSeconds = (int) $this->config->get(
            'resilience_drills.campaign.maximum_campaign_seconds',
            0,
        );
        $limitsSafe = $flagsSafe
            && $blast >= 1 && $blast <= 50
            && $healthyFloor >= 1
            && $scenarioSeconds >= 30 && $scenarioSeconds <= 3_600
            && $campaignSeconds >= $scenarioSeconds
            && $campaignSeconds <= 43_200;
        $this->add(
            $checks,
            'safety.bounded_experiment',
            $limitsSafe ? 'pass' : 'fail',
            $limitsSafe
                ? 'Approval, synthetic traffic, kill switch, sequential faults, healthy-instance floor, duration, and blast radius are fail-closed.'
                : 'One or more mandatory game-day safety boundaries are disabled or unbounded.',
        );

        $errorRate = (float) $this->config->get(
            'resilience_drills.safety.maximum_error_rate_percent',
            0,
        );
        $p95 = (int) $this->config->get('resilience_drills.safety.maximum_p95_ms', 0);
        $abortSafe = $errorRate >= 0.1 && $errorRate <= 5.0 && $p95 >= 250 && $p95 <= 10_000;
        $this->add(
            $checks,
            'safety.abort_boundaries',
            $abortSafe ? 'pass' : 'fail',
            $abortSafe
                ? "Automatic abort evidence is bounded at {$errorRate}% errors and {$p95} ms p95."
                : 'Error-rate and latency abort boundaries are missing or unsafe.',
        );

        $hasVerificationKeys = extension_loaded('openssl')
            && $this->verifier->hasAnyKey()
            && $this->verifier->hasValidActiveKeyConfiguration();
        $this->add(
            $checks,
            'evidence.external_signature',
            $hasVerificationKeys ? 'pass' : 'fail',
            $hasVerificationKeys
                ? 'Strong external RSA/ECDSA keys and an explicit active-key allowlist are configured.'
                : 'OpenSSL, strong public evidence keys, and a valid active-key allowlist are required.',
        );
        $activeLedger = $this->keyring->active();
        $this->add(
            $checks,
            'evidence.ledger_signing_key',
            $activeLedger !== null ? 'pass' : 'fail',
            $activeLedger !== null
                ? 'The append-only ledger has a strong active signing key with rotation support.'
                : 'RESILIENCE_LEDGER_ACTIVE_KEY_ID must resolve to a strong secret-manager key.',
        );

        $maximumPayloadBytes = (int) $this->config->get(
            'resilience_drills.evidence.maximum_payload_bytes',
            0,
        );
        $maximumEnvelopeBytes = (int) $this->config->get(
            'resilience_drills.evidence.maximum_envelope_bytes',
            0,
        );
        $clockSkew = (int) $this->config->get(
            'resilience_drills.evidence.maximum_clock_skew_seconds',
            -1,
        );
        $evidenceBoundsSafe = $maximumPayloadBytes >= 16_384
            && $maximumPayloadBytes <= 131_072
            && $maximumEnvelopeBytes >= $maximumPayloadBytes + 4_096
            && $maximumEnvelopeBytes <= 262_144
            && $clockSkew >= 0
            && $clockSkew <= 300;
        $this->add(
            $checks,
            'evidence.bounded_input',
            $evidenceBoundsSafe ? 'pass' : 'fail',
            $evidenceBoundsSafe
                ? "Payload/envelope input is bounded at {$maximumPayloadBytes}/{$maximumEnvelopeBytes} bytes with {$clockSkew} seconds of clock tolerance."
                : 'Payload and envelope bounds must be internally consistent, at most 128/256 KiB, with no more than 300 seconds of clock tolerance.',
        );

        $campaignHeartbeat = trim((string) $this->config->get(
            'resilience_drills.evidence.heartbeat_key',
            '',
        ));
        $verificationHeartbeat = trim((string) $this->config->get(
            'resilience_drills.evidence.verification_heartbeat_key',
            '',
        ));
        $verificationWarning = (int) $this->config->get(
            'resilience_drills.evidence.verification_warning_after_seconds',
            0,
        );
        $verificationOutage = (int) $this->config->get(
            'resilience_drills.evidence.verification_outage_after_seconds',
            0,
        );
        $freshnessSafe = $this->identifier($campaignHeartbeat, 100)
            && $this->identifier($verificationHeartbeat, 100)
            && ! hash_equals($campaignHeartbeat, $verificationHeartbeat)
            && $verificationWarning >= 3_600
            && $verificationWarning <= 604_800
            && $verificationOutage > $verificationWarning
            && $verificationOutage <= 1_209_600;
        $this->add(
            $checks,
            'evidence.verification_freshness',
            $freshnessSafe ? 'pass' : 'fail',
            $freshnessSafe
                ? 'Distinct campaign/ledger signals and bounded verification freshness thresholds are configured.'
                : 'Campaign and ledger heartbeat keys must be valid and distinct; ledger warning/outage thresholds must be ordered and bounded to 7/14 days.',
        );

        if ($live) {
            try {
                $integrity = $this->ledger->verify();
                $this->add(
                    $checks,
                    'live.ledger_integrity',
                    $integrity['valid'] ? 'pass' : 'fail',
                    $integrity['valid']
                        ? "The complete {$integrity['total']}-record evidence chain is intact."
                        : 'The resilience evidence chain is incomplete, modified, or cannot be trusted.',
                );
                $summary = $this->monitor->summary();
                $liveStatus = MonitoringStatus::tryFrom((string) $summary['status'])
                    ?? MonitoringStatus::Unknown;
                $this->add(
                    $checks,
                    'live.campaign',
                    $liveStatus === MonitoringStatus::Operational ? 'pass' : 'fail',
                    (string) ($summary['message'] ?? 'Resilience campaign state is unavailable.'),
                );
            } catch (Throwable) {
                $this->add(
                    $checks,
                    'live.control_plane',
                    'fail',
                    'Live resilience evidence could not be read or verified.',
                );
            }
        }

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
        $report = $this->report(false);
        if (! $report['valid']) {
            throw ResilienceDrillContractViolation::fromCodes(array_values(array_map(
                static fn (array $check): string => $check['code'],
                array_filter(
                    $report['checks'],
                    static fn (array $check): bool => $check['status'] === 'fail',
                ),
            )));
        }
    }

    private function productionLike(string $environment): bool
    {
        return ResilienceTargetPolicy::isProductionLike(
            $environment,
            (array) $this->config->get(
                'resilience_drills.target.production_names',
                [],
            ),
        );
    }

    private function identifier(string $value, int $maximum): bool
    {
        return $value !== ''
            && strlen($value) <= $maximum
            && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:@\/-]*\z/', $value) === 1
            && preg_match('/replace|example|placeholder|secret-manager/i', $value) !== 1;
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
    }
}
