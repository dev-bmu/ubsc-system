<?php

namespace App\Services\Monitoring;

final class BackgroundQueueRegistry
{
    /**
     * @return list<array{key:string,label:string,connection:string,queue:string}>
     */
    public function all(): array
    {
        $definitions = [];
        $aliases = (array) config('background_jobs.monitoring.queues', []);

        foreach ($aliases as $alias) {
            if (! is_string($alias) || ! $this->valid($alias)) {
                continue;
            }

            $queue = trim((string) config('background_jobs.queues.'.$alias, ''));
            $connection = in_array($alias, ['media_image', 'media_video'], true)
                ? trim((string) config('background_jobs.media_connection', ''))
                : trim((string) config('background_jobs.connection', ''));

            if ($alias === 'documents') {
                $configuredConnection = trim((string) config('invoice_pdf.prewarm.connection', ''));
                $configuredQueue = trim((string) config('invoice_pdf.prewarm.queue', ''));
                $connection = $configuredConnection !== '' ? $configuredConnection : $connection;
                $queue = $configuredQueue !== '' ? $configuredQueue : $queue;
            }

            $this->append($definitions, $alias, $connection, $queue);
        }

        $this->append(
            $definitions,
            'primary',
            trim((string) config('monitoring.queue.connection', '')),
            trim((string) config('monitoring.queue.queue', '')),
        );

        return array_values($definitions);
    }

    /** @return list<string> */
    public function capacityTargetKeys(): array
    {
        return array_map(
            static fn (array $definition): string => 'queue:'.$definition['key'],
            $this->all(),
        );
    }

    /**
     * @param  array<string, array{key:string,label:string,connection:string,queue:string}>  $definitions
     */
    private function append(
        array &$definitions,
        string $key,
        string $connection,
        string $queue,
    ): void {
        if (! $this->valid($connection)
            || ! $this->valid($queue)
            || ! is_array(config('queue.connections.'.$connection))) {
            return;
        }

        $identity = $connection."\0".$queue;
        $definitions[$identity] ??= [
            'key' => $key,
            'label' => str($key)->replace('_', ' ')->headline()->toString(),
            'connection' => $connection,
            'queue' => $queue,
        ];
    }

    private function valid(string $value): bool
    {
        return preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/', $value) === 1;
    }
}
