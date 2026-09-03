<?php

namespace App\Services\DataGovernance;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Models\ServiceAuditEvent;
use App\Services\Monitoring\MonitoringHeartbeatRecorder;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

final class ServiceAuditVerifier
{
    public const HEARTBEAT_KEY = 'service-audit-verifier';

    public function __construct(
        private readonly ServiceAuditLogger $audit,
        private readonly MonitoringHeartbeatRecorder $heartbeats,
    ) {}

    /** @return array<string, mixed> */
    public function verify(?int $batchSize = null): array
    {
        $batchSize = max(
            1,
            min(10_000, $batchSize ?? (int) config('data_audit.verification_batch_size', 1000)),
        );
        $lock = Cache::lock(
            'service-audit:verification-lock',
            max(30, (int) config('data_audit.verification_lock_seconds', 300)),
        );

        if (! $lock->get()) {
            throw new RuntimeException('A service-audit verification pass is already running.');
        }

        try {
            return $this->verifyLocked($batchSize);
        } finally {
            $lock->release();
        }
    }

    /** @return array<string, mixed> */
    public function latest(): array
    {
        $heartbeat = MonitoringHeartbeat::query()->find(self::HEARTBEAT_KEY);

        if ($heartbeat === null || $heartbeat->observed_at === null) {
            return [
                'status' => MonitoringStatus::Unknown->value,
                'observed_at' => null,
                'lag_seconds' => null,
                'message' => 'Append-only audit verification has not run.',
                'context' => [],
            ];
        }

        $lag = max(0, (int) $heartbeat->observed_at->diffInSeconds(now()));
        $warningAfter = max(60, (int) config('data_audit.verification_warning_after_seconds', 900));
        $outageAfter = max($warningAfter + 1, (int) config('data_audit.verification_outage_after_seconds', 3600));
        $recorded = MonitoringStatus::tryFrom((string) $heartbeat->status)
            ?? MonitoringStatus::Unknown;
        $freshness = match (true) {
            $lag >= $outageAfter => MonitoringStatus::Outage,
            $lag >= $warningAfter => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $status = MonitoringStatus::worst([$recorded, $freshness]);

        $message = $heartbeat->message;

        if ($freshness !== MonitoringStatus::Operational
            && $recorded === MonitoringStatus::Operational) {
            $message = 'Append-only audit verification heartbeat is stale.';
        }

        return [
            'status' => $status->value,
            'observed_at' => $heartbeat->observed_at->toIso8601String(),
            'lag_seconds' => $lag,
            'message' => $message,
            'context' => is_array($heartbeat->context) ? $heartbeat->context : [],
        ];
    }

    /** @return array<string, mixed> */
    private function verifyLocked(int $batchSize): array
    {
        $startedAt = hrtime(true);
        $previous = MonitoringHeartbeat::query()->find(self::HEARTBEAT_KEY);
        $previousContext = is_array($previous?->context) ? $previous->context : [];
        $hasCompletedCycle = (bool) ($previousContext['has_completed_cycle'] ?? false);
        $nextId = max(1, (int) ($previousContext['next_id'] ?? 1));
        $cycleChecked = max(0, (int) ($previousContext['cycle_checked'] ?? 0));
        $cycleMismatches = max(0, (int) ($previousContext['cycle_mismatches'] ?? 0));
        $events = ServiceAuditEvent::query()
            ->where('id', '>=', $nextId)
            ->orderBy('id')
            ->limit($batchSize)
            ->get();

        if ($events->isEmpty() && $nextId > 1) {
            $nextId = 1;
            $cycleChecked = 0;
            $cycleMismatches = 0;
            $events = ServiceAuditEvent::query()
                ->orderBy('id')
                ->limit($batchSize)
                ->get();
        }

        $mismatchPublicId = is_string($previousContext['mismatch_public_id'] ?? null)
            ? $previousContext['mismatch_public_id']
            : null;
        $batchMismatches = 0;

        foreach ($events as $event) {
            if (! $this->audit->verify($event)) {
                $batchMismatches++;
                $mismatchPublicId ??= $event->public_id;
            }
        }

        $checked = $events->count();
        $cycleChecked += $checked;
        $cycleMismatches += $batchMismatches;
        $lastId = $events->last()?->id;
        $hasMore = $lastId !== null
            && ServiceAuditEvent::query()->where('id', '>', $lastId)->exists();
        $fullCycleCompleted = ! $hasMore;
        $lastCycleMismatches = (int) ($previousContext['last_cycle_mismatches'] ?? 0);

        if ($fullCycleCompleted) {
            $lastCycleMismatches = $cycleMismatches;
            $hasCompletedCycle = true;

            if ($cycleMismatches === 0) {
                $mismatchPublicId = null;
            }
        }

        $previousStatus = MonitoringStatus::tryFrom((string) $previous?->status)
            ?? MonitoringStatus::Unknown;
        $status = match (true) {
            $cycleMismatches > 0 => MonitoringStatus::Outage,
            $fullCycleCompleted => MonitoringStatus::Operational,
            $previousStatus === MonitoringStatus::Outage => MonitoringStatus::Outage,
            ! $hasCompletedCycle => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $durationMs = max(0, (int) round((hrtime(true) - $startedAt) / 1_000_000));
        $totalEvents = ServiceAuditEvent::query()->count();
        $context = [
            'batch_size' => $batchSize,
            'batch_checked' => $checked,
            'cycle_checked' => $fullCycleCompleted ? 0 : $cycleChecked,
            'cycle_mismatches' => $fullCycleCompleted ? 0 : $cycleMismatches,
            'last_cycle_mismatches' => $lastCycleMismatches,
            'next_id' => $fullCycleCompleted ? 1 : ((int) $lastId + 1),
            'total_events' => $totalEvents,
            'full_cycle_completed' => $fullCycleCompleted,
            'has_completed_cycle' => $hasCompletedCycle,
            'mismatch_public_id' => $mismatchPublicId,
        ];
        $message = match ($status) {
            MonitoringStatus::Outage => 'Audit ledger integrity mismatch detected.',
            MonitoringStatus::Degraded => 'Initial audit ledger verification is still in progress.',
            default => null,
        };

        $heartbeat = $this->heartbeats->record(
            key: self::HEARTBEAT_KEY,
            category: 'data-integrity',
            status: $status,
            latencyMs: $durationMs,
            message: $message,
            context: $context,
        );

        return [
            'status' => $status->value,
            'observed_at' => $heartbeat->observed_at?->toIso8601String(),
            'lag_seconds' => 0,
            'message' => $message,
            'context' => $context,
        ];
    }
}
