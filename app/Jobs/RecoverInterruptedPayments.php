<?php

namespace App\Jobs;

use App\Services\Payments\PaymentRecoveryRunner;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use RuntimeException;

class RecoverInterruptedPayments implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout;

    public bool $failOnTimeout = true;

    public int $uniqueFor;

    public function __construct(
        public readonly int $batchSize = 100,
        public readonly ?int $staleAfterSeconds = null,
    ) {
        $this->timeout = (int) config(
            'background_jobs.payment_recovery.timeout_seconds',
            55,
        );
        $this->uniqueFor = (int) config(
            'background_jobs.payment_recovery.unique_seconds',
            90,
        );
        $this->onConnection((string) config('background_jobs.connection', 'database'));
        $this->onQueue((string) config('background_jobs.queues.critical', 'critical'));
        $this->afterCommit();
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 30, 90];
    }

    public function uniqueId(): string
    {
        return 'global-payment-recovery';
    }

    public function handle(PaymentRecoveryRunner $runner): void
    {
        $report = $runner->run($this->batchSize, $this->staleAfterSeconds);

        if ((int) ($report['errors'] ?? 0) > 0) {
            throw new RuntimeException(
                'Payment recovery completed with one or more isolated candidate errors.',
            );
        }
    }
}
