<?php

namespace App\Console\Commands;

use App\Enums\MonitoringStatus;
use App\Models\DatabaseReplicationState;
use App\Services\Production\DatabaseReplicationControlPlane;
use App\Services\Production\DatabaseReplicationEnvelopeReader;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use InvalidArgumentException;
use Throwable;

final class ImportDatabaseReplicationAttestation extends Command
{
    protected $signature = 'replication:attestation-import
        {--file=- : Signed JSON envelope path, or - for standard input}
        {--bootstrap-if-empty : Import the configured bootstrap envelope only when all control-plane tables exist and state is empty}
        {--fail-on-unhealthy : Return non-zero after valid unhealthy evidence is durably accepted}';

    protected $description = 'Verify and ingest an independently signed database-replication observation';

    public function handle(
        DatabaseReplicationControlPlane $controlPlane,
        DatabaseReplicationEnvelopeReader $reader,
    ): int {
        try {
            $path = (string) $this->option('file');
            if ((bool) $this->option('bootstrap-if-empty')) {
                foreach ([
                    'database_replication_states',
                    'database_replication_event_chain_heads',
                    'database_replication_events',
                ] as $table) {
                    if (! Schema::hasTable($table)) {
                        throw new InvalidArgumentException(
                            'Replication bootstrap refused because the control-plane schema is incomplete.',
                        );
                    }
                }
                if (DatabaseReplicationState::query()->whereKey('primary')->exists()) {
                    if (! $this->option('quiet')) {
                        $this->components->info(
                            'Replication state already exists; bootstrap envelope was not read.',
                        );
                    }

                    return self::SUCCESS;
                }

                if (! $controlPlane->isPristine()) {
                    throw new InvalidArgumentException(
                        'Replication bootstrap refused because existing control-plane history requires investigation.',
                    );
                }
                $path = trim((string) config(
                    'database_replication.bootstrap.attestation_file',
                    '',
                ));
                if ($path === '') {
                    throw new InvalidArgumentException(
                        'Replication bootstrap attestation is not configured.',
                    );
                }
            }

            $result = $controlPlane->recordEnvelope(
                $reader->read($path),
            );
            $state = $result['state'];
            $operational = $state->status === MonitoringStatus::Operational->value;
            if (! $this->option('quiet')) {
                $message = match (true) {
                    $result['accepted'] => sprintf(
                        'Replication observation accepted at epoch %d as %s%s.',
                        (int) $state->topology_epoch,
                        (string) $state->status,
                        $result['event'] === null
                            ? ''
                            : ' with event #'.(int) $result['event']->sequence,
                    ),
                    $result['event'] !== null => sprintf(
                        'Replication observation was fenced; epoch %d remains %s and incident event #%d is preserved.',
                        (int) $state->topology_epoch,
                        (string) $state->status,
                        (int) $result['event']->sequence,
                    ),
                    default => sprintf(
                        'Duplicate or older replication observation ignored; current epoch %d remains %s.',
                        (int) $state->topology_epoch,
                        (string) $state->status,
                    ),
                };
                $operational
                    ? $this->components->info($message)
                    : $this->components->warn($message);
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
            Log::error('database_replication.attestation_import_failed', [
                'failure_class' => $exception::class,
            ]);
            if (! $this->option('quiet')) {
                $this->components->error('Database replication attestation could not be imported.');
            }

            return self::FAILURE;
        }
    }
}
