<?php

namespace App\Console\Commands;

use App\Services\Capacity\CapacityLoadEvidenceStore;
use Illuminate\Console\Command;
use Throwable;

final class RecordCapacityEvidence extends Command
{
    protected $signature = 'capacity:evidence:record {file : Signed capacity evidence envelope} {--json : Emit machine-readable JSON}';

    protected $description = 'Verify and append signed production-like capacity evidence';

    public function handle(CapacityLoadEvidenceStore $store): int
    {
        try {
            $evidence = $store->record($this->readEnvelope((string) $this->argument('file')));
            $result = [
                'public_id' => (string) $evidence->public_id,
                'test_id' => (string) $evidence->test_id,
                'scope' => (string) $evidence->scope,
                'release' => (string) $evidence->release,
                'tested_requests_per_second' => (float) $evidence->tested_requests_per_second,
                'operational_requests_per_second' => (float) $evidence->operational_requests_per_second,
                'operational_requests_per_second_per_instance' => (float) $evidence->operational_requests_per_second_per_instance,
                'expires_at' => $evidence->expires_at?->toIso8601String(),
            ];

            if ($this->option('json')) {
                $this->line((string) json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
            } else {
                $this->components->info('Signed capacity evidence accepted.');
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
        $maximum = (int) config('capacity_planning.platform.maximum_payload_bytes', 65_536);
        if (! is_file($path) || ! is_readable($path)) {
            throw new \InvalidArgumentException('Capacity evidence file is missing, unreadable, or too large.');
        }

        $handle = @fopen($path, 'rb');
        if (! is_resource($handle)) {
            throw new \InvalidArgumentException('Capacity evidence file is missing, unreadable, or too large.');
        }
        try {
            $contents = stream_get_contents($handle, $maximum + 1);
        } finally {
            fclose($handle);
        }
        if (! is_string($contents) || strlen($contents) > $maximum) {
            throw new \InvalidArgumentException('Capacity evidence file is missing, unreadable, or too large.');
        }

        $decoded = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new \InvalidArgumentException('Capacity evidence file must contain one JSON object.');
        }

        return $decoded;
    }
}
