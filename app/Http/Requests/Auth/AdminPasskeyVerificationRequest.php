<?php

namespace App\Http\Requests\Auth;

use Laravel\Passkeys\Http\Requests\PasskeyVerificationRequest;

class AdminPasskeyVerificationRequest extends PasskeyVerificationRequest
{
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'credential.id' => ['required', 'string', 'max:4096'],
            'credential.rawId' => ['required', 'string', 'max:4096'],
            'credential.response.clientDataJSON' => ['required', 'string', 'max:131072'],
            'credential.response.authenticatorData' => ['required', 'string', 'max:131072'],
            'credential.response.signature' => ['required', 'string', 'max:131072'],
            'credential.response.userHandle' => ['nullable', 'string', 'max:4096'],
            'credential.clientExtensionResults' => ['nullable', 'array', 'max:32'],
        ];
    }
}
