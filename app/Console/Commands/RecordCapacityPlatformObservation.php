<?php

namespace App\Console\Commands;

use App\Services\Capacity\CapacityPlatformObservationStore;
use Illuminate\Console\Command;
use Throwable;

final class RecordCapacityPlatformObservation extends Command
{
    protected $signature = 'capacity:observation:record {file : Signed provider observation envelope} {--json : Emit machine-readable JSON}';

    protected $description = 'Verify and record a short-lived platform capacity observation';

    public function handle(CapacityPlatformObservationStore $store): int
    {
        try {
            $observation = $store->record($this->readEnvelope((string) $this->argument('file')));
            $result = [
                'public_id' => (string) $observation->public_id,
                'observation_id' => (string) $observation->observation_id,
                'provider' => (string) $observation->provider,
                'release' => (string) $observation->release,
                'observed_at' => $observation->observed_at?->toIso8601String(),
                'expires_at' => $observation->expires_at?->toIso8601String(),
            ];

            if ($this->option('json')) {
                $this->line((string) json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
            } else {
                $this->components->info('Signed platform observation accepted.');
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
            throw new \InvalidArgumentException('Capacity observation file is missing, unreadable, or too large.');
        }

        $handle = @fopen($path, 'rb');
        if (! is_resource($handle)) {
            throw new \InvalidArgumentException('Capacity observation file is missing, unreadable, or too large.');
        }
        try {
            $contents = stream_get_contents($handle, $maximum + 1);
        } finally {
            fclose($handle);
        }
        if (! is_string($contents) || strlen($contents) > $maximum) {
            throw new \InvalidArgumentException('Capacity observation file is missing, unreadable, or too large.');
        }

        $decoded = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new \InvalidArgumentException('Capacity observation file must contain one JSON object.');
        }

        return $decoded;
    }
}
