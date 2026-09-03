<?php

namespace App\Services\Capacity;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

final class CapacityControlLease
{
    /**
     * Serialize source ingestion and decision generation for one immutable
     * control-plane identity. The database uniqueness constraints remain the
     * final fence if a process pause outlives this bounded lease.
     */
    public function run(callable $callback): mixed
    {
        $lock = Cache::lock(
            $this->name(),
            (int) config('capacity_planning.coordination.decision_lock_seconds', 30),
        );

        try {
            return $lock->block(
                (int) config('capacity_planning.coordination.decision_lock_wait_seconds', 5),
                $callback,
            );
        } catch (LockTimeoutException) {
            throw new RuntimeException('Another capacity control cycle owns the distributed decision lease.');
        }
    }

    private function name(): string
    {
        $identity = implode("\0", [
            (string) config('capacity_planning.environment'),
            (string) config('monitoring.release'),
            (string) config('capacity_planning.infrastructure_profile'),
            (string) config('capacity_planning.platform.provider'),
        ]);

        return 'capacity-control:decision:v2:'.substr(hash('sha256', $identity), 0, 32);
    }
}
