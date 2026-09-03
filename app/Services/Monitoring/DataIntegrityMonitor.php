<?php

namespace App\Services\Monitoring;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

final class DataIntegrityMonitor
{
    public function __construct(private readonly DataIntegrityScanner $scanner) {}

    /**
     * Run one mutually exclusive scan and atomically replace the cached
     * projection. Domain rows are never updated by this operation.
     *
     * @return array<string, mixed>
     */
    public function refresh(?CarbonInterface $at = null): array
    {
        $cache = $this->cache();
        $cacheKey = $this->cacheKey();
        $lockSeconds = max(
            30,
            (int) config('data_integrity.scan_lock_seconds', 180),
        );

        $snapshot = $cache->lock($cacheKey.':lock', $lockSeconds)->get(
            function () use ($at, $cache, $cacheKey): array {
                $snapshot = $this->scanner->scan($at);
                $retentionSeconds = max(
                    3600,
                    (int) config('data_integrity.cache_retention_seconds', 604800),
                );
                $cache->put($cacheKey, $snapshot, $retentionSeconds);

                return $snapshot;
            },
        );

        if (! is_array($snapshot)) {
            throw new RuntimeException('A data-integrity scan is already running.');
        }

        $this->writeOperationalLog($snapshot);

        return $this->withFreshness($snapshot);
    }

    /**
     * Read the latest cached projection without running any domain query.
     *
     * @return array<string, mixed>|null
     */
    public function latest(): ?array
    {
        $snapshot = $this->cache()->get($this->cacheKey());

        if (! is_array($snapshot)
            || ($snapshot['schema_version'] ?? null) !== DataIntegrityScanner::SCHEMA_VERSION
            || ! is_string($snapshot['expires_at'] ?? null)) {
            return null;
        }

        return $this->withFreshness($snapshot);
    }

    /**
     * Stable, compact source for a general monitoring snapshot service.
     *
     * @return array{
     *     available:bool,
     *     is_stale:bool,
     *     status:string,
     *     generated_at:?string,
     *     expires_at:?string,
     *     totals:array{checks:int,violations:int,critical:int,warning:int,info:int},
     *     domains:array<string, mixed>
     * }
     */
    public function summary(): array
    {
        $snapshot = $this->latest();

        if ($snapshot === null) {
            return [
                'available' => false,
                'is_stale' => true,
                'status' => 'unavailable',
                'generated_at' => null,
                'expires_at' => null,
                'totals' => $this->emptyTotals(),
                'domains' => $this->emptyDomains(),
            ];
        }

        return [
            'available' => true,
            'is_stale' => (bool) $snapshot['is_stale'],
            'status' => (string) $snapshot['status'],
            'generated_at' => (string) $snapshot['generated_at'],
            'expires_at' => (string) $snapshot['expires_at'],
            'totals' => $snapshot['totals'],
            'domains' => $snapshot['domains'],
        ];
    }

    /**
     * Stable, cached source for a visual/manual action queue. No customer PII
     * is present: samples contain opaque internal record identifiers only.
     *
     * @return array{
     *     available:bool,
     *     is_stale:bool,
     *     generated_at:?string,
     *     total:int,
     *     violations:int,
     *     items:list<array<string, mixed>>
     * }
     */
    public function actionQueue(): array
    {
        $snapshot = $this->latest();

        if ($snapshot === null) {
            return [
                'available' => false,
                'is_stale' => true,
                'generated_at' => null,
                'total' => 0,
                'violations' => 0,
                'items' => [],
            ];
        }

        $items = is_array($snapshot['action_queue'] ?? null)
            ? array_values($snapshot['action_queue'])
            : [];

        return [
            'available' => true,
            'is_stale' => (bool) $snapshot['is_stale'],
            'generated_at' => (string) $snapshot['generated_at'],
            'total' => count($items),
            'violations' => (int) ($snapshot['totals']['violations'] ?? 0),
            'items' => $items,
        ];
    }

    private function cache(): Repository
    {
        $configured = config('data_integrity.cache_store');

        return Cache::store(is_string($configured) && trim($configured) !== ''
            ? trim($configured)
            : null);
    }

    private function cacheKey(): string
    {
        $key = trim((string) config(
            'data_integrity.cache_key',
            'monitoring:data-integrity:snapshot:v1',
        ));

        return $key !== '' ? $key : 'monitoring:data-integrity:snapshot:v1';
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function withFreshness(array $snapshot): array
    {
        try {
            $expiresAt = CarbonImmutable::parse(
                (string) $snapshot['expires_at'],
                (string) config('app.timezone', 'Asia/Jakarta'),
            );
            $isStale = CarbonImmutable::now($expiresAt->getTimezone())->greaterThan($expiresAt);
        } catch (Throwable) {
            $isStale = true;
        }

        $snapshot['is_stale'] = $isStale;

        return $snapshot;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    private function writeOperationalLog(array $snapshot): void
    {
        $context = [
            'scan_id' => $snapshot['scan_id'] ?? null,
            'status' => $snapshot['status'] ?? null,
            'duration_ms' => $snapshot['duration_ms'] ?? null,
            'checks' => $snapshot['totals']['checks'] ?? 0,
            'violations' => $snapshot['totals']['violations'] ?? 0,
            'critical' => $snapshot['totals']['critical'] ?? 0,
            'warning' => $snapshot['totals']['warning'] ?? 0,
        ];

        try {
            Log::log(
                ($context['critical'] > 0 || $context['warning'] > 0) ? 'warning' : 'info',
                'data_integrity_scan_completed',
                $context,
            );
        } catch (Throwable) {
            // Monitoring output is best-effort. A log sink outage must not
            // discard the completed cached snapshot.
        }
    }

    /**
     * @return array{checks:int,violations:int,critical:int,warning:int,info:int}
     */
    private function emptyTotals(): array
    {
        return [
            'checks' => 0,
            'violations' => 0,
            'critical' => 0,
            'warning' => 0,
            'info' => 0,
        ];
    }

    /**
     * @return array<string, array{status:string,checks:int,violations:int,critical:int,warning:int,info:int}>
     */
    private function emptyDomains(): array
    {
        return [
            'bookings' => ['status' => 'unavailable', ...$this->emptyTotals()],
            'memberships' => ['status' => 'unavailable', ...$this->emptyTotals()],
            'payments' => ['status' => 'unavailable', ...$this->emptyTotals()],
        ];
    }
}
