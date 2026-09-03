<?php

namespace App\Notifications\Auth;

use App\Support\PublicReturnPath;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;

class ResetPasswordNotification extends ResetPassword implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(
        #[\SensitiveParameter] string $token,
        private readonly ?string $returnTo = null,
    ) {
        parent::__construct($token);
        $this->onConnection((string) config('background_jobs.connection', 'database'));
        $this->onQueue((string) config('background_jobs.queues.notifications', 'notifications'));
        $this->afterCommit();
    }

    /** @return array<int, int> */
    public function backoff(): array
    {
        return [10, 60, 300];
    }

    /**
     * Keep the public page that initiated recovery attached to the signed
     * account-recovery journey without exposing an external redirect target.
     */
    protected function resetUrl($notifiable): string
    {
        // Reset credentials live exclusively in the URL fragment. Browsers do
        // not send fragments in HTTP request lines, so reverse proxies, CDNs,
        // access logs, and analytics never receive the one-time token.
        $fragment = http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ], '', '&', PHP_QUERY_RFC3986);
        $entry = PublicReturnPath::modalEntry('reset', $this->returnTo);

        return url($entry).'#'.$fragment;
    }
}
