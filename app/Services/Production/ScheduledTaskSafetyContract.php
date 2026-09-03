<?php

namespace App\Services\Production;

use App\Exceptions\ProcessSupervisionContractViolation;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Config\Repository;

final class ScheduledTaskSafetyContract
{
    public function __construct(
        private readonly Schedule $schedule,
        private readonly Repository $config,
    ) {}

    /** @return array{valid:bool,failures:int,checks:list<array{code:string,status:string,message:string>>} */
    public function report(): array
    {
        $checks = [];
        $events = $this->schedule->events();
        $names = [];
        $maximumLockMinutes = (int) $this->config->get(
            'process_supervision.safety.maximum_schedule_lock_minutes',
            60,
        );

        if ($events === []) {
            $checks[] = [
                'code' => 'schedule.events',
                'status' => 'fail',
                'message' => 'No production scheduled tasks were registered.',
            ];
        }

        foreach ($events as $index => $event) {
            $name = trim((string) $event->description);
            $identity = $name !== '' ? $name : 'event-'.($index + 1);
            $safeCode = trim((string) preg_replace(
                '/[^a-z0-9]+/',
                '-',
                strtolower($identity),
            ), '-');
            $safeCode = $safeCode !== ''
                ? substr($safeCode, 0, 80)
                : substr(hash('sha256', $identity), 0, 12);
            $nameIsUnique = $name !== '' && ! isset($names[$name]);

            if ($name !== '') {
                $names[$name] = true;
            }

            $locksAreSafe = $event->onOneServer === true
                && $event->withoutOverlapping === true
                && (int) $event->expiresAt >= 1
                && (int) $event->expiresAt <= $maximumLockMinutes;

            $checks[] = [
                'code' => "schedule.{$safeCode}.identity",
                'status' => $nameIsUnique ? 'pass' : 'fail',
                'message' => $nameIsUnique
                    ? 'Scheduled task has a stable unique identity.'
                    : 'Every scheduled task must have a unique explicit name.',
            ];
            $checks[] = [
                'code' => "schedule.{$safeCode}.locks",
                'status' => $locksAreSafe ? 'pass' : 'fail',
                'message' => $locksAreSafe
                    ? 'Scheduled task uses distributed single-server and bounded overlap locks.'
                    : 'Scheduled task must use onOneServer and a bounded withoutOverlapping lock.',
            ];
        }

        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));

        return [
            'valid' => $failures === 0,
            'failures' => $failures,
            'checks' => $checks,
        ];
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();

        if ($report['valid']) {
            return;
        }

        $codes = array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));

        throw ProcessSupervisionContractViolation::fromCodes($codes);
    }
}
