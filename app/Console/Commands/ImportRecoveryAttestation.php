<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Services\Production\RecoveryEvidenceLedger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Throwable;

final class ImportRecoveryAttestation extends Command
{
    protected $signature = 'recovery:attestation-import
        {--file=- : Signed JSON envelope path, or - for standard input}
        {--fail-on-unhealthy : Return non-zero after valid degraded or outage evidence is durably recorded}';

    protected $description = 'Verify and append independently signed database-recovery evidence';

    public function handle(RecoveryEvidenceLedger $ledger): int
    {
        try {
            $envelope = $this->readEnvelope((string) $this->option('file'));
            $evidence = $ledger->recordEnvelope($envelope);

            $operational = $evidence->status === MonitoringStatus::Operational->value;
            if (! $this->option('quiet') && $operational) {
                $this->components->info(sprintf(
                    'Recovery evidence #%d imported as %s.',
                    (int) $evidence->sequence,
                    (string) $evidence->status,
                ));
            }
            if (! $this->option('quiet') && ! $operational) {
                $this->components->warn(sprintf(
                    'Non-operational recovery evidence #%d was durably imported; monitoring remains unhealthy.',
                    (int) $evidence->sequence,
                ));
            }

            return ! $operational && (bool) $this->option('fail-on-unhealthy')
                ? self::FAILURE
                : self::SUCCESS;
        } catch (InvalidArgumentException $exception) {
            if (! $this->option('quiet')) {
                $this->components->error($exception->getMessage());
            }

            return self::INVALID;
        } catch (Throwable $exception) {
            Log::error('recovery.attestation_import_failed', [
                'failure_class' => $exception::class,
            ]);
            if (! $this->option('quiet')) {
                $this->components->error('Recovery attestation could not be imported.');
            }

            return self::FAILURE;
        }
    }

    /** @return array<string, mixed> */
    private function readEnvelope(string $path): array
    {
        $maximum = min(262_144, max(16_384, (int) config(
            'disaster_recovery.attestation.maximum_envelope_bytes',
            98_304,
        )));
        if ($path === '-') {
            $stream = fopen('php://stdin', 'rb');
            if ($stream === false) {
                throw new InvalidArgumentException('Recovery attestation input is unavailable.');
            }
            $contents = stream_get_contents($stream, $maximum + 1);
            fclose($stream);
        } else {
            $path = trim($path);
            if ($path === '' || ! is_file($path) || ! is_readable($path)) {
                throw new InvalidArgumentException('Recovery attestation file is not readable.');
            }
            $size = filesize($path);
            if (! is_int($size) || $size < 2 || $size > $maximum) {
                throw new InvalidArgumentException('Recovery attestation file has an invalid size.');
            }
            $contents = file_get_contents($path, false, null, 0, $maximum + 1);
        }
        if (! is_string($contents) || strlen($contents) > $maximum) {
            throw new InvalidArgumentException('Recovery attestation envelope exceeds the safety limit.');
        }

        try {
            $decoded = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new InvalidArgumentException('Recovery attestation is not valid JSON.');
        }
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new InvalidArgumentException('Recovery attestation must be one JSON object.');
        }

        return $decoded;
    }
}
