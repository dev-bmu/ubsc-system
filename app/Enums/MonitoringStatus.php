<?php

namespace App\Enums;

enum MonitoringStatus: string
{
    case Operational = 'operational';
    case Degraded = 'degraded';
    case Outage = 'outage';
    case Unknown = 'unknown';

    /**
     * Unknown ranks above operational so missing telemetry is never painted
     * green, but a known degraded/outage signal remains more urgent.
     */
    public function priority(): int
    {
        return match ($this) {
            self::Operational => 0,
            self::Unknown => 1,
            self::Degraded => 2,
            self::Outage => 3,
        };
    }

    /** @param iterable<self> $statuses */
    public static function worst(iterable $statuses): self
    {
        $worst = self::Operational;

        foreach ($statuses as $status) {
            if ($status->priority() > $worst->priority()) {
                $worst = $status;
            }
        }

        return $worst;
    }
}
