<?php

namespace App\Notifications\Auth;

use Illuminate\Auth\Notifications\ResetPassword;

class ResetPasswordNotification extends ResetPassword
{
    public function __construct(
        #[\SensitiveParameter] string $token,
        private readonly ?string $returnTo = null,
    ) {
        parent::__construct($token);
    }

    /**
     * Keep the public page that initiated recovery attached to the signed
     * account-recovery journey without exposing an external redirect target.
     */
    protected function resetUrl($notifiable): string
    {
        $parameters = [
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ];

        if ($this->returnTo !== null) {
            $parameters['return_to'] = $this->returnTo;
        }

        return url(route('password.reset', $parameters, false));
    }
}
