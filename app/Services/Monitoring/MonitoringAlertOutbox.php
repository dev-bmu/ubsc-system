<?php

namespace App\Services\Monitoring;

use App\Models\MonitoringAlertDelivery;
use App\Models\MonitoringIncident;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Throwable;

class MonitoringAlertOutbox
{
    public function __construct(private readonly MonitoringAlertChannelRegistry $channels) {}

    public function enqueue(MonitoringIncident $incident, string $event): int
    {
        if (! in_array($event, ['opened', 'escalated', 'resolved'], true)) {
            throw new InvalidArgumentException('Unsupported monitoring alert event.');
        }

        $payload = $this->payload($incident, $event);
        $created = 0;

        foreach ($this->channels->activeChannels() as $channel) {
            $deduplicationKey = hash('sha256', implode("\0", [
                (string) $incident->public_id,
                $event,
                $event === 'escalated' ? (string) $incident->severity : '',
                $channel,
            ]));

            try {
                $delivery = MonitoringAlertDelivery::query()->firstOrCreate(
                    ['deduplication_key' => $deduplicationKey],
                    [
                        'monitoring_incident_id' => $incident->getKey(),
                        'event' => $event,
                        'channel' => $channel,
                        'severity' => $incident->severity,
                        'status' => 'pending',
                        'payload' => $payload,
                        'attempts' => 0,
                        'available_at' => now(),
                    ],
                );

                $created += $delivery->wasRecentlyCreated ? 1 : 0;
            } catch (Throwable) {
                // A concurrent creator can win the unique deduplication key.
                // Re-reading avoids turning that benign race into an incident.
                if (! MonitoringAlertDelivery::query()
                    ->where('deduplication_key', $deduplicationKey)
                    ->exists()) {
                    throw new \RuntimeException('Unable to persist a monitoring alert outbox record.');
                }
            }
        }

        return $created;
    }

    /** @return array<string, scalar|null> */
    private function payload(MonitoringIncident $incident, string $event): array
    {
        return [
            'schema_version' => 1,
            'event' => $event,
            'incident_id' => (string) $incident->public_id,
            'source' => Str::limit(strip_tags((string) $incident->source), 64, ''),
            'title' => Str::limit(strip_tags((string) $incident->title), 160, ''),
            'summary' => $incident->summary === null
                ? null
                : Str::limit(strip_tags((string) $incident->summary), 500, ''),
            'severity' => (string) $incident->severity,
            'status' => (string) $incident->status,
            'started_at' => $incident->started_at?->toIso8601String(),
            'observed_at' => $incident->last_observed_at?->toIso8601String(),
            'emitted_at' => now()->toIso8601String(),
        ];
    }
}
