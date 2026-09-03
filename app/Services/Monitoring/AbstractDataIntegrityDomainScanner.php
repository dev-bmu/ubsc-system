<?php

namespace App\Services\Monitoring;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

abstract class AbstractDataIntegrityDomainScanner
{
    /**
     * Turn an arbitrary violation query into a bounded, PII-free check result.
     *
     * The supplied query must expose `subject_id` and may expose
     * `related_id`. Wrapping it as a subquery makes aggregate/grouped checks
     * count correctly on both MariaDB and SQLite without loading every row.
     *
     * @param  array<string, int|string|bool|null>  $context
     * @return array{
     *     key:string,
     *     domain:string,
     *     severity:string,
     *     title:string,
     *     description:string,
     *     recommended_action:string,
     *     reconciliation:string,
     *     count:int,
     *     samples:list<array{record_id:int|string,related_record_id?:int|string}>,
     *     context:array<string, int|string|bool|null>
     * }
     */
    protected function result(
        Builder $violations,
        int $sampleLimit,
        string $key,
        string $domain,
        string $severity,
        string $title,
        string $description,
        string $recommendedAction,
        string $reconciliation = 'manual_review',
        array $context = [],
    ): array {
        $sampleLimit = max(1, min(100, $sampleLimit));
        $wrapped = DB::query()->fromSub($violations, 'integrity_violations');
        $count = (int) (clone $wrapped)->count();
        $samples = [];

        if ($count > 0) {
            $rows = (clone $wrapped)
                ->orderBy('subject_id')
                ->limit($sampleLimit)
                ->get();

            foreach ($rows as $row) {
                $recordId = $this->normalizeIdentifier($row->subject_id ?? null);

                if ($recordId === null) {
                    continue;
                }

                $sample = ['record_id' => $recordId];
                $relatedId = $this->normalizeIdentifier($row->related_id ?? null);

                if ($relatedId !== null) {
                    $sample['related_record_id'] = $relatedId;
                }

                $samples[] = $sample;
            }
        }

        return [
            'key' => $key,
            'domain' => $domain,
            'severity' => $severity,
            'title' => $title,
            'description' => $description,
            'recommended_action' => $recommendedAction,
            'reconciliation' => $reconciliation,
            'count' => $count,
            'samples' => $samples,
            'context' => $context,
        ];
    }

    private function normalizeIdentifier(mixed $value): int|string|null
    {
        if (is_int($value)) {
            return $value;
        }

        if (is_string($value)) {
            $value = trim($value);

            if ($value === '') {
                return null;
            }

            return ctype_digit($value) ? (int) $value : substr($value, 0, 191);
        }

        return is_numeric($value) ? (int) $value : null;
    }
}
