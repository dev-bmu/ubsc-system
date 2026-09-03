<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Throwable;

class MonitoringSloService
{
    public function __construct(private readonly MonitoringHistoryReader $history) {}

    /** @return array<string, mixed> */
    public function summary(): array
    {
        $windowDays = max(7, (int) config('monitoring.slos.window_days', 28));
        $definitions = collect((array) config('monitoring.slos.definitions', []));

        $items = $definitions->map(function (mixed $definition) use ($windowDays): array {
            if (! is_array($definition)) {
                return $this->unknownObjective([], 'The SLO definition is invalid.');
            }

            try {
                return $this->objective($definition, $windowDays);
            } catch (Throwable) {
                return $this->unknownObjective(
                    $definition,
                    'Historical SLI telemetry could not be read.',
                );
            }
        })->values();

        $evaluated = $items->where('evaluation_status', 'evaluated')->count();
        $configured = $items->filter(
            static fn (array $item): bool => $item['target_percent'] !== null,
        )->count();

        return [
            'window_days' => $windowDays,
            'evaluation_status' => match (true) {
                $evaluated > 0 && $evaluated === $configured => 'configured',
                $configured > 0 => 'partial',
                default => 'unconfigured',
            },
            'items' => $items->all(),
        ];
    }

    /** @param array<string, mixed> $definition */
    private function objective(array $definition, int $windowDays): array
    {
        $target = $this->target($definition['target_percent'] ?? null);
        $source = (string) ($definition['source'] ?? 'unconfigured');

        if ($target === null) {
            return $this->unknownObjective(
                $definition,
                'Target has not been adopted after a production baseline.',
            );
        }

        if ($source === 'request_sli_rollups') {
            return $this->requestRatioObjective($definition, $windowDays, $target);
        }

        if ($source === 'external_synthetic') {
            return $this->externalSyntheticObjective($definition, $windowDays, $target);
        }

        if ($source !== 'internal_rollups') {
            return $this->unknownObjective(
                $definition,
                'The declared historical SLI source is not connected.',
            );
        }

        $windowStart = now()->startOfHour()->subHours(($windowDays * 24) - 1);
        $baseline = $this->history->baseline();
        $totals = $this->history->aggregate(
            'overall',
            $windowStart,
        );
        $minimumSamples = max(10, (int) config('monitoring.slos.minimum_samples', 60));
        $coverage = $this->coverage($totals, $windowStart, $baseline);
        $recordedSamples = $totals['sample_count'];
        $sampleCount = $coverage['expected_samples'];
        $missingSamples = max(0, $sampleCount - $recordedSamples);
        $goodSamples = $totals['operational_count'];
        $badSamples = max(0, $sampleCount - $goodSamples);
        $compliance = $sampleCount === 0
            ? null
            : round(($goodSamples / $sampleCount) * 100, 4);
        $sufficient = $sampleCount >= $minimumSamples;
        $budgetRemaining = $sufficient
            ? $this->remainingBudget($sampleCount, $badSamples, $target)
            : null;
        $burnRates = collect([1, 6, 24])->mapWithKeys(function (int $hours) use ($target, $baseline): array {
            $windowStart = now()->startOfHour()->subHours($hours - 1);
            $aggregate = $this->history->aggregate(
                'overall',
                $windowStart,
            );

            return ["{$hours}h" => $this->burnRate($aggregate, $target, $windowStart, $baseline)];
        })->all();
        $recentMissing = $this->recentMissingSamples('overall', $baseline, 60);

        return [
            'key' => (string) ($definition['key'] ?? 'unknown'),
            'name' => (string) ($definition['name'] ?? 'Unnamed objective'),
            'target_percent' => $target,
            'indicator' => (string) ($definition['indicator'] ?? ''),
            'source' => 'internal_rollups',
            'compliance_percent' => $compliance,
            'error_budget_remaining_percent' => $budgetRemaining,
            'sample_count' => $sampleCount,
            'expected_samples' => $sampleCount,
            'recorded_samples' => $recordedSamples,
            'missing_samples' => $missingSamples,
            'recent_missing_samples' => $recentMissing,
            'bad_samples' => $badSamples,
            'minimum_samples' => $minimumSamples,
            'burn_rates' => $burnRates,
            'evaluation_status' => $sufficient ? 'evaluated' : 'insufficient_data',
            'status' => ! $sufficient
                ? MonitoringStatus::Unknown->value
                : ($compliance !== null && $compliance >= $target
                    ? MonitoringStatus::Operational->value
                    : MonitoringStatus::Degraded->value),
            'message' => $sufficient
                ? 'Calculated from minute-idempotent health samples; missing collector minutes count as blind spots.'
                : "At least {$minimumSamples} samples are required before this objective is judged.",
        ];
    }

    /** @param array<string, mixed> $definition */
    private function requestRatioObjective(
        array $definition,
        int $windowDays,
        float $target,
    ): array {
        $metricKey = (string) ($definition['metric_key'] ?? '');
        if (preg_match('/^sli\.[a-z0-9_.:-]{1,90}$/', $metricKey) !== 1) {
            return $this->unknownObjective(
                $definition,
                'The request SLI metric key is invalid or missing.',
            );
        }

        $windowStart = now()->startOfHour()->subHours(($windowDays * 24) - 1);
        $totals = $this->history->aggregate($metricKey, $windowStart);
        $baseline = $this->metricBaseline($totals, $this->history->baseline());
        $coverage = $this->coverage($totals, $windowStart, $baseline);
        $expectedMinutes = $coverage['expected_samples'];
        $recordedMinutes = (int) $totals['sample_count'];
        $missingMinutes = max(0, $expectedMinutes - $recordedMinutes);
        $total = max(0, (int) ($totals['sli_total_count'] ?? 0));
        $good = min($total, max(0, (int) ($totals['sli_good_count'] ?? 0)));
        $bad = max(0, $total - $good);
        $minimumSamples = max(10, (int) config('monitoring.slos.minimum_samples', 60));
        $sufficient = $total >= $minimumSamples;
        $compliance = $total > 0 ? round(($good / $total) * 100, 4) : null;
        $coveragePercent = $expectedMinutes > 0
            ? round(min(100, ($recordedMinutes / $expectedMinutes) * 100), 4)
            : null;
        $budgetRemaining = $sufficient
            ? $this->remainingBudget($total, $bad, $target)
            : null;
        $burnRates = collect([1, 6, 24])->mapWithKeys(function (int $hours) use (
            $metricKey,
            $target,
        ): array {
            return ["{$hours}h" => $this->requestBurnRate(
                $metricKey,
                $target,
                now()->startOfHour()->subHours($hours - 1),
            )];
        })->all();
        $recentMissing = $this->recentMissingSamples($metricKey, $baseline, 60);
        $healthy = $sufficient
            && $compliance !== null
            && $compliance >= $target
            && $missingMinutes === 0;

        return [
            'key' => (string) ($definition['key'] ?? 'unknown'),
            'name' => (string) ($definition['name'] ?? 'Unnamed objective'),
            'target_percent' => $target,
            'indicator' => (string) ($definition['indicator'] ?? ''),
            'source' => 'request_sli_rollups',
            'metric_key' => $metricKey,
            'compliance_percent' => $compliance,
            'error_budget_remaining_percent' => $budgetRemaining,
            'sample_count' => $total,
            'expected_samples' => $expectedMinutes,
            'good_samples' => $good,
            'recorded_samples' => $recordedMinutes,
            'missing_samples' => $missingMinutes,
            'recent_missing_samples' => $recentMissing,
            'bad_samples' => $bad,
            'minimum_samples' => $minimumSamples,
            'coverage_percent' => $coveragePercent,
            'burn_rates' => $burnRates,
            'evaluation_status' => $sufficient ? 'evaluated' : 'insufficient_data',
            'status' => ! $sufficient
                ? MonitoringStatus::Unknown->value
                : ($healthy
                    ? MonitoringStatus::Operational->value
                    : MonitoringStatus::Degraded->value),
            'message' => match (true) {
                ! $sufficient => "At least {$minimumSamples} request samples are required before this objective is judged.",
                $missingMinutes > 0 => 'Compliance is calculated, but missing collector minutes keep the objective non-operational.',
                $healthy => 'Calculated from bounded per-request good/total counts with complete collector coverage.',
                default => 'The measured request ratio is consuming or has exceeded its error budget.',
            },
        ];
    }

    /** @param array<string, mixed> $definition */
    private function externalSyntheticObjective(
        array $definition,
        int $windowDays,
        float $target,
    ): array {
        $metricKey = (string) ($definition['metric_key'] ?? '');
        if ($metricKey !== (string) config(
            'observability.external_sli.metric_key',
            'sli.public_availability',
        )) {
            return $this->unknownObjective(
                $definition,
                'The external synthetic SLI metric key is invalid or missing.',
            );
        }

        $windowStart = now()->startOfHour()->subHours(($windowDays * 24) - 1);
        $totals = $this->history->aggregate($metricKey, $windowStart);
        $baseline = $this->metricBaseline($totals, null);
        $interval = min(300, max(60, (int) config(
            'monitoring.external.interval_seconds',
            300,
        )));
        $recorded = max(0, (int) ($totals['sli_total_count'] ?? 0));
        $good = min($recorded, max(0, (int) ($totals['sli_good_count'] ?? 0)));
        $expected = max(
            $recorded,
            $this->expectedExternalSamples($windowStart, $baseline, $interval),
        );
        $missing = max(0, $expected - $recorded);
        $bad = max(0, $expected - $good);
        $minimumSamples = max(10, (int) config('monitoring.slos.minimum_samples', 60));
        $sufficient = $expected >= $minimumSamples;
        $compliance = $expected > 0 ? round(($good / $expected) * 100, 4) : null;
        $budgetRemaining = $sufficient
            ? $this->remainingBudget($expected, $bad, $target)
            : null;
        $burnRates = collect([1, 6, 24])->mapWithKeys(function (int $hours) use (
            $metricKey,
            $target,
            $baseline,
            $interval,
        ): array {
            $start = now()->startOfHour()->subHours($hours - 1);

            return ["{$hours}h" => $this->externalBurnRate(
                $metricKey,
                $target,
                $start,
                $baseline,
                $interval,
            )];
        })->all();
        // One interval of grace absorbs normal external scheduler jitter. A
        // second absent interval is a real current telemetry gap, while every
        // missing interval still consumes the long-window error budget above.
        $recentMissing = $this->recentMissingSamples(
            $metricKey,
            $baseline,
            $interval,
            1,
            true,
        );
        $healthy = $sufficient && $compliance !== null && $compliance >= $target;

        return [
            'key' => (string) ($definition['key'] ?? 'unknown'),
            'name' => (string) ($definition['name'] ?? 'Unnamed objective'),
            'target_percent' => $target,
            'indicator' => (string) ($definition['indicator'] ?? ''),
            'source' => 'external_synthetic',
            'metric_key' => $metricKey,
            'compliance_percent' => $compliance,
            'error_budget_remaining_percent' => $budgetRemaining,
            'sample_count' => $expected,
            'expected_samples' => $expected,
            'good_samples' => $good,
            'recorded_samples' => $recorded,
            'missing_samples' => $missing,
            'recent_missing_samples' => $recentMissing,
            'bad_samples' => $bad,
            'minimum_samples' => $minimumSamples,
            'coverage_percent' => $expected > 0
                ? round(($recorded / $expected) * 100, 4)
                : null,
            'burn_rates' => $burnRates,
            'evaluation_status' => $sufficient ? 'evaluated' : 'insufficient_data',
            'status' => ! $sufficient
                ? MonitoringStatus::Unknown->value
                : ($healthy
                    ? MonitoringStatus::Operational->value
                    : MonitoringStatus::Degraded->value),
            'message' => match (true) {
                ! $sufficient => "At least {$minimumSamples} scheduled external checks are required before this objective is judged.",
                $missing > 0 => 'Missing external probe intervals conservatively consume the public-availability error budget.',
                $healthy => 'Calculated from authenticated external synthetic checks with complete interval coverage.',
                default => 'External synthetic failures have consumed or exceeded the public-availability error budget.',
            },
        ];
    }

    /** @param array<string, mixed> $definition */
    private function unknownObjective(array $definition, string $message): array
    {
        return [
            'key' => (string) ($definition['key'] ?? 'unknown'),
            'name' => (string) ($definition['name'] ?? 'Unnamed objective'),
            'target_percent' => $this->target($definition['target_percent'] ?? null),
            'indicator' => (string) ($definition['indicator'] ?? ''),
            'source' => (string) ($definition['source'] ?? 'unconfigured'),
            'compliance_percent' => null,
            'error_budget_remaining_percent' => null,
            'sample_count' => 0,
            'expected_samples' => 0,
            'recorded_samples' => 0,
            'missing_samples' => 0,
            'recent_missing_samples' => 0,
            'bad_samples' => 0,
            'minimum_samples' => max(10, (int) config('monitoring.slos.minimum_samples', 60)),
            'burn_rates' => ['1h' => null, '6h' => null, '24h' => null],
            'evaluation_status' => 'unconfigured',
            'status' => MonitoringStatus::Unknown->value,
            'message' => $message,
        ];
    }

    /** @param array<string, int|string|null> $aggregate */
    private function burnRate(
        array $aggregate,
        float $target,
        CarbonInterface $windowStart,
        ?CarbonInterface $baseline,
    ): ?float {
        $coverage = $this->coverage($aggregate, $windowStart, $baseline);
        $samples = $coverage['expected_samples'];

        if ($samples === 0) {
            return null;
        }

        $bad = max(0, $samples - (int) ($aggregate['operational_count'] ?? 0));
        $allowedRate = max(0.000001, 1 - ($target / 100));

        return round(($bad / $samples) / $allowedRate, 3);
    }

    private function requestBurnRate(
        string $metricKey,
        float $target,
        CarbonInterface $windowStart,
    ): ?float {
        $aggregate = $this->history->aggregate($metricKey, $windowStart);
        $total = max(0, (int) ($aggregate['sli_total_count'] ?? 0));
        if ($total === 0) {
            return null;
        }

        $good = min($total, max(0, (int) ($aggregate['sli_good_count'] ?? 0)));
        $bad = max(0, $total - $good);
        $allowedRate = max(0.000001, 1 - ($target / 100));

        return round(($bad / $total) / $allowedRate, 3);
    }

    private function externalBurnRate(
        string $metricKey,
        float $target,
        CarbonInterface $windowStart,
        ?CarbonInterface $baseline,
        int $intervalSeconds,
    ): ?float {
        $aggregate = $this->history->aggregate($metricKey, $windowStart);
        $recorded = max(0, (int) ($aggregate['sli_total_count'] ?? 0));
        $expected = max(
            $recorded,
            $this->expectedExternalSamples($windowStart, $baseline, $intervalSeconds),
        );
        if ($expected === 0) {
            return null;
        }

        $good = min($recorded, max(0, (int) ($aggregate['sli_good_count'] ?? 0)));
        $bad = max(0, $expected - $good);
        $allowedRate = max(0.000001, 1 - ($target / 100));

        return round(($bad / $expected) / $allowedRate, 3);
    }

    private function expectedExternalSamples(
        CarbonInterface $windowStart,
        ?CarbonInterface $baseline,
        int $intervalSeconds,
    ): int {
        if ($baseline === null) {
            return 0;
        }

        $start = CarbonImmutable::instance($baseline)->greaterThan($windowStart)
            ? CarbonImmutable::instance($baseline)
            : CarbonImmutable::instance($windowStart);
        $end = CarbonImmutable::instance(now());
        if ($start->greaterThan($end)) {
            return 0;
        }

        return intdiv((int) $start->diffInSeconds($end), max(60, $intervalSeconds)) + 1;
    }

    private function recentMissingSamples(
        string $metricKey,
        ?CarbonInterface $baseline,
        int $intervalSeconds,
        int $graceSamples = 0,
        bool $useSliCount = false,
    ): int {
        if ($baseline === null) {
            return 0;
        }

        $windowStart = now()->startOfHour();
        $aggregate = $this->history->aggregate($metricKey, $windowStart);
        $expected = $intervalSeconds === 60
            ? $this->coverage($aggregate, $windowStart, $baseline)['expected_samples']
            : $this->expectedExternalSamples($windowStart, $baseline, $intervalSeconds);
        $recorded = max(0, (int) ($aggregate[
            $useSliCount ? 'sli_total_count' : 'sample_count'
        ] ?? 0));

        return max(0, $expected - $recorded - max(0, $graceSamples));
    }

    /**
     * @param  array<string, int|string|null>  $aggregate
     * @return array{expected_samples:int,first_sampled_at:string|null}
     */
    private function coverage(
        array $aggregate,
        CarbonInterface $windowStart,
        ?CarbonInterface $baseline,
    ): array {
        $first = $baseline === null ? null : CarbonImmutable::instance($baseline)->startOfMinute();
        $firstValue = $aggregate['first_sampled_at'] ?? null;

        if ($first === null && (! is_string($firstValue) || trim($firstValue) === '')) {
            return ['expected_samples' => 0, 'first_sampled_at' => null];
        }

        if ($first === null) {
            try {
                $first = CarbonImmutable::parse((string) $firstValue)->startOfMinute();
            } catch (Throwable) {
                return ['expected_samples' => 0, 'first_sampled_at' => null];
            }
        }

        $start = $first->greaterThan($windowStart)
            ? $first
            : CarbonImmutable::instance($windowStart)->startOfMinute();
        $end = CarbonImmutable::instance(now())->startOfMinute();

        return [
            'expected_samples' => $start->greaterThan($end)
                ? 0
                : ((int) $start->diffInMinutes($end)) + 1,
            'first_sampled_at' => $first->toIso8601String(),
        ];
    }

    private function remainingBudget(int $samples, int $bad, float $target): float
    {
        $allowed = $samples * max(0, 1 - ($target / 100));

        if ($allowed <= 0) {
            return $bad === 0 ? 100.0 : 0.0;
        }

        return round(max(0, min(100, (($allowed - $bad) / $allowed) * 100)), 3);
    }

    /** @param array<string, int|string|null> $aggregate */
    private function metricBaseline(
        array $aggregate,
        ?CarbonInterface $globalBaseline,
    ): ?CarbonImmutable {
        $value = $aggregate['first_sampled_at'] ?? null;
        if (! is_string($value) || trim($value) === '') {
            return $globalBaseline === null
                ? null
                : CarbonImmutable::instance($globalBaseline);
        }

        try {
            $metricBaseline = CarbonImmutable::parse($value)->startOfMinute();
        } catch (Throwable) {
            return $globalBaseline === null
                ? null
                : CarbonImmutable::instance($globalBaseline);
        }

        if ($globalBaseline === null) {
            return $metricBaseline;
        }

        $global = CarbonImmutable::instance($globalBaseline)->startOfMinute();

        return $metricBaseline->greaterThan($global) ? $metricBaseline : $global;
    }

    private function target(mixed $value): ?float
    {
        return is_numeric($value) && (float) $value >= 90 && (float) $value < 100
            ? round((float) $value, 4)
            : null;
    }
}
