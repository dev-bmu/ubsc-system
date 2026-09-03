<?php

namespace App\Services\Monitoring;

use App\Models\MonitoringIncident;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

class MonitoringIncidentManager
{
    public function __construct(private readonly MonitoringAlertOutbox $alerts) {}

    /**
     * @param  array<string, bool|float|int|string|null>  $context
     */
    public function openOrRefresh(
        string $key,
        string $source,
        string $title,
        string $severity = 'warning',
        ?string $summary = null,
        array $context = [],
    ): MonitoringIncident {
        $this->assertIdentifier($key, 120, 'incident key');
        $this->assertIdentifier($source, 64, 'incident source');

        if (! in_array($severity, MonitoringIncident::SEVERITIES, true)) {
            throw new InvalidArgumentException('Invalid incident severity.');
        }

        try {
            return $this->persistActive(
                $key,
                $source,
                $title,
                $severity,
                $summary,
                $context,
            );
        } catch (UniqueConstraintViolationException) {
            // Concurrent creators are serialized by active_key's unique
            // constraint. Re-read the winner instead of emitting duplicates.
            $incident = MonitoringIncident::query()->where('active_key', $key)->first();

            if ($incident !== null) {
                return $incident;
            }

            throw new \RuntimeException('Unable to persist monitoring incident after a concurrent write.');
        }
    }

    public function resolve(string $key, ?int $actorId = null, ?string $note = null): bool
    {
        $this->assertIdentifier($key, 120, 'incident key');

        $incident = DB::transaction(function () use ($key, $actorId, $note): ?MonitoringIncident {
            $incident = MonitoringIncident::query()
                ->where('active_key', $key)
                ->lockForUpdate()
                ->first();

            if ($incident === null) {
                return null;
            }

            $incident->forceFill([
                'active_key' => null,
                'status' => 'resolved',
                'resolved_at' => now(),
                'resolved_by' => $actorId,
                'resolution_note' => $note === null ? null : Str::limit(strip_tags($note), 2_000, ''),
            ])->save();
            $this->alerts->enqueue($incident, 'resolved');

            return $incident;
        }, 3);

        if ($incident === null) {
            return false;
        }

        return true;
    }

    /**
     * @param  array<string, bool|float|int|string|null>  $context
     */
    private function persistActive(
        string $key,
        string $source,
        string $title,
        string $severity,
        ?string $summary,
        array $context,
    ): MonitoringIncident {
        return DB::transaction(function () use ($key, $source, $title, $severity, $summary, $context): MonitoringIncident {
            $incident = MonitoringIncident::query()
                ->where('active_key', $key)
                ->lockForUpdate()
                ->first();
            $now = now();

            $wasCreated = $incident === null;
            $previousSeverity = $incident?->severity;

            if ($wasCreated) {
                $incident = new MonitoringIncident([
                    'deduplication_key' => $key,
                    'active_key' => $key,
                    'started_at' => $now,
                    'status' => 'open',
                ]);
            }

            $incident->fill([
                'source' => $source,
                'title' => Str::limit(strip_tags($title), 160, ''),
                'summary' => $summary === null ? null : Str::limit(strip_tags($summary), 2_000, ''),
                'severity' => $severity,
                'last_observed_at' => $now,
                'context' => $this->sanitizeContext($context),
            ]);
            $incident->save();

            $event = match (true) {
                $wasCreated => 'opened',
                $this->severityPriority($severity) > $this->severityPriority($previousSeverity) => 'escalated',
                // Idempotently seed the durable outbox for incidents that
                // predate this delivery subsystem. Its unique key turns all
                // later refreshes into inexpensive no-ops.
                default => 'opened',
            };
            $this->alerts->enqueue($incident, $event);

            return $incident;
        }, 3);
    }

    private function severityPriority(?string $severity): int
    {
        return match ($severity) {
            'critical' => 3,
            'warning' => 2,
            'info' => 1,
            default => 0,
        };
    }

    private function assertIdentifier(string $value, int $maxLength, string $label): void
    {
        if ($value === ''
            || strlen($value) > $maxLength
            || preg_match('/^[a-z0-9][a-z0-9_.:-]*$/', $value) !== 1) {
            throw new InvalidArgumentException("Invalid {$label}.");
        }
    }

    /**
     * @param  array<string, bool|float|int|string|null>  $context
     * @return array<string, bool|float|int|string|null>
     */
    private function sanitizeContext(array $context): array
    {
        $safe = [];

        foreach (array_slice($context, 0, 20, true) as $key => $value) {
            if (! is_string($key)
                || preg_match('/^[a-z0-9_.-]{1,64}$/', $key) !== 1
                || preg_match('/(?:auth|cookie|credential|email|identity|name|pass|payload|phone|secret|token)/i', $key) === 1
                || (! is_scalar($value) && $value !== null)) {
                continue;
            }

            $safe[$key] = is_string($value)
                ? Str::limit(strip_tags($value), 160, '')
                : $value;
        }

        return $safe;
    }
}
