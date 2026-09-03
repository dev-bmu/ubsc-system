<?php

namespace App\Http\Requests\Auth;

use Laravel\Passkeys\Http\Requests\PasskeyRegistrationRequest;

class AdminPasskeyRegistrationRequest extends PasskeyRegistrationRequest
{
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'name' => ['required', 'string', 'max:120'],
            'credential.id' => ['required', 'string', 'max:4096'],
            'credential.rawId' => ['required', 'string', 'max:4096'],
            'credential.response.clientDataJSON' => ['required', 'string', 'max:131072'],
            'credential.response.attestationObject' => ['required', 'string', 'max:786432'],
            'credential.response.transports' => ['nullable', 'array', 'max:16'],
            'credential.response.transports.*' => ['string', 'max:32'],
            'credential.clientExtensionResults' => ['nullable', 'array', 'max:32'],
        ];
    }
}
