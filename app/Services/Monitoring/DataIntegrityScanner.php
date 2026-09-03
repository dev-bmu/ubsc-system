<?php

namespace App\Services\Monitoring;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;
use LogicException;

final class DataIntegrityScanner
{
    public const SCHEMA_VERSION = 1;

    public function __construct(
        private readonly BookingDataIntegrityScanner $bookings,
        private readonly MembershipDataIntegrityScanner $memberships,
        private readonly PaymentDataIntegrityScanner $payments,
    ) {}

    /**
     * Build an immutable, PII-free operational projection. This method never
     * writes domain data and deliberately returns bounded samples only.
     *
     * @return array<string, mixed>
     */
    public function scan(?CarbonInterface $at = null): array
    {
        $startedAt = hrtime(true);
        $timezone = (string) config('app.timezone', 'Asia/Jakarta');
        $scannedAt = $at === null
            ? CarbonImmutable::now($timezone)
            : CarbonImmutable::instance($at)->setTimezone($timezone);
        $sampleLimit = max(
            1,
            min(100, (int) config('data_integrity.sample_limit', 20)),
        );
        $staleAfterSeconds = max(
            60,
            (int) config('data_integrity.stale_after_seconds', 600),
        );
        $checks = [];
        $domains = [];
        $seenKeys = [];

        foreach ([$this->bookings, $this->memberships, $this->payments] as $scanner) {
            $domain = $scanner->domain();
            $domainChecks = $scanner->scan($scannedAt, $sampleLimit);

            foreach ($domainChecks as $check) {
                $this->assertCheckContract($check, $domain, $seenKeys);
                $seenKeys[$check['key']] = true;
                $checks[] = $check;
            }

            $domainTotals = $this->aggregate($domainChecks);
            $domains[$domain] = [
                'status' => $this->status($domainTotals),
                ...$domainTotals,
            ];
        }

        $totals = $this->aggregate($checks);
        $actionQueue = array_values(array_filter(
            $checks,
            static fn (array $check): bool => $check['count'] > 0,
        ));
        $severityRank = ['critical' => 3, 'warning' => 2, 'info' => 1];
        usort($actionQueue, static function (array $left, array $right) use ($severityRank): int {
            return ($severityRank[$right['severity']] <=> $severityRank[$left['severity']])
                ?: ($right['count'] <=> $left['count'])
                ?: strcmp($left['key'], $right['key']);
        });

        return [
            'schema_version' => self::SCHEMA_VERSION,
            'scan_id' => (string) Str::uuid(),
            'status' => $this->status($totals),
            'generated_at' => $scannedAt->toIso8601String(),
            'expires_at' => $scannedAt->addSeconds($staleAfterSeconds)->toIso8601String(),
            'duration_ms' => round((hrtime(true) - $startedAt) / 1_000_000, 2),
            'totals' => $totals,
            'domains' => $domains,
            'checks' => $checks,
            'action_queue' => $actionQueue,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $checks
     * @return array{checks:int,violations:int,critical:int,warning:int,info:int}
     */
    private function aggregate(array $checks): array
    {
        $aggregate = [
            'checks' => count($checks),
            'violations' => 0,
            'critical' => 0,
            'warning' => 0,
            'info' => 0,
        ];

        foreach ($checks as $check) {
            $count = max(0, (int) ($check['count'] ?? 0));
            $severity = (string) ($check['severity'] ?? 'info');
            $aggregate['violations'] += $count;

            if (array_key_exists($severity, $aggregate)) {
                $aggregate[$severity] += $count;
            }
        }

        return $aggregate;
    }

    /**
     * @param  array{critical:int,warning:int,info:int}  $totals
     */
    private function status(array $totals): string
    {
        return match (true) {
            $totals['critical'] > 0 => 'critical',
            $totals['warning'] > 0 => 'warning',
            default => 'healthy',
        };
    }

    /**
     * @param  array<string, mixed>  $check
     * @param  array<string, bool>  $seenKeys
     */
    private function assertCheckContract(array $check, string $domain, array $seenKeys): void
    {
        $key = $check['key'] ?? null;

        if (! is_string($key) || $key === '' || isset($seenKeys[$key])) {
            throw new LogicException('Data-integrity checks must have unique stable keys.');
        }

        if (($check['domain'] ?? null) !== $domain) {
            throw new LogicException("Data-integrity check [{$key}] has an invalid domain.");
        }

        if (! in_array($check['severity'] ?? null, ['critical', 'warning', 'info'], true)) {
            throw new LogicException("Data-integrity check [{$key}] has an invalid severity.");
        }

        if (! in_array($check['reconciliation'] ?? null, ['safe_candidate', 'manual_review'], true)) {
            throw new LogicException("Data-integrity check [{$key}] has an invalid reconciliation policy.");
        }

        if (! is_int($check['count'] ?? null) || $check['count'] < 0) {
            throw new LogicException("Data-integrity check [{$key}] has an invalid count.");
        }

        if (! is_array($check['samples'] ?? null) || ! is_array($check['context'] ?? null)) {
            throw new LogicException("Data-integrity check [{$key}] has an invalid bounded payload.");
        }
    }
}
