<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Services\Production\ExternalSliKeyring;
use Carbon\CarbonImmutable;
use Throwable;

final class ExternalAvailabilityConfiguration
{
    public function __construct(private readonly ExternalSliKeyring $keyring) {}

    /** @return array<string, bool|int|string|null> */
    public function summary(): array
    {
        $enabled = (bool) config('monitoring.external.enabled', false);
        $provider = trim((string) config('monitoring.external.provider', ''));
        $checkUrl = trim((string) config('monitoring.external.check_url', ''));
        $applicationUrl = trim((string) config('app.url', ''));
        $ingestProvider = trim((string) config(
            'observability.external_sli.provider',
            '',
        ));
        $configured = $enabled
            && preg_match('/^[a-z0-9][a-z0-9_.:-]{0,63}$/', $provider) === 1
            && hash_equals($provider, $ingestProvider)
            && $this->isSafeHttpsUrl($checkUrl)
            && $this->sameOrigin($checkUrl, $applicationUrl)
            && $this->requiredPathsAreValid()
            && (bool) config('observability.external_sli.ingest_enabled', false)
            && $this->keyring->validKeyIds() !== [];
        $interval = max(60, (int) config('monitoring.external.interval_seconds', 300));
        $heartbeat = null;
        if ($configured) {
            try {
                $heartbeat = MonitoringHeartbeat::query()->find(
                    (string) config(
                        'observability.external_sli.heartbeat_key',
                        'external-synthetic-availability',
                    ),
                );
            } catch (Throwable) {
                // The explicit Unknown state below is safer than inferring
                // health when the monitoring store cannot be read.
            }
        }
        $heartbeatContext = is_array($heartbeat?->context)
            ? $heartbeat->context
            : [];
        $heartbeatMatchesProvider = $heartbeat !== null
            && hash_equals('availability', (string) $heartbeat->category)
            && is_string($heartbeatContext['provider'] ?? null)
            && hash_equals($provider, (string) $heartbeatContext['provider']);
        $age = ! $heartbeatMatchesProvider || $heartbeat?->observed_at === null
            ? null
            : $this->age($heartbeat->observed_at);
        $freshness = match (true) {
            $heartbeat !== null && ! $heartbeatMatchesProvider => MonitoringStatus::Outage,
            $age === null => MonitoringStatus::Unknown,
            $age >= $interval * 3 => MonitoringStatus::Outage,
            $age >= $interval * 2 => MonitoringStatus::Degraded,
            default => MonitoringStatus::Operational,
        };
        $status = $configured
            ? MonitoringStatus::worst([
                MonitoringStatus::tryFrom((string) ($heartbeat?->status ?? ''))
                    ?? MonitoringStatus::Unknown,
                $freshness,
            ])
            : MonitoringStatus::Unknown;

        return [
            'status' => $status->value,
            'external_monitoring_configured' => $configured,
            'provider' => $configured ? $provider : null,
            'check_interval_seconds' => $configured
                ? $interval
                : null,
            'last_external_check_at' => $heartbeat?->observed_at?->toIso8601String(),
            'message' => match (true) {
                ! $configured => 'Authenticated external synthetic availability monitoring is not configured.',
                $heartbeat !== null && ! $heartbeatMatchesProvider => 'The external synthetic heartbeat does not match the active provider identity.',
                $status === MonitoringStatus::Operational => 'Authenticated external synthetic availability is current and operational.',
                $status === MonitoringStatus::Degraded => 'The latest external synthetic signal is late or degraded.',
                $status === MonitoringStatus::Outage => 'The external synthetic probe reports an outage or is stale.',
                default => 'No authenticated external synthetic result has been received.',
            },
        ];
    }

    private function isSafeHttpsUrl(string $value): bool
    {
        if (filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $parts = parse_url($value);

        return is_array($parts)
            && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
            && (string) ($parts['host'] ?? '') !== ''
            && ! isset($parts['user'])
            && ! isset($parts['pass']);
    }

    private function sameOrigin(string $left, string $right): bool
    {
        $leftOrigin = $this->origin($left);
        $rightOrigin = $this->origin($right);

        return $leftOrigin !== null
            && $rightOrigin !== null
            && hash_equals($leftOrigin, $rightOrigin);
    }

    private function origin(string $value): ?string
    {
        if (! $this->isSafeHttpsUrl($value)) {
            return null;
        }

        $parts = parse_url($value);
        $port = isset($parts['port']) && (int) $parts['port'] !== 443
            ? ':'.(int) $parts['port']
            : '';

        return 'https://'.strtolower((string) $parts['host']).$port;
    }

    private function requiredPathsAreValid(): bool
    {
        $paths = (array) config('monitoring.external.required_paths', []);

        return $paths !== []
            && collect($paths)->every(
                static fn (mixed $path): bool => is_string($path)
                    && preg_match('/^\/[A-Za-z0-9._~!$&\'()*+,;=:@%\/-]{0,255}$/', $path) === 1,
            )
            && count($paths) === count(array_unique($paths))
            && collect(['/up', '/health/ready', '/'])->every(
                static fn (string $path): bool => in_array($path, $paths, true),
            );
    }

    private function age(mixed $value): ?int
    {
        try {
            $timestamp = $value instanceof \DateTimeInterface
                ? CarbonImmutable::instance($value)
                : CarbonImmutable::parse((string) $value);
        } catch (Throwable) {
            return null;
        }

        if ($timestamp->greaterThan(now()->addMinutes(5))) {
            return null;
        }

        return max(0, (int) $timestamp->diffInSeconds(now()));
    }
}
