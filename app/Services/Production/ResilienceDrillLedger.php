<?php

namespace App\Services\Production;

use App\Enums\MonitoringStatus;
use App\Models\ResilienceDrillEvidence;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use App\Support\ResilienceTargetPolicy;
use App\Support\StrictRfc3339Timestamp;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

final class ResilienceDrillLedger
{
    private const HEAD_KEY = 'primary';

    /** @var list<string> */
    private const PAYLOAD_KEYS = [
        'approval_reference',
        'approval_verified',
        'campaign_id',
        'change_reference_verified',
        'completed_at',
        'environment',
        'infrastructure_profile',
        'orchestrator',
        'orchestrator_identity_verified',
        'production_access_denied',
        'provider',
        'release',
        'scenarios',
        'schema_version',
        'started_at',
        'traffic_mode',
    ];

    /** @var list<string> */
    private const SCENARIO_KEYS = [
        'abort_triggered',
        'blast_radius_percent',
        'checks',
        'completed_at',
        'detection_seconds',
        'expected_recovery_seconds',
        'fault_domain',
        'healthy_instances_remaining',
        'key',
        'outcome',
        'peak_error_rate_basis_points',
        'peak_p95_ms',
        'recovery_seconds',
        'started_at',
    ];

    /** @var list<string> */
    private const CHECK_KEYS = [
        'abort_guard_active',
        'alert_delivered',
        'booking_integrity',
        'kill_switch_armed',
        'membership_integrity',
        'monitoring_active',
        'no_data_loss',
        'no_duplicate_reservations',
        'payment_integrity',
        'preflight_healthy',
        'readiness_recovered',
        'steady_state_recovered',
    ];

    public function __construct(
        private readonly ResilienceEvidenceVerifier $verifier,
        private readonly ResilienceLedgerKeyring $keyring,
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    /**
     * @param  array<string, mixed>  $envelope
     */
    public function record(array $envelope): ResilienceDrillEvidence
    {
        $this->assertRuntimeSafety();
        $this->assertExactKeys($envelope, ['key_id', 'payload', 'schema_version', 'signature'], 'envelope');
        if (($envelope['schema_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Unsupported resilience evidence envelope version.');
        }

        $keyId = $this->identifier($envelope['key_id'] ?? null, 'key_id', 32);
        if (! $this->verifier->isActiveKey($keyId)) {
            throw new InvalidArgumentException(
                'Resilience evidence key is not authorized for new campaign imports.',
            );
        }
        $signature = is_string($envelope['signature'] ?? null)
            ? trim((string) $envelope['signature'])
            : '';
        $payload = $envelope['payload'] ?? null;
        if (! is_array($payload) || array_is_list($payload)) {
            throw new InvalidArgumentException('Resilience evidence payload must be one JSON object.');
        }
        $payloadBytes = strlen($this->verifier->canonicalJson($payload));
        $maximumPayloadBytes = min(131_072, max(16_384, (int) config(
            'resilience_drills.evidence.maximum_payload_bytes',
            131_072,
        )));
        if ($payloadBytes > $maximumPayloadBytes) {
            throw new InvalidArgumentException('Resilience evidence payload exceeds the safety limit.');
        }
        if (! $this->verifier->verify($payload, $keyId, $signature)) {
            throw new InvalidArgumentException('Resilience evidence signature is invalid.');
        }

        $normalized = $this->validatePayload($payload);
        $payloadHash = $this->verifier->hash($payload);
        $active = $this->keyring->active();
        if ($active === null) {
            throw new RuntimeException('A valid resilience ledger signing key is required.');
        }

        $beforeAppend = $this->verifyAndRecordHeartbeat();
        if (! $beforeAppend['valid']) {
            throw new RuntimeException(
                'Resilience evidence append refused because the existing ledger is invalid.',
            );
        }

        $evidence = $this->database()->transaction(function () use (
            $active,
            $keyId,
            $normalized,
            $payload,
            $payloadHash,
            $signature,
        ): ResilienceDrillEvidence {
            $head = $this->database()->table('resilience_drill_chain_heads')
                ->where('key', self::HEAD_KEY)
                ->lockForUpdate()
                ->first();
            if ($head === null) {
                throw new RuntimeException('Resilience evidence chain head is missing.');
            }

            $existing = ResilienceDrillEvidence::query()
                ->where('campaign_id', $normalized['campaign_id'])
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                if (! hash_equals((string) $existing->payload_hash, $payloadHash)) {
                    throw new InvalidArgumentException(
                        'The resilience campaign ID was already used with different evidence.',
                    );
                }

                return $existing;
            }

            $sequence = (int) $head->sequence + 1;
            $previousHash = is_string($head->last_hash) && $head->last_hash !== ''
                ? $head->last_hash
                : null;
            $recordedAt = CarbonImmutable::now('UTC')
                ->setMicrosecond(0);
            $attributes = [
                'public_id' => (string) Str::uuid(),
                'sequence' => $sequence,
                ...$normalized,
                'payload' => $payload,
                'payload_hash' => $payloadHash,
                'source_key_id' => $keyId,
                'source_signature' => $signature,
                'ledger_key_id' => $active['id'],
                'previous_hash' => $previousHash,
                'recorded_at' => $recordedAt,
            ];
            $recordHash = hash(
                'sha256',
                ($previousHash ?? str_repeat('0', 64))."\0".$this->verifier->canonicalJson(
                    $this->recordPayload($attributes),
                ),
            );
            $attributes['record_hash'] = $recordHash;
            $attributes['ledger_signature'] = hash_hmac('sha256', $recordHash, $active['key']);

            $inserted = $this->database()->table('resilience_drill_evidence')->insert(
                $this->databaseAttributes($attributes),
            );
            if (! $inserted) {
                throw new RuntimeException('Resilience evidence row could not be appended.');
            }
            $evidence = ResilienceDrillEvidence::query()
                ->where('sequence', $sequence)
                ->first();
            if ($evidence === null) {
                throw new RuntimeException('Appended resilience evidence could not be reloaded.');
            }
            $updated = $this->database()->table('resilience_drill_chain_heads')
                ->where('key', self::HEAD_KEY)
                ->where('sequence', $sequence - 1)
                ->update([
                    'sequence' => $sequence,
                    'last_hash' => $recordHash,
                    'updated_at' => now(),
                ]);
            if ($updated !== 1) {
                throw new RuntimeException('Resilience evidence chain head could not be advanced.');
            }

            return $evidence;
        }, 3);

        $verification = $this->verifyAndRecordHeartbeat();
        if (! $verification['valid']) {
            throw new RuntimeException('Resilience evidence ledger failed verification after append.');
        }

        $this->recordCampaignHeartbeat($evidence);
        Log::notice('resilience.drill_evidence_anchor', [
            'public_id' => (string) $evidence->public_id,
            'campaign_id' => (string) $evidence->campaign_id,
            'sequence' => (int) $evidence->sequence,
            'status' => (string) $evidence->status,
            'record_hash' => (string) $evidence->record_hash,
            'ledger_key_id' => (string) $evidence->ledger_key_id,
            'completed_at' => $this->formatTimestamp($evidence->completed_at),
        ]);

        return $evidence;
    }

    /**
     * @return array{valid:bool,total:int,last_sequence:int,failures:list<array{sequence:int,code:string}>}
     */
    public function verify(): array
    {
        return $this->database()->transaction(function (): array {
            $head = $this->database()->table('resilience_drill_chain_heads')
                ->where('key', self::HEAD_KEY)
                ->lockForUpdate()
                ->first();
            $previousHash = null;
            $expectedSequence = 1;
            $total = 0;
            $failures = [];

            foreach (ResilienceDrillEvidence::query()->orderBy('sequence')->cursor() as $evidence) {
                $total++;
                $sequence = (int) $evidence->sequence;
                $payload = is_array($evidence->payload) ? $evidence->payload : [];
                $payloadHash = $this->verifier->hash($payload);
                $computed = hash(
                    'sha256',
                    ($previousHash ?? str_repeat('0', 64))."\0".$this->verifier->canonicalJson(
                        $this->recordPayload($evidence->getAttributes()),
                    ),
                );
                $ledgerKey = $this->keyring->key((string) $evidence->ledger_key_id);

                if ($sequence !== $expectedSequence) {
                    $this->failure($failures, $sequence, 'sequence_gap');
                }
                if (($evidence->previous_hash ?: null) !== $previousHash) {
                    $this->failure($failures, $sequence, 'previous_hash_mismatch');
                }
                if (! hash_equals((string) $evidence->payload_hash, $payloadHash)) {
                    $this->failure($failures, $sequence, 'payload_hash_mismatch');
                }
                if (! $this->verifier->verify(
                    $payload,
                    (string) $evidence->source_key_id,
                    (string) $evidence->source_signature,
                )) {
                    $this->failure($failures, $sequence, 'source_signature_mismatch');
                }
                if (! hash_equals((string) $evidence->record_hash, $computed)) {
                    $this->failure($failures, $sequence, 'record_hash_mismatch');
                }
                if ($ledgerKey === null || ! hash_equals(
                    (string) $evidence->ledger_signature,
                    hash_hmac('sha256', $computed, $ledgerKey),
                )) {
                    $this->failure($failures, $sequence, 'ledger_signature_mismatch');
                }

                $previousHash = (string) $evidence->record_hash;
                $expectedSequence = $sequence + 1;
            }

            $headSequence = (int) ($head->sequence ?? -1);
            $headHash = $head->last_hash ?? null;
            if ($head === null || $headSequence !== $total || ($headHash ?: null) !== $previousHash) {
                $this->failure($failures, max(0, $headSequence), 'chain_head_mismatch');
            }

            return [
                'valid' => $failures === [],
                'total' => $total,
                'last_sequence' => max(0, $headSequence),
                'failures' => $failures,
            ];
        }, 3);
    }

    /**
     * @return array{valid:bool,total:int,last_sequence:int,failures:list<array{sequence:int,code:string}>}
     */
    public function verifyAndRecordHeartbeat(): array
    {
        $report = $this->verify();
        $this->heartbeats->record(
            key: (string) config(
                'resilience_drills.evidence.verification_heartbeat_key',
                'resilience-drill-ledger',
            ),
            category: 'resilience',
            status: $report['valid'] ? MonitoringStatus::Operational : MonitoringStatus::Outage,
            message: $report['valid']
                ? 'Resilience drill evidence ledger verified.'
                : 'Resilience drill evidence ledger verification failed.',
            context: [
                'total_evidence' => $report['total'],
                'last_sequence' => $report['last_sequence'],
                'failure_count' => count($report['failures']),
            ],
        );

        return $report;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function validatePayload(array $payload): array
    {
        $this->assertExactKeys($payload, self::PAYLOAD_KEYS, 'payload');
        if (($payload['schema_version'] ?? null) !== 1) {
            throw new InvalidArgumentException('Unsupported resilience campaign schema version.');
        }

        $campaignId = strtolower(trim((string) ($payload['campaign_id'] ?? '')));
        if (preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $campaignId) !== 1) {
            throw new InvalidArgumentException('campaign_id must be a canonical UUID.');
        }

        $environment = strtolower($this->identifier(
            $payload['environment'] ?? null,
            'environment',
            32,
        ));
        $this->assertNonProductionTarget($environment);
        $expectedEnvironment = strtolower(trim((string) config(
            'resilience_drills.target.environment',
            '',
        )));
        if ($environment !== $expectedEnvironment) {
            throw new InvalidArgumentException('Evidence environment does not match the approved drill target.');
        }

        $profile = $this->identifier(
            $payload['infrastructure_profile'] ?? null,
            'infrastructure_profile',
            128,
        );
        $provider = strtolower($this->identifier($payload['provider'] ?? null, 'provider', 64));
        $orchestrator = strtolower($this->identifier(
            $payload['orchestrator'] ?? null,
            'orchestrator',
            64,
        ));
        if ($profile !== trim((string) config('resilience_drills.target.infrastructure_profile'))
            || $provider !== strtolower(trim((string) config('resilience_drills.target.provider')))
            || $orchestrator !== strtolower(trim((string) config('resilience_drills.target.orchestrator')))) {
            throw new InvalidArgumentException(
                'Evidence provider, orchestrator, or infrastructure profile does not match the approved target.',
            );
        }
        if (($payload['traffic_mode'] ?? null) !== 'synthetic_only') {
            throw new InvalidArgumentException('Resilience drills require synthetic_only traffic mode.');
        }
        $campaignControls = [];
        foreach ([
            'approval_verified',
            'change_reference_verified',
            'orchestrator_identity_verified',
            'production_access_denied',
        ] as $control) {
            if (! is_bool($payload[$control] ?? null)) {
                throw new InvalidArgumentException("{$control} must be boolean.");
            }
            $campaignControls[$control] = $payload[$control];
        }
        $campaignControlsPassed = ! in_array(false, $campaignControls, true);

        $startedAt = $this->timestamp($payload['started_at'] ?? null, 'started_at');
        $completedAt = $this->timestamp($payload['completed_at'] ?? null, 'completed_at');
        $maximumSkew = (int) config(
            'resilience_drills.evidence.maximum_clock_skew_seconds',
            300,
        );
        $duration = (int) $startedAt->diffInSeconds($completedAt, false);
        if ($duration < 1
            || $duration > min(
                43_200,
                max(300, (int) config(
                    'resilience_drills.campaign.maximum_campaign_seconds',
                    14_400,
                )),
            )
            || $completedAt->greaterThan(CarbonImmutable::now('UTC')->addSeconds($maximumSkew))) {
            throw new InvalidArgumentException('Resilience campaign timestamps are inconsistent or unbounded.');
        }

        $scenarios = $payload['scenarios'] ?? null;
        if (! is_array($scenarios) || ! array_is_list($scenarios) || $scenarios === [] || count($scenarios) > 16) {
            throw new InvalidArgumentException('Resilience campaign scenarios must be a bounded JSON list.');
        }

        $required = array_values((array) config(
            'resilience_drills.campaign.required_scenarios',
            [],
        ));
        $scenarioKeys = [];
        $passed = 0;
        $failed = 0;
        $aborted = 0;
        $worstDetection = 0;
        $worstRecovery = 0;
        $previousCompletedAt = null;

        foreach ($scenarios as $index => $scenario) {
            if (! is_array($scenario) || array_is_list($scenario)) {
                throw new InvalidArgumentException("Scenario {$index} must be one JSON object.");
            }
            $this->assertExactKeys($scenario, self::SCENARIO_KEYS, "scenario {$index}");
            $key = strtolower($this->identifier($scenario['key'] ?? null, "scenario {$index} key", 64));
            if (in_array($key, $scenarioKeys, true)) {
                throw new InvalidArgumentException("Scenario {$key} appears more than once.");
            }
            $definition = config("resilience_drills.scenarios.{$key}");
            if (! is_array($definition)) {
                throw new InvalidArgumentException("Scenario {$key} is not approved by the drill contract.");
            }
            $scenarioKeys[] = $key;

            $faultDomain = strtolower($this->identifier(
                $scenario['fault_domain'] ?? null,
                "scenario {$key} fault_domain",
                32,
            ));
            if ($faultDomain !== ($definition['fault_domain'] ?? null)) {
                throw new InvalidArgumentException("Scenario {$key} fault domain is inconsistent.");
            }

            $scenarioStartedAt = $this->timestamp(
                $scenario['started_at'] ?? null,
                "scenario {$key} started_at",
            );
            $scenarioCompletedAt = $this->timestamp(
                $scenario['completed_at'] ?? null,
                "scenario {$key} completed_at",
            );
            $scenarioDuration = (int) $scenarioStartedAt->diffInSeconds($scenarioCompletedAt, false);
            if ($scenarioDuration < 1
                || $scenarioDuration > min(
                    3_600,
                    max(30, (int) config(
                        'resilience_drills.safety.maximum_scenario_seconds',
                        900,
                    )),
                )
                || $scenarioStartedAt->lessThan($startedAt)
                || $scenarioCompletedAt->greaterThan($completedAt)
                || ($previousCompletedAt !== null
                    && $scenarioStartedAt->lessThan($previousCompletedAt))) {
                throw new InvalidArgumentException(
                    "Scenario {$key} timing is outside the safe sequential campaign window.",
                );
            }
            $previousCompletedAt = $scenarioCompletedAt;

            $expectedRecovery = $this->boundedInteger(
                $scenario['expected_recovery_seconds'] ?? null,
                "scenario {$key} expected_recovery_seconds",
                1,
                3_600,
            );
            if ($expectedRecovery !== (int) ($definition['maximum_recovery_seconds'] ?? 0)) {
                throw new InvalidArgumentException("Scenario {$key} recovery objective drifted from the contract.");
            }
            $detection = $this->boundedInteger(
                $scenario['detection_seconds'] ?? null,
                "scenario {$key} detection_seconds",
                0,
                max(0, $scenarioDuration),
            );
            $recovery = $this->boundedInteger(
                $scenario['recovery_seconds'] ?? null,
                "scenario {$key} recovery_seconds",
                0,
                max(0, $scenarioDuration),
            );
            $blastRadius = $this->boundedInteger(
                $scenario['blast_radius_percent'] ?? null,
                "scenario {$key} blast_radius_percent",
                1,
                min(50, max(1, (int) config(
                    'resilience_drills.safety.maximum_blast_radius_percent',
                    50,
                ))),
            );
            $healthyRemaining = $this->boundedInteger(
                $scenario['healthy_instances_remaining'] ?? null,
                "scenario {$key} healthy_instances_remaining",
                0,
                10_000,
            );
            $peakP95 = $this->boundedInteger(
                $scenario['peak_p95_ms'] ?? null,
                "scenario {$key} peak_p95_ms",
                0,
                120_000,
            );
            $peakErrorRateBasisPoints = $this->boundedInteger(
                $scenario['peak_error_rate_basis_points'] ?? null,
                "scenario {$key} peak_error_rate_basis_points",
                0,
                10_000,
            );
            $checks = $scenario['checks'] ?? null;
            if (! is_array($checks) || array_is_list($checks)) {
                throw new InvalidArgumentException("Scenario {$key} checks must be one JSON object.");
            }
            $this->assertExactKeys($checks, self::CHECK_KEYS, "scenario {$key} checks");
            foreach ($checks as $check => $value) {
                if (! is_bool($value)) {
                    throw new InvalidArgumentException("Scenario {$key} check {$check} must be boolean.");
                }
            }

            $abortTriggered = $scenario['abort_triggered'] ?? null;
            if (! is_bool($abortTriggered)) {
                throw new InvalidArgumentException("Scenario {$key} abort_triggered must be boolean.");
            }
            $guardrailBreached = $healthyRemaining < max(1, (int) config(
                'resilience_drills.safety.minimum_healthy_instances',
                1,
            )) || $peakP95 > min(10_000, max(250, (int) config(
                'resilience_drills.safety.maximum_p95_ms',
                3_000,
            )))
                || $peakErrorRateBasisPoints > (int) round(
                    min(5.0, max(0.1, (float) config(
                        'resilience_drills.safety.maximum_error_rate_percent',
                        2.0,
                    ))) * 100,
                );
            $checksPassed = ! in_array(false, $checks, true);
            $expectedOutcome = match (true) {
                ! $checksPassed || $recovery > $expectedRecovery => 'failed',
                $abortTriggered => 'aborted',
                $guardrailBreached => 'failed',
                default => 'passed',
            };
            if (($scenario['outcome'] ?? null) !== $expectedOutcome) {
                throw new InvalidArgumentException(
                    "Scenario {$key} outcome is inconsistent with its measurements and safeguards.",
                );
            }

            match ($expectedOutcome) {
                'passed' => $passed++,
                'failed' => $failed++,
                'aborted' => $aborted++,
            };
            $worstDetection = max($worstDetection, $detection);
            $worstRecovery = max($worstRecovery, $recovery);

            // Values were intentionally evaluated above even when not copied:
            // they remain inside the signed payload and are protected by its
            // hash plus the append-only ledger.
            unset($blastRadius);
        }

        $expectedKeys = $required;
        sort($expectedKeys, SORT_STRING);
        $observedKeys = $scenarioKeys;
        sort($observedKeys, SORT_STRING);
        if ($required === [] || $expectedKeys !== $observedKeys) {
            throw new InvalidArgumentException(
                'Resilience campaign must contain every required scenario exactly once.',
            );
        }

        $status = match (true) {
            ! $campaignControlsPassed || $failed > 0 => MonitoringStatus::Outage->value,
            $aborted > 0 => MonitoringStatus::Degraded->value,
            default => MonitoringStatus::Operational->value,
        };

        return [
            'campaign_id' => $campaignId,
            'status' => $status,
            'environment' => $environment,
            'release' => $this->identifier($payload['release'] ?? null, 'release', 128),
            'infrastructure_profile' => $profile,
            'provider' => $provider,
            'orchestrator' => $orchestrator,
            'approval_reference' => $this->identifier(
                $payload['approval_reference'] ?? null,
                'approval_reference',
                100,
            ),
            'campaign_controls_passed' => $campaignControlsPassed,
            'started_at' => $startedAt,
            'completed_at' => $completedAt,
            'scenario_count' => count($scenarios),
            'passed_count' => $passed,
            'failed_count' => $failed,
            'aborted_count' => $aborted,
            'worst_detection_seconds' => $worstDetection,
            'worst_recovery_seconds' => $worstRecovery,
        ];
    }

    private function recordCampaignHeartbeat(ResilienceDrillEvidence $evidence): void
    {
        $status = MonitoringStatus::tryFrom((string) $evidence->status)
            ?? MonitoringStatus::Unknown;
        $this->heartbeats->record(
            key: (string) config(
                'resilience_drills.evidence.heartbeat_key',
                'resilience-drill-campaign',
            ),
            category: 'resilience',
            status: $status,
            message: match ($status) {
                MonitoringStatus::Operational => 'Resilience drill campaign passed every required scenario.',
                MonitoringStatus::Degraded => 'Resilience drill campaign was safely aborted.',
                MonitoringStatus::Outage => 'Resilience drill campaign exposed a failed recovery or campaign-control condition.',
                MonitoringStatus::Unknown => 'Resilience drill campaign result is unknown.',
            },
            context: [
                'campaign_id' => (string) $evidence->campaign_id,
                'environment' => (string) $evidence->environment,
                'release' => (string) $evidence->release,
                'scenario_count' => (int) $evidence->scenario_count,
                'passed_count' => (int) $evidence->passed_count,
                'failed_count' => (int) $evidence->failed_count,
                'aborted_count' => (int) $evidence->aborted_count,
                'campaign_controls_passed' => (bool) $evidence->campaign_controls_passed,
                'worst_detection_seconds' => (int) $evidence->worst_detection_seconds,
                'worst_recovery_seconds' => (int) $evidence->worst_recovery_seconds,
            ],
            observedAt: $evidence->completed_at,
        );
    }

    private function assertRuntimeSafety(): void
    {
        $requiredFlags = [
            'production_fault_injection_forbidden',
            'external_orchestrator_required',
            'manual_approval_required',
            'change_reference_required',
            'synthetic_traffic_only',
            'provider_kill_switch_required',
            'one_fault_at_a_time',
        ];
        $target = strtolower(trim((string) config(
            'resilience_drills.target.environment',
            '',
        )));
        $profile = trim((string) config(
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
        $safe = (bool) config('resilience_drills.enabled', false)
            && collect($requiredFlags)->every(
                static fn (string $flag): bool => (bool) config(
                    "resilience_drills.safety.{$flag}",
                    false,
                ),
            )
            && $this->runtimeIdentifier($target, 32)
            && ! $this->productionLike($target)
            && $this->runtimeIdentifier($profile, 128)
            && $this->runtimeIdentifier($provider, 64)
            && $this->runtimeIdentifier($orchestrator, 64)
            && ! hash_equals($provider, $orchestrator)
            && $this->verifier->hasValidActiveKeyConfiguration();
        if (! $safe) {
            throw new RuntimeException(
                'Resilience evidence ingestion is disabled by a mandatory safety boundary.',
            );
        }
    }

    /** @param array<string, mixed> $attributes */
    private function recordPayload(array $attributes): array
    {
        return [
            'public_id' => (string) ($attributes['public_id'] ?? ''),
            'sequence' => (int) ($attributes['sequence'] ?? 0),
            'campaign_id' => (string) ($attributes['campaign_id'] ?? ''),
            'status' => (string) ($attributes['status'] ?? ''),
            'environment' => (string) ($attributes['environment'] ?? ''),
            'release' => (string) ($attributes['release'] ?? ''),
            'infrastructure_profile' => (string) ($attributes['infrastructure_profile'] ?? ''),
            'provider' => (string) ($attributes['provider'] ?? ''),
            'orchestrator' => (string) ($attributes['orchestrator'] ?? ''),
            'approval_reference' => (string) ($attributes['approval_reference'] ?? ''),
            'campaign_controls_passed' => (bool) ($attributes['campaign_controls_passed'] ?? false),
            'started_at' => $this->formatTimestamp($attributes['started_at'] ?? null),
            'completed_at' => $this->formatTimestamp($attributes['completed_at'] ?? null),
            'scenario_count' => (int) ($attributes['scenario_count'] ?? 0),
            'passed_count' => (int) ($attributes['passed_count'] ?? 0),
            'failed_count' => (int) ($attributes['failed_count'] ?? 0),
            'aborted_count' => (int) ($attributes['aborted_count'] ?? 0),
            'worst_detection_seconds' => (int) ($attributes['worst_detection_seconds'] ?? 0),
            'worst_recovery_seconds' => (int) ($attributes['worst_recovery_seconds'] ?? 0),
            'payload_hash' => (string) ($attributes['payload_hash'] ?? ''),
            'source_key_id' => (string) ($attributes['source_key_id'] ?? ''),
            'source_signature' => (string) ($attributes['source_signature'] ?? ''),
            'ledger_key_id' => (string) ($attributes['ledger_key_id'] ?? ''),
            'previous_hash' => $attributes['previous_hash'] ?? null,
            'recorded_at' => $this->formatTimestamp($attributes['recorded_at'] ?? null),
        ];
    }

    /** @param list<string> $expected */
    private function assertExactKeys(array $value, array $expected, string $field): void
    {
        $actual = array_keys($value);
        sort($actual, SORT_STRING);
        sort($expected, SORT_STRING);
        if ($actual !== $expected) {
            throw new InvalidArgumentException("{$field} contains missing or unsupported fields.");
        }
    }

    private function assertNonProductionTarget(string $environment): void
    {
        if ($this->productionLike($environment)) {
            throw new InvalidArgumentException('Resilience evidence cannot target production.');
        }
    }

    private function productionLike(string $environment): bool
    {
        return ResilienceTargetPolicy::isProductionLike(
            $environment,
            (array) config('resilience_drills.target.production_names', []),
        );
    }

    private function timestamp(mixed $value, string $field): CarbonImmutable
    {
        $timestamp = StrictRfc3339Timestamp::parse($value);
        if ($timestamp === null) {
            throw new InvalidArgumentException(
                "{$field} must be a real RFC3339 timestamp with an explicit, valid offset.",
            );
        }

        return $timestamp;
    }

    private function formatTimestamp(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof CarbonInterface) {
            $timestamp = CarbonImmutable::instance($value);
        } elseif (is_string($value)) {
            $timestamp = CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $value, 'UTC');
            if ($timestamp === false || $timestamp->format('Y-m-d H:i:s') !== $value) {
                throw new RuntimeException('Ledger contains a non-canonical UTC timestamp.');
            }
        } else {
            throw new RuntimeException('Ledger contains an unsupported timestamp value.');
        }

        return $timestamp->utc()->setMicrosecond(0)->format('Y-m-d\TH:i:s\Z');
    }

    private function identifier(mixed $value, string $field, int $maximum): string
    {
        $value = is_string($value) ? trim($value) : '';
        if (strlen($value) > $maximum
            || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:@\/-]*\z/', $value) !== 1) {
            throw new InvalidArgumentException("{$field} is invalid.");
        }

        return $value;
    }

    private function boundedInteger(
        mixed $value,
        string $field,
        int $minimum,
        int $maximum,
    ): int {
        if (! is_int($value) || $value < $minimum || $value > $maximum) {
            throw new InvalidArgumentException("{$field} is outside its safe boundary.");
        }

        return $value;
    }

    private function runtimeIdentifier(string $value, int $maximum): bool
    {
        return $value !== ''
            && strlen($value) <= $maximum
            && preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_.:@\/-]*\z/', $value) === 1
            && preg_match('/replace|example|placeholder|secret-manager/i', $value) !== 1;
    }

    /** @param array<string, mixed> $attributes */
    private function databaseAttributes(array $attributes): array
    {
        $stored = $attributes;
        $stored['payload'] = json_encode(
            $attributes['payload'] ?? null,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        );
        foreach (['started_at', 'completed_at', 'recorded_at'] as $field) {
            $value = $attributes[$field] ?? null;
            if (! $value instanceof CarbonInterface) {
                throw new RuntimeException("{$field} is not a canonical ledger timestamp.");
            }
            $stored[$field] = CarbonImmutable::instance($value)
                ->utc()
                ->setMicrosecond(0)
                ->format('Y-m-d H:i:s');
        }

        return $stored;
    }

    /** @param list<array{sequence:int,code:string}> $failures */
    private function failure(array &$failures, int $sequence, string $code): void
    {
        if (count($failures) < 20) {
            $failures[] = compact('sequence', 'code');
        }
    }

    private function database(): ConnectionInterface
    {
        return DB::connection();
    }
}
