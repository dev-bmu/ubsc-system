<?php

namespace App\Console\Commands;

use App\Services\Production\ResilienceDrillContract;
use App\Services\Production\ResilienceDrillLedger;
use Illuminate\Console\Command;
use InvalidArgumentException;
use Throwable;

final class RecordResilienceDrillEvidence extends Command
{
    protected $signature = 'resilience:evidence:record
        {file : Signed resilience evidence envelope from the protected orchestrator}
        {--json : Emit machine-readable JSON}';

    protected $description = 'Verify and append signed non-production resilience drill evidence';

    public function handle(
        ResilienceDrillLedger $ledger,
        ResilienceDrillContract $contract,
    ): int {
        try {
            $report = $contract->report(false);
            if (! $report['valid']) {
                throw new InvalidArgumentException(
                    'Resilience evidence ingestion refused because its static safety contract is invalid.',
                );
            }
            $evidence = $ledger->record($this->readEnvelope((string) $this->argument('file')));
            $result = [
                'public_id' => (string) $evidence->public_id,
                'campaign_id' => (string) $evidence->campaign_id,
                'status' => (string) $evidence->status,
                'environment' => (string) $evidence->environment,
                'release' => (string) $evidence->release,
                'scenario_count' => (int) $evidence->scenario_count,
                'passed_count' => (int) $evidence->passed_count,
                'failed_count' => (int) $evidence->failed_count,
                'aborted_count' => (int) $evidence->aborted_count,
                'campaign_controls_passed' => (bool) $evidence->campaign_controls_passed,
                'completed_at' => $evidence->completed_at?->toIso8601String(),
            ];

            if ($this->option('json')) {
                $this->line((string) json_encode(
                    $result,
                    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                ));
            } else {
                $this->components->info('Signed resilience campaign evidence accepted.');
                $this->table(['Field', 'Value'], collect($result)->map(
                    static fn (mixed $value, string $key): array => [$key, (string) $value],
                )->values()->all());
            }

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->components->error($exception->getMessage());

            return self::FAILURE;
        }
    }

    /** @return array<string, mixed> */
    private function readEnvelope(string $path): array
    {
        $maximum = min(262_144, max(32_768, (int) config(
            'resilience_drills.evidence.maximum_envelope_bytes',
            196_608,
        )));
        if (str_contains($path, '://') || ! is_file($path) || ! is_readable($path)) {
            throw new InvalidArgumentException(
                'Resilience evidence file is missing, unreadable, or not a local file.',
            );
        }

        $size = @filesize($path);
        if (! is_int($size) || $size < 2 || $size > $maximum) {
            throw new InvalidArgumentException('Resilience evidence file is empty or too large.');
        }
        $handle = @fopen($path, 'rb');
        if (! is_resource($handle)) {
            throw new InvalidArgumentException('Resilience evidence file could not be opened.');
        }
        try {
            $contents = stream_get_contents($handle, $maximum + 1);
        } finally {
            fclose($handle);
        }
        if (! is_string($contents) || strlen($contents) > $maximum) {
            throw new InvalidArgumentException('Resilience evidence file is unreadable or too large.');
        }

        $decoded = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new InvalidArgumentException(
                'Resilience evidence file must contain one JSON object.',
            );
        }

        return $decoded;
    }
}
