<?php

namespace App\Notifications\Auth;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;

class VerifyEmailNotification extends VerifyEmail implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct()
    {
        $this->onConnection((string) config('background_jobs.connection', 'database'));
        $this->onQueue((string) config('background_jobs.queues.notifications', 'notifications'));
        $this->afterCommit();
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 60, 300];
    }
}
