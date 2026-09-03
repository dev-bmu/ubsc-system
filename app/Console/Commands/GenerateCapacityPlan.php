<?php

namespace App\Console\Commands;

use App\Services\Capacity\CapacityAutoscalingPlanner;
use Illuminate\Console\Command;
use Throwable;

final class GenerateCapacityPlan extends Command
{
    protected $signature = 'capacity:plan
        {--json : Emit the complete signed machine-readable envelope}
        {--fail-on-blocked : Return failure when a global safety prerequisite blocks the plan}';

    protected $description = 'Generate a bounded, anti-flap, short-lived capacity desired-state plan';

    public function handle(CapacityAutoscalingPlanner $planner): int
    {
        try {
            $envelope = $planner->plan();
            $payload = (array) ($envelope['payload'] ?? []);

            if ($this->option('json')) {
                $this->line((string) json_encode($envelope, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
            } else {
                $this->components->info(sprintf(
                    'Capacity plan %s (%s).',
                    (string) ($payload['plan_id'] ?? 'unavailable'),
                    (string) ($payload['status'] ?? 'unknown'),
                ));
                $this->table(
                    ['Target', 'Current', 'Raw', 'Desired', 'Bounds', 'Action', 'Automatic', 'Reason'],
                    collect((array) ($payload['targets'] ?? []))->map(
                        static fn (array $target, string $key): array => [
                            $key,
                            (int) ($target['current_instances'] ?? 0),
                            (int) ($target['raw_recommendation'] ?? 0),
                            (int) ($target['desired_instances'] ?? 0),
                            ((int) ($target['minimum_instances'] ?? 0)).'-'.((int) ($target['maximum_instances'] ?? 0)),
                            (string) ($target['action'] ?? 'hold'),
                            (bool) ($target['automation_eligible'] ?? false) ? 'eligible' : 'no',
                            implode(', ', (array) ($target['reasons'] ?? [])),
                        ],
                    )->values()->all(),
                );
            }

            return $this->option('fail-on-blocked') && ($payload['status'] ?? null) === 'blocked'
                ? self::FAILURE
                : self::SUCCESS;
        } catch (Throwable $exception) {
            $this->components->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
