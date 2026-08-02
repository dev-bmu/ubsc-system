<?php

namespace App\Http\Requests;

use App\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PublicMembershipPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'payment_method' => ['required', Rule::in(['bca_va', 'qris', 'card'])],
            'idempotency_key' => ['required', 'uuid'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $membership = $this->route('membership');

        $this->merge([
            'idempotency_key' => $this->input('idempotency_key')
                ?: $this->header('Idempotency-Key')
                ?: ($membership instanceof Membership
                    ? $membership->registration_token
                    : null),
        ]);
    }
}
