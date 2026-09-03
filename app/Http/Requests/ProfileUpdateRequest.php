<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProfileUpdateRequest extends FormRequest
{
    /**
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $emailRules = [
            'sometimes',
            'required',
            'string',
            'lowercase',
            'email',
            'max:255',
            Rule::unique('users')->ignore($this->user()->id),
        ];

        // A staff email is the login identity for a privileged account. Keep
        // self-service profile updates limited to non-identity attributes;
        // identity changes must go through an administrator-controlled flow.
        if ($this->routeIs('admin.account.profile.update')) {
            $emailRules[] = Rule::in([(string) $this->user()->email]);
        }

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => $emailRules,
            'birth_place' => ['nullable', 'string', 'max:100'],
            'birth_date' => ['nullable', 'date', 'before_or_equal:today'],
            'phone_number' => ['nullable', 'string', 'max:30'],
            'avatar' => ['nullable', 'image', 'mimes:jpeg,png,jpg', 'max:2048'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.in' => 'Alamat email staf dikelola oleh Administrator dan tidak dapat diubah dari profil ini.',
        ];
    }
}
