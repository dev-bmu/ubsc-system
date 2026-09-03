<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerateReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-cms') ?? false;
    }

    protected function prepareForValidation(): void
    {
        $feedback = trim((string) $this->input('feedback', ''));

        $this->merge([
            'feedback' => $feedback !== '' ? $feedback : null,
        ]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'action' => ['bail', 'required', Rule::in(['approve', 'reject'])],
            'expected_version' => ['bail', 'required', 'integer', 'min:1'],
            'feedback' => [
                Rule::requiredIf($this->input('action') === 'reject'),
                'nullable',
                'string',
                'min:5',
                'max:500',
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'action.required' => 'Pilih keputusan moderasi.',
            'expected_version.required' => 'Versi ulasan tidak tersedia. Muat ulang halaman lalu coba lagi.',
            'feedback.required' => 'Berikan alasan yang jelas agar pengguna dapat memperbaiki ulasannya.',
            'feedback.min' => 'Alasan penolakan minimal 5 karakter.',
            'feedback.max' => 'Alasan penolakan maksimal 500 karakter.',
        ];
    }
}
