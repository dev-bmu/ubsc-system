<?php

namespace App\Services\Monitoring;

use App\Enums\MonitoringStatus;
use App\Models\MonitoringHeartbeat;
use App\Models\MonitoringRollup;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Throwable;

class MonitoringHistoryReader
{
    public function baseline(): ?CarbonImmutable
    {
        try {
            $heartbeat = MonitoringHeartbeat::query()->find(
                MonitoringRollupRecorder::BASELINE_HEARTBEAT_KEY,
            );

            return $heartbeat?->observed_at === null
                ? null
                : CarbonImmutable::instance($heartbeat->observed_at)->startOfMinute();
        } catch (Throwable) {
            return null;
        }
    }

    /** @return array<string, mixed> */
    public function overview(?CarbonInterface $at = null): array
    {
        $observedAt = CarbonImmutable::instance($at ?? now())->startOfMinute();
        $at = $observedAt->startOfHour();
        $hours = min(168, max(12, (int) config('monitoring.history.dashboard_hours', 24)));
        $start = $at->subHours($hours - 1);

        try {
            $rows = MonitoringRollup::query()
                ->where('metric_key', 'overall')
                ->whereBetween('bucket_started_at', [$start, $at->endOfHour()])
                ->orderBy('bucket_started_at')
                ->get()
                ->keyBy(static fn (MonitoringRollup $rollup): string => $rollup
                    ->bucket_started_at
                    ->format('Y-m-d H:00:00'));

            $baseline = $this->baseline();
            $points = collect(range(0, $hours - 1))->map(function (int $offset) use ($start, $rows, $baseline, $observedAt): array {
                $bucket = $start->addHours($offset);
                $expectedSamples = $this->expectedSamplesForBucket(
                    $bucket,
                    $observedAt,
                    $baseline,
                );
                /** @var MonitoringRollup|null $row */
                $row = $rows->get($bucket->format('Y-m-d H:00:00'));

                if ($row === null) {
                    return [
                        'started_at' => $bucket->toIso8601String(),
                        'status' => MonitoringStatus::Unknown->value,
                        'sample_count' => 0,
                        'expected_sample_count' => $expectedSamples,
                        'missing_sample_count' => $expectedSamples,
                        'operational_count' => 0,
                        'degraded_count' => 0,
                        'outage_count' => 0,
                        'unknown_count' => 0,
                        'availability_percent' => $expectedSamples > 0 ? 0.0 : null,
                    ];
                }

                return $this->point($row, $expectedSamples);
            })->all();

            return [
                'available' => $rows->isNotEmpty(),
                'bucket_minutes' => 60,
                'retention_days' => (int) config('monitoring.history.retention_days', 90),
                'window_hours' => $hours,
                'sample_count' => $rows->sum('sample_count'),
                'expected_sample_count' => collect($points)->sum('expected_sample_count'),
                'missing_sample_count' => collect($points)->sum('missing_sample_count'),
                'latest_sample_at' => $rows->last()?->last_sampled_at?->toIso8601String(),
                'points' => $points,
            ];
        } catch (Throwable) {
            return $this->emptyOverview($hours);
        }
    }

    /**
     * @return array{sample_count:int,operational_count:int,degraded_count:int,outage_count:int,unknown_count:int,sli_good_count:int,sli_total_count:int,latency_sample_count:int,latency_sum_ms:int,latency_max_ms:int|null,first_sampled_at:string|null,last_sampled_at:string|null}
     */
    public function aggregate(string $metricKey, CarbonInterface $since): array
    {
        $row = MonitoringRollup::query()
            ->where('metric_key', $metricKey)
            ->where('bucket_started_at', '>=', CarbonImmutable::instance($since)->startOfHour())
            ->selectRaw('COALESCE(SUM(sample_count), 0) AS sample_count')
            ->selectRaw('COALESCE(SUM(operational_count), 0) AS operational_count')
            ->selectRaw('COALESCE(SUM(degraded_count), 0) AS degraded_count')
            ->selectRaw('COALESCE(SUM(outage_count), 0) AS outage_count')
            ->selectRaw('COALESCE(SUM(unknown_count), 0) AS unknown_count')
            ->selectRaw('COALESCE(SUM(sli_good_count), 0) AS sli_good_count')
            ->selectRaw('COALESCE(SUM(sli_total_count), 0) AS sli_total_count')
            ->selectRaw('COALESCE(SUM(latency_sample_count), 0) AS latency_sample_count')
            ->selectRaw('COALESCE(SUM(latency_sum_ms), 0) AS latency_sum_ms')
            ->selectRaw('MAX(latency_max_ms) AS latency_max_ms')
            ->selectRaw('MIN(first_sampled_at) AS first_sampled_at')
            ->selectRaw('MAX(last_sampled_at) AS last_sampled_at')
            ->first();

        return [
            'sample_count' => (int) ($row?->sample_count ?? 0),
            'operational_count' => (int) ($row?->operational_count ?? 0),
            'degraded_count' => (int) ($row?->degraded_count ?? 0),
            'outage_count' => (int) ($row?->outage_count ?? 0),
            'unknown_count' => (int) ($row?->unknown_count ?? 0),
            'sli_good_count' => (int) ($row?->sli_good_count ?? 0),
            'sli_total_count' => (int) ($row?->sli_total_count ?? 0),
            'latency_sample_count' => (int) ($row?->latency_sample_count ?? 0),
            'latency_sum_ms' => (int) ($row?->latency_sum_ms ?? 0),
            'latency_max_ms' => $row?->latency_max_ms === null
                ? null
                : (int) $row->latency_max_ms,
            'first_sampled_at' => $row?->first_sampled_at === null
                ? null
                : (string) $row->first_sampled_at,
            'last_sampled_at' => $row?->last_sampled_at === null
                ? null
                : (string) $row->last_sampled_at,
        ];
    }

    /** @return array<string, mixed> */
    private function point(MonitoringRollup $row, int $expectedSamples): array
    {
        $sampleCount = max(0, (int) $row->sample_count);
        if ($expectedSamples === 0) {
            $first = $row->first_sampled_at ?? $row->last_sampled_at;
            $last = $row->last_sampled_at ?? $first;
            $expectedSamples = $first === null || $last === null
                ? $sampleCount
                : max($sampleCount, ((int) $first->diffInMinutes($last)) + 1);
        }
        $expectedSamples = max($sampleCount, $expectedSamples);
        $missingSamples = max(0, $expectedSamples - $sampleCount);
        $status = match (true) {
            (int) $row->outage_count > 0 => MonitoringStatus::Outage,
            (int) $row->degraded_count > 0 => MonitoringStatus::Degraded,
            (int) $row->unknown_count > 0 || $missingSamples > 0 => MonitoringStatus::Unknown,
            default => MonitoringStatus::Operational,
        };

        return [
            'started_at' => $row->bucket_started_at->toIso8601String(),
            'status' => $status->value,
            'sample_count' => $sampleCount,
            'expected_sample_count' => $expectedSamples,
            'missing_sample_count' => $missingSamples,
            'operational_count' => (int) $row->operational_count,
            'degraded_count' => (int) $row->degraded_count,
            'outage_count' => (int) $row->outage_count,
            'unknown_count' => (int) $row->unknown_count,
            'availability_percent' => $expectedSamples === 0
                ? null
                : round(((int) $row->operational_count / $expectedSamples) * 100, 3),
        ];
    }

    private function expectedSamplesForBucket(
        CarbonImmutable $bucket,
        CarbonImmutable $observedAt,
        ?CarbonImmutable $baseline,
    ): int {
        if ($baseline === null) {
            return 0;
        }

        $bucketEnd = $bucket->endOfHour()->startOfMinute();
        $start = $baseline->greaterThan($bucket) ? $baseline : $bucket;
        $end = $observedAt->lessThan($bucketEnd) ? $observedAt : $bucketEnd;

        if ($start->greaterThan($end)) {
            return 0;
        }

        return ((int) $start->diffInMinutes($end)) + 1;
    }

    /** @return array<string, mixed> */
    private function emptyOverview(int $hours): array
    {
        return [
            'available' => false,
            'bucket_minutes' => 60,
            'retention_days' => (int) config('monitoring.history.retention_days', 90),
            'window_hours' => $hours,
            'sample_count' => 0,
            'expected_sample_count' => 0,
            'missing_sample_count' => 0,
            'latest_sample_at' => null,
            'points' => [],
        ];
    }
}
